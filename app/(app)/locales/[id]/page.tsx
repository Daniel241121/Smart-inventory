'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Banknote, CheckCircle2, Circle, Footprints, Phone, Receipt } from 'lucide-react';
import { useState } from 'react';
import { getStoreBalance, listMovements, listPayments, listUnitsAtStore } from '@/lib/api';
import { daysSince, formatDateTime, formatMoney, paymentKindLabel, paymentMethodLabel, productName } from '@/lib/format';
import { useQuery } from '@/lib/use-query';
import { MovementBadge } from '@/components/status-badge';
import { PaymentModal } from '@/components/payment-modal';
import { ProductThumb } from '@/components/product-thumb';
import { SellModal } from '@/components/sell-modal';
import { Badge, Button, Card, EmptyState, ErrorBox, LinkButton, PageHeader, Spinner, Stat, cn } from '@/components/ui';

type Tab = 'prestados' | 'movimientos' | 'pagos';

export default function StoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const store = useQuery(() => getStoreBalance(id), [id]);
  const units = useQuery(() => listUnitsAtStore(id), [id]);
  const movements = useQuery(() => listMovements({ storeId: id, limit: 200 }), [id]);
  const payments = useQuery(() => listPayments(id, 200), [id]);
  const [tab, setTab] = useState<Tab>('prestados');
  const [paying, setPaying] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selling, setSelling] = useState(false);

  if (store.loading && !store.data) return <Spinner />;
  if (store.error || !store.data) return <ErrorBox message={store.error ?? 'Local no encontrado'} onRetry={store.reload} />;
  const s = store.data;
  const selectedUnits = (units.data ?? []).filter((u) => selected.has(u.code));
  const selectedTotal = selectedUnits.reduce((sum, u) => sum + Number(u.price), 0);

  function toggleSelected(code: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function refreshMoney() {
    store.reload();
    payments.reload();
  }

  function refreshAll() {
    setSelected(new Set());
    store.reload();
    units.reload();
    movements.reload();
    payments.reload();
  }

  return (
    <>
      <PageHeader
        back={
          <Link href="/locales" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Locales
          </Link>
        }
        title={s.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {s.shopping_center_name}
              {s.local_number && ` · Local ${s.local_number}`}
            </span>
            {s.contact_name && <span>{s.contact_name}</span>}
            {s.phone && (
              <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 text-brand-600">
                <Phone className="h-3.5 w-3.5" />
                {s.phone}
              </a>
            )}
          </span>
        }
        action={
          <>
            <LinkButton href={`/prestar?local=${s.id}`} variant="secondary">
              <ArrowUpFromLine className="h-4 w-4" /> Prestar
            </LinkButton>
            <LinkButton href={`/recoger?local=${s.id}`} variant="secondary">
              <ArrowDownToLine className="h-4 w-4" /> Recoger
            </LinkButton>
            <Button variant="success" onClick={() => setPaying(true)}>
              <Banknote className="h-4 w-4" /> Registrar abono
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Pares prestados" value={s.pairs_on_loan} hint={formatMoney(s.value_on_loan)} icon={<Footprints className="h-4 w-4" />} />
        <Stat label="Vendido y pagado" value={formatMoney(s.total_sold)} tone="success" icon={<Receipt className="h-4 w-4" />} />
        <Stat
          label="Abonos"
          value={formatMoney(s.total_abonos)}
          hint={Number(s.credit_available) > 0 ? `${formatMoney(s.credit_available)} a favor para próximas ventas` : undefined}
          icon={<Banknote className="h-4 w-4" />}
        />
        <Stat
          label="Debe"
          value={formatMoney(s.balance_due)}
          tone={Number(s.balance_due) > 0 ? 'danger' : 'default'}
          hint={Number(s.balance_due) < 0 ? 'Tiene saldo a favor' : 'Valor de sus pares − abonos'}
        />
      </div>

      <Card className="mt-6">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-3">
          {(
            [
              ['prestados', `En préstamo (${s.pairs_on_loan})`],
              ['movimientos', 'Movimientos'],
              ['pagos', 'Pagos y abonos']
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition',
                tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'prestados' &&
          (units.loading && !units.data ? (
            <Spinner />
          ) : !units.data?.length ? (
            <EmptyState icon={<Footprints className="h-6 w-6" />} title="Sin pares prestados" description="Este local no tiene pares en este momento." />
          ) : (
            <>
              <p className="border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs text-slate-500">
                ¿El local vino a pagar? Selecciona los pares y toca <strong>Registrar venta</strong>.
              </p>
              <ul className="divide-y divide-slate-100">
                {units.data.map((unit) => {
                  const days = daysSince(unit.loaned_at);
                  const isSelected = selected.has(unit.code);
                  return (
                    <li key={unit.id}>
                      <button
                        onClick={() => toggleSelected(unit.code)}
                        className={cn('flex w-full items-center gap-3 px-5 py-3 text-left transition', isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50')}
                        aria-pressed={isSelected}
                      >
                        {isSelected ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                        ) : (
                          <Circle className="h-5 w-5 shrink-0 text-slate-300" />
                        )}
                        <ProductThumb url={unit.product.photo_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{productName(unit.product)}</p>
                          <p className="text-xs text-slate-500">
                            <span className="font-mono">{unit.code}</span> · Talla {unit.size}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium tabular-nums text-slate-900">{formatMoney(unit.price)}</p>
                          {days >= 3 ? (
                            <Badge tone="amber">{days} días</Badge>
                          ) : (
                            <p className="text-xs text-slate-500">{days === 0 ? 'Hoy' : days === 1 ? 'Ayer' : `${days} días`}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ))}

        {tab === 'movimientos' &&
          (movements.loading && !movements.data ? (
            <Spinner />
          ) : !movements.data?.length ? (
            <EmptyState title="Sin movimientos" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {movements.data.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <MovementBadge type={m.type} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900">{productName(m.unit.product)}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{m.unit.code}</span> · Talla {m.unit.size}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {m.type === 'venta' && <p className="text-sm font-medium tabular-nums text-slate-900">{formatMoney(m.amount)}</p>}
                    <p className="text-xs text-slate-500">{formatDateTime(m.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'pagos' &&
          (payments.loading && !payments.data ? (
            <Spinner />
          ) : !payments.data?.length ? (
            <EmptyState
              icon={<Banknote className="h-6 w-6" />}
              title="Sin pagos ni abonos"
              action={<Button onClick={() => setPaying(true)}>Registrar abono</Button>}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.data.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge tone={p.kind === 'abono' ? 'violet' : 'green'}>{paymentKindLabel[p.kind]}</Badge>
                    <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600">{formatMoney(p.amount)}</p>
                    <p className="truncate text-xs text-slate-500">
                      {paymentMethodLabel[p.method]}
                      {p.notes && ` · ${p.notes}`}
                    </p>
                    </div>
                  </div>
                  <p className="shrink-0 text-xs text-slate-500">{formatDateTime(p.created_at)}</p>
                </li>
              ))}
            </ul>
          ))}
      </Card>

      <PaymentModal
        open={paying}
        onClose={() => setPaying(false)}
        onSaved={refreshMoney}
        storeId={s.id}
        storeName={s.name}
        balanceDue={Number(s.balance_due)}
      />
      <SellModal
        open={selling}
        onClose={() => setSelling(false)}
        onSaved={refreshAll}
        storeId={s.id}
        storeName={s.name}
        units={selectedUnits}
        credit={Number(s.credit_available)}
      />

      {tab === 'prestados' && selectedUnits.length > 0 && (
        <>
          <div className="h-20" />
          <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:bottom-0 lg:left-60">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div className="text-sm">
                <p className="text-slate-500">
                  {selectedUnits.length} {selectedUnits.length === 1 ? 'par seleccionado' : 'pares seleccionados'}
                </p>
                <p className="text-lg font-semibold tabular-nums text-slate-900">{formatMoney(selectedTotal)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setSelected(new Set())}>
                  Quitar
                </Button>
                <Button size="lg" variant="success" onClick={() => setSelling(true)}>
                  <Receipt className="h-4 w-4" /> Registrar venta
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
