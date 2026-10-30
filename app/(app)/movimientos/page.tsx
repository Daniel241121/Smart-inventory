'use client';

import Link from 'next/link';
import { History } from 'lucide-react';
import { useState } from 'react';
import { listMovements, listPayments } from '@/lib/api';
import { formatDateTime, formatMoney, movementLabel, paymentKindLabel, paymentMethodLabel, productName } from '@/lib/format';
import type { MovementType } from '@/lib/types';
import { useQuery } from '@/lib/use-query';
import { MovementBadge } from '@/components/status-badge';
import { Badge, Card, EmptyState, ErrorBox, PageHeader, Spinner, cn } from '@/components/ui';

type Filter = MovementType | 'pagos' | 'todos';

const FILTERS: Filter[] = ['todos', 'prestamo', 'devolucion', 'venta', 'pagos', 'ingreso'];

export default function MovementsPage() {
  const [filter, setFilter] = useState<Filter>('todos');
  const movements = useQuery(
    () => (filter === 'pagos' ? Promise.resolve([]) : listMovements({ type: filter === 'todos' ? undefined : filter, limit: 200 })),
    [filter]
  );
  const payments = useQuery(() => (filter === 'pagos' || filter === 'todos' ? listPayments(undefined, 200) : Promise.resolve([])), [filter]);

  // Une movimientos y pagos en una sola línea de tiempo.
  const rows = [
    ...(movements.data ?? []).map((m) => ({ kind: 'movement' as const, at: m.created_at, m })),
    ...(payments.data ?? []).map((p) => ({ kind: 'payment' as const, at: p.created_at, p }))
  ].sort((a, b) => b.at.localeCompare(a.at));

  const loading = (movements.loading && !movements.data) || (payments.loading && !payments.data);
  const error = movements.error || payments.error;

  return (
    <>
      <PageHeader title="Historial" description="Todo lo que ha pasado, de lo más reciente a lo más antiguo" />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition',
              filter === key ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            )}
          >
            {key === 'todos' ? 'Todo' : key === 'pagos' ? 'Pagos y abonos' : movementLabel[key]}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<History className="h-6 w-6" />} title="Sin registros todavía" />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {rows.map((row) =>
              row.kind === 'movement' ? (
                <li key={row.m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <MovementBadge type={row.m.type} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-900">
                        {productName(row.m.unit.product)} <span className="text-slate-500">· T. {row.m.unit.size}</span>
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        <span className="font-mono">{row.m.unit.code}</span>
                        {row.m.store && (
                          <>
                            {' · '}
                            <Link href={`/locales/${row.m.store.id}`} className="text-brand-600 hover:underline">
                              {row.m.store.name}
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {row.m.type === 'venta' && <p className="text-sm font-medium tabular-nums">{formatMoney(row.m.amount)}</p>}
                    <p className="text-xs text-slate-500">{formatDateTime(row.m.created_at)}</p>
                  </div>
                </li>
              ) : (
                <li key={row.p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge tone={row.p.kind === 'abono' ? 'violet' : 'green'}>{paymentKindLabel[row.p.kind]}</Badge>
                    <div className="min-w-0">
                      <Link href={`/locales/${row.p.store_id}`} className="truncate text-sm text-slate-900 hover:underline">
                        {row.p.store?.name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {paymentMethodLabel[row.p.method]}
                        {row.p.notes && ` · ${row.p.notes}`}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-emerald-600">{formatMoney(row.p.amount)}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(row.p.created_at)}</p>
                  </div>
                </li>
              )
            )}
          </ul>
        </Card>
      )}
    </>
  );
}
