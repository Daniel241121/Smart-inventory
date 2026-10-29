'use client';

import { ChevronRight, Search, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import { listStoreBalances } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { StoreBalance } from '@/lib/types';
import { useQuery } from '@/lib/use-query';
import { Card, EmptyState, ErrorBox, Input, LinkButton, Spinner } from './ui';

/** Lista de locales con buscador, agrupada por centro comercial. */
export function StorePicker({ onPick, emphasis }: { onPick: (store: StoreBalance) => void; emphasis: 'loans' | 'debt' }) {
  const { data, error, loading, reload } = useQuery(listStoreBalances);
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const stores = (data ?? []).filter(
      (s) =>
        s.active &&
        (!term ||
          s.name.toLowerCase().includes(term) ||
          s.shopping_center_name.toLowerCase().includes(term) ||
          s.local_number?.toLowerCase().includes(term))
    );
    // En recogida, primero los que tienen pares afuera.
    if (emphasis === 'loans') stores.sort((a, b) => b.pairs_on_loan - a.pairs_on_loan);
    const map = new Map<string, StoreBalance[]>();
    stores.forEach((s) => map.set(s.shopping_center_name, [...(map.get(s.shopping_center_name) ?? []), s]));
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data, search, emphasis]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data?.length)
    return (
      <Card>
        <EmptyState
          icon={<Store className="h-6 w-6" />}
          title="Aún no hay locales"
          description="Crea el primer local para empezar a prestar pares."
          action={<LinkButton href="/locales">Ir a locales</LinkButton>}
        />
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar local, número o centro comercial"
          className="h-12 pl-9 text-base"
        />
      </div>
      {groups.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Ningún local coincide con la búsqueda.</p>}
      {groups.map(([center, stores]) => (
        <div key={center}>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{center}</p>
          <Card className="divide-y divide-slate-100">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => onPick(store)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50 active:bg-slate-100"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {store.name}
                    {store.local_number && <span className="font-normal text-slate-500"> · Local {store.local_number}</span>}
                  </p>
                  <p className="text-sm text-slate-500">
                    {store.pairs_on_loan} {store.pairs_on_loan === 1 ? 'par prestado' : 'pares prestados'}
                    {store.balance_due > 0 && <span className="text-rose-600"> · Debe {formatMoney(store.balance_due)}</span>}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
              </button>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}
