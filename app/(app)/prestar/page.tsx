'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ScanLine, Trash2 } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { findUnitByCode, getStoreBalance, lendUnits } from '@/lib/api';
import { errorMessage, formatMoney, productName, statusLabel } from '@/lib/format';
import type { Unit } from '@/lib/types';
import { useQuery } from '@/lib/use-query';
import { ProductThumb } from '@/components/product-thumb';
import { Scanner, type ScanOutcome } from '@/components/scanner';
import { StorePicker } from '@/components/store-picker';
import { useToast } from '@/components/toast';
import { Button, Card, CardHeader, EmptyState, ErrorBox, PageHeader, Spinner } from '@/components/ui';

export default function LendPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Lend />
    </Suspense>
  );
}

function Lend() {
  const router = useRouter();
  const storeId = useSearchParams().get('local');

  if (!storeId) {
    return (
      <>
        <PageHeader title="Prestar pares" description="¿A qué local van los pares?" />
        <StorePicker emphasis="debt" onPick={(store) => router.replace(`/prestar?local=${store.id}`)} />
      </>
    );
  }
  return <LendToStore storeId={storeId} />;
}

function LendToStore({ storeId }: { storeId: string }) {
  const router = useRouter();
  const toast = useToast();
  const store = useQuery(() => getStoreBalance(storeId), [storeId]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Evita perder lo escaneado si se cierra la pestaña sin confirmar.
  useEffect(() => {
    if (!units.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [units.length]);

  async function handleScan(code: string): Promise<ScanOutcome> {
    if (units.some((u) => u.code === code)) return 'repeated';
    try {
      const unit = await findUnitByCode(code);
      if (!unit) {
        setLastError(`${code}: este código no existe.`);
        return 'error';
      }
      if (unit.status !== 'en_bodega') {
        const where = unit.status === 'prestado' && unit.store ? ` en ${unit.store.name}` : '';
        setLastError(`${code}: está ${statusLabel[unit.status].toLowerCase()}${where}.`);
        return 'error';
      }
      setLastError(null);
      setUnits((current) => (current.some((u) => u.id === unit.id) ? current : [unit, ...current]));
      return 'ok';
    } catch (err) {
      setLastError(errorMessage(err));
      return 'error';
    }
  }

  async function confirm() {
    setSaving(true);
    try {
      const count = await lendUnits(
        storeId,
        units.map((u) => u.code)
      );
      toast('success', `${count} ${count === 1 ? 'par prestado' : 'pares prestados'} a ${store.data?.name}.`);
      setUnits([]);
      router.push(`/locales/${storeId}`);
    } catch (err) {
      toast('error', errorMessage(err));
      setSaving(false);
    }
  }

  if (store.loading && !store.data) return <Spinner />;
  if (store.error || !store.data) return <ErrorBox message={store.error ?? 'Local no encontrado'} />;

  const total = units.reduce((sum, u) => sum + Number(u.price), 0);

  return (
    <>
      <PageHeader
        back={
          <button
            onClick={() => router.replace('/prestar')}
            className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" /> Cambiar local
          </button>
        }
        title={`Prestar a ${store.data.name}`}
        description={`${store.data.shopping_center_name} · Ya tiene ${store.data.pairs_on_loan} pares prestados`}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Scanner onScan={handleScan} />
          {lastError && <ErrorBox message={lastError} />}
        </div>

        <Card>
          <CardHeader title={`Pares a prestar (${units.length})`} description={units.length ? formatMoney(total) : 'Escanea cada par que sale'} />
          {units.length === 0 ? (
            <EmptyState icon={<ScanLine className="h-6 w-6" />} title="Nada escaneado todavía" description="Pasa la cámara por los QR; cada par suma con un pitido." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {units.map((unit) => (
                <li key={unit.id} className="flex items-center gap-3 px-5 py-3">
                  <ProductThumb url={unit.product.photo_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{productName(unit.product)}</p>
                    <p className="text-xs text-slate-500">
                      <span className="font-mono">{unit.code}</span> · Talla {unit.size} · {formatMoney(unit.price)}
                    </p>
                  </div>
                  <button
                    onClick={() => setUnits((current) => current.filter((u) => u.id !== unit.id))}
                    className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Quitar ${unit.code}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {units.length > 0 && <div className="h-20" />}
      {units.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:bottom-0 lg:left-60">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{units.length} pares</span> · {formatMoney(total)}
            </p>
            <Button size="lg" onClick={confirm} loading={saving}>
              Confirmar préstamo
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
