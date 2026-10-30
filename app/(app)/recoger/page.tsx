'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Circle, PackageCheck } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { getStoreBalance, listUnitsAtStore, settleVisit } from '@/lib/api';
import { errorMessage, formatMoney, paymentMethodLabel, productName } from '@/lib/format';
import type { PaymentMethod, Unit } from '@/lib/types';
import { useQuery } from '@/lib/use-query';
import { ProductThumb } from '@/components/product-thumb';
import { Scanner, type ScanOutcome } from '@/components/scanner';
import { StorePicker } from '@/components/store-picker';
import { useToast } from '@/components/toast';
import { Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, LinkButton, PageHeader, Spinner, cn } from '@/components/ui';

export default function CollectPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Collect />
    </Suspense>
  );
}

function Collect() {
  const router = useRouter();
  const storeId = useSearchParams().get('local');

  if (!storeId) {
    return (
      <>
        <PageHeader title="Recoger y cobrar" description="¿En qué local estás?" />
        <StorePicker emphasis="loans" onPick={(store) => router.replace(`/recoger?local=${store.id}`)} />
      </>
    );
  }
  return <CollectAtStore storeId={storeId} />;
}

type Step = 'escanear' | 'resolver';

function CollectAtStore({ storeId }: { storeId: string }) {
  const router = useRouter();
  const toast = useToast();
  const store = useQuery(() => getStoreBalance(storeId), [storeId]);
  const expected = useQuery(() => listUnitsAtStore(storeId), [storeId]);

  const [step, setStep] = useState<Step>('escanear');
  const [returned, setReturned] = useState<Set<string>>(new Set());
  const [sold, setSold] = useState<Set<string>>(new Set());
  const [lastError, setLastError] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const units = useMemo(() => expected.data ?? [], [expected.data]);
  const byCode = useMemo(() => new Map(units.map((u) => [u.code, u])), [units]);
  const pending = units.filter((u) => !returned.has(u.code));
  const soldUnits = pending.filter((u) => sold.has(u.code));
  const owedUnits = pending.filter((u) => !sold.has(u.code));
  const sum = (list: Unit[]) => list.reduce((total, u) => total + Number(u.price), 0);
  const soldAmount = sum(soldUnits);
  const returnedAmount = sum(units.filter((u) => returned.has(u.code)));
  // Los abonos que el local tenga sin usar se descuentan del cobro de los vendidos.
  const credit = Math.max(0, Number(store.data?.credit_available ?? 0));
  const creditUsed = Math.min(soldAmount, credit);
  const toReceive = soldAmount - creditUsed;

  // Cualquier cambio en el dinero obliga a confirmar de nuevo.
  useEffect(() => setConfirmed(false), [toReceive]);

  const hasChanges = returned.size > 0 || sold.size > 0;
  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  function handleScan(code: string): ScanOutcome {
    if (!byCode.has(code)) {
      setLastError(`${code} no está prestado a este local.`);
      return 'error';
    }
    if (returned.has(code)) return 'repeated';
    setLastError(null);
    setReturned((current) => new Set(current).add(code));
    setSold((current) => {
      const next = new Set(current);
      next.delete(code);
      return next;
    });
    return 'ok';
  }

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, code: string) {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setter(next);
  }

  async function confirm() {
    if (!store.data) return;
    setSaving(true);
    try {
      const result = await settleVisit({
        storeId,
        returned: [...returned],
        sold: soldUnits.map((u) => u.code),
        paymentMethod: method,
        notes
      });
      const parts = [
        result.returned && `${result.returned} devueltos`,
        result.sold && `${result.sold} vendidos`,
        result.received && `recibido ${formatMoney(result.received)}`
      ].filter(Boolean);
      toast('success', `${store.data.name}: ${parts.join(', ') || 'visita registrada'}.`);
      setReturned(new Set());
      setSold(new Set());
      router.push(`/locales/${storeId}`);
    } catch (err) {
      toast('error', errorMessage(err));
      setSaving(false);
    }
  }

  if ((store.loading && !store.data) || (expected.loading && !expected.data)) return <Spinner />;
  if (store.error || !store.data) return <ErrorBox message={store.error ?? 'Local no encontrado'} />;
  if (expected.error) return <ErrorBox message={expected.error} onRetry={expected.reload} />;

  const s = store.data;
  const balanceBefore = Number(s.balance_due);
  const balanceAfter = balanceBefore - returnedAmount - toReceive;
  const nothingToSave = !returned.size && !soldUnits.length;
  const needsConfirmation = toReceive > 0 && !confirmed;

  const header = (
    <PageHeader
      back={
        <button
          onClick={() => (step === 'resolver' ? setStep('escanear') : router.replace('/recoger'))}
          className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" /> {step === 'resolver' ? 'Volver a escanear' : 'Cambiar local'}
        </button>
      }
      title={s.name}
      description={`${s.shopping_center_name} · ${s.pairs_on_loan} pares · Debe ${formatMoney(s.balance_due)}`}
    />
  );

  // ---------- Paso 1: escanear lo que devuelven ----------
  if (step === 'escanear') {
    return (
      <>
        {header}
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            {units.length > 0 && <Scanner onScan={handleScan} />}
            {lastError && <ErrorBox message={lastError} />}
          </div>

          <Card>
            <CardHeader
              title={`Devueltos ${returned.size} de ${units.length}`}
              description="Escanea lo que el local devuelve. Si un QR no lee, toca el par."
            />
            {units.length === 0 ? (
              <EmptyState
                icon={<PackageCheck className="h-6 w-6" />}
                title="Este local no tiene pares prestados"
                description="Los abonos se registran desde la ficha del local."
                action={<LinkButton href={`/locales/${storeId}`} variant="secondary">Ir al local</LinkButton>}
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {units.map((unit) => {
                  const done = returned.has(unit.code);
                  return (
                    <li key={unit.id}>
                      <button
                        onClick={() => toggle(returned, setReturned, unit.code)}
                        className={cn('flex w-full items-center gap-3 px-5 py-3 text-left transition', done ? 'bg-emerald-50/60' : 'hover:bg-slate-50')}
                      >
                        {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-slate-300" />}
                        <UnitLine unit={unit} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {units.length > 0 && (
          <BottomBar>
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{returned.size}</span> devueltos · {pending.length} sin devolver
            </p>
            <Button size="lg" onClick={() => setStep('resolver')}>
              Continuar
            </Button>
          </BottomBar>
        )}
      </>
    );
  }

  // ---------- Paso 2: vendidos (se cobran descontando abonos) y confirmación ----------
  return (
    <>
      {header}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title={`Sin devolver (${pending.length})`}
            description="Por defecto el local los sigue debiendo. Marca “Vendido” si lo paga ahora."
          />
          {pending.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title="Todo lo prestado volvió o no había pares" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((unit) => {
                const isSold = sold.has(unit.code);
                return (
                  <li key={unit.id} className={cn('flex items-center gap-3 px-5 py-3 transition', isSold && 'bg-emerald-50/60')}>
                    <UnitLine unit={unit} />
                    <div className="flex shrink-0 rounded-lg bg-slate-100 p-1 text-xs font-medium">
                      <button
                        onClick={() => isSold && toggle(sold, setSold, unit.code)}
                        className={cn('rounded-md px-2.5 py-1.5', !isSold ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500')}
                      >
                        Lo debe
                      </button>
                      <button
                        onClick={() => !isSold && toggle(sold, setSold, unit.code)}
                        className={cn('rounded-md px-2.5 py-1.5', isSold ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500')}
                      >
                        Vendido
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {soldUnits.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-emerald-50 px-5 py-3 text-sm">
              <span className="text-emerald-800">
                {soldUnits.length} {soldUnits.length === 1 ? 'par vendido' : 'pares vendidos'}
              </span>
              <span className="font-semibold tabular-nums text-emerald-800">{formatMoney(soldAmount)}</span>
            </div>
          )}
        </Card>

        <Card className="h-fit p-5">
          <h2 className="text-sm font-semibold text-slate-900">Resumen de la visita</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Devueltos a bodega" value={`${returned.size} · ${formatMoney(returnedAmount)}`} />
            <Row label="Siguen debiendo" value={`${owedUnits.length} · ${formatMoney(sum(owedUnits))}`} />
            <div className="space-y-2 border-t border-slate-100 pt-2">
              <Row label={`Pares vendidos (${soldUnits.length})`} value={formatMoney(soldAmount)} />
              {credit > 0 && (
                <Row label={`Abonos a favor (tiene ${formatMoney(credit)})`} value={creditUsed ? `− ${formatMoney(creditUsed)}` : formatMoney(0)} tone="green" />
              )}
              <Row label="Total a recibir" value={formatMoney(toReceive)} strong />
            </div>
            <div className="space-y-2 border-t border-slate-100 pt-2">
              <Row label="Debía antes" value={formatMoney(balanceBefore)} />
              <Row label="Queda debiendo" value={formatMoney(balanceAfter)} strong />
              {credit - creditUsed > 0 && <Row label="Abonos que quedan a favor" value={formatMoney(credit - creditUsed)} tone="green" />}
            </div>
          </dl>

          {toReceive > 0 && (
            <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
              <Field label="Medio de pago">
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => setMethod(key)}
                      className={cn(
                        'rounded-lg px-2 py-2 text-sm font-medium ring-1 ring-inset',
                        method === key ? 'bg-brand-50 text-brand-700 ring-brand-500' : 'text-slate-600 ring-slate-200'
                      )}
                    >
                      {paymentMethodLabel[key]}
                    </button>
                  ))}
                </div>
              </Field>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg p-3 text-sm ring-1 ring-inset transition',
                  confirmed ? 'bg-emerald-50 ring-emerald-300' : 'bg-amber-50 ring-amber-200'
                )}
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-slate-300 text-emerald-600"
                />
                <span>
                  Confirmo que recibí <strong className="tabular-nums">{formatMoney(toReceive)}</strong> en {paymentMethodLabel[method].toLowerCase()}.
                </span>
              </label>
            </div>
          )}
          <div className="mt-4">
            <Field label="Nota (opcional)">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. quedó de devolver el resto el lunes" />
            </Field>
          </div>
        </Card>
      </div>

      <BottomBar>
        <div className="text-sm">
          <p className="text-slate-500">Total a recibir</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{formatMoney(toReceive)}</p>
        </div>
        <Button size="lg" variant="success" onClick={confirm} loading={saving} disabled={nothingToSave || needsConfirmation}>
          {needsConfirmation ? 'Confirma el pago' : 'Guardar visita'}
        </Button>
      </BottomBar>
    </>
  );
}

function UnitLine({ unit }: { unit: Unit }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <ProductThumb url={unit.product.photo_url} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{productName(unit.product)}</p>
        <p className="text-xs text-slate-500">
          <span className="font-mono">{unit.code}</span> · Talla {unit.size} · {formatMoney(unit.price)}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'green' }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'font-semibold text-slate-900' : tone === 'green' ? 'text-emerald-700' : 'text-slate-700')}>{value}</dd>
    </div>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="h-24" />
      <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">{children}</div>
      </div>
    </>
  );
}
