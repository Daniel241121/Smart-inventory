'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Banknote, Boxes, Footprints, Wallet } from 'lucide-react';
import { getTodaySummary, listStoreBalances } from '@/lib/api';
import { daysSince, formatMoney, formatRelative } from '@/lib/format';
import { useQuery } from '@/lib/use-query';
import { Badge, Card, CardHeader, EmptyState, ErrorBox, LinkButton, PageHeader, Spinner, Stat } from '@/components/ui';

const OVERDUE_DAYS = 3;

export default function DashboardPage() {
  const stores = useQuery(listStoreBalances);
  const today = useQuery(getTodaySummary);

  if ((stores.loading && !stores.data) || (today.loading && !today.data)) return <Spinner />;
  if (stores.error || today.error) return <ErrorBox message={(stores.error || today.error)!} onRetry={stores.reload} />;

  const all = stores.data ?? [];
  const pairsOut = all.reduce((sum, s) => sum + s.pairs_on_loan, 0);
  const valueOut = all.reduce((sum, s) => sum + Number(s.value_on_loan), 0);
  const debt = all.reduce((sum, s) => sum + Math.max(0, Number(s.balance_due)), 0);
  const withActivity = all
    .filter((s) => s.pairs_on_loan > 0 || Number(s.balance_due) > 0)
    .sort((a, b) => Number(b.balance_due) - Number(a.balance_due) || b.pairs_on_loan - a.pairs_on_loan);
  const overdue = all.filter((s) => s.pairs_on_loan > 0 && daysSince(s.oldest_loan_at) >= OVERDUE_DAYS).length;
  const t = today.data!;

  return (
    <>
      <PageHeader
        title="Resumen"
        description="Cómo está la bodega hoy"
        action={
          <div className="hidden gap-2 sm:flex">
            <LinkButton href="/prestar" variant="secondary">
              <ArrowUpFromLine className="h-4 w-4" /> Prestar
            </LinkButton>
            <LinkButton href="/recoger">
              <ArrowDownToLine className="h-4 w-4" /> Recoger
            </LinkButton>
          </div>
        }
      />

      {/* Accesos rápidos para el trabajador en celular */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:hidden">
        <Link href="/prestar" className="flex flex-col gap-3 rounded-xl bg-brand-600 p-4 text-white shadow-card active:bg-brand-700">
          <ArrowUpFromLine className="h-6 w-6" />
          <span className="font-semibold">Prestar pares</span>
        </Link>
        <Link href="/recoger" className="flex flex-col gap-3 rounded-xl bg-slate-900 p-4 text-white shadow-card active:bg-slate-800">
          <ArrowDownToLine className="h-6 w-6" />
          <span className="font-semibold">Recoger / cobrar</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Pares en la calle" value={pairsOut} hint={formatMoney(valueOut)} icon={<Footprints className="h-4 w-4" />} />
        <Stat
          label="Por cobrar"
          value={formatMoney(debt)}
          tone={debt > 0 ? 'danger' : 'default'}
          hint="Vendido sin pagar"
          icon={<Wallet className="h-4 w-4" />}
        />
        <Stat
          label="Cobrado hoy"
          value={formatMoney(t.collectedToday)}
          tone="success"
          hint={`${t.soldToday} vendidos hoy`}
          icon={<Banknote className="h-4 w-4" />}
        />
        <Stat
          label="En bodega"
          value={t.inStock}
          hint={`Hoy: ${t.lentToday} prestados · ${t.returnedToday} devueltos`}
          icon={<Boxes className="h-4 w-4" />}
        />
      </div>

      {overdue > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {overdue === 1 ? '1 local tiene' : `${overdue} locales tienen`} pares prestados hace {OVERDUE_DAYS} días o más.
        </div>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Locales con préstamos o saldo"
          description="Ordenados por lo que deben"
          action={
            <Link href="/locales" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Ver todos
            </Link>
          }
        />
        {withActivity.length === 0 ? (
          <EmptyState
            icon={<Footprints className="h-6 w-6" />}
            title="Todo al día"
            description="Ningún local tiene pares prestados ni saldo pendiente."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {withActivity.map((store) => {
              const days = daysSince(store.oldest_loan_at);
              return (
                <Link
                  key={store.id}
                  href={`/locales/${store.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition hover:bg-slate-50 sm:grid-cols-[2fr_1fr_1fr_1fr]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{store.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {store.shopping_center_name}
                      {store.local_number && ` · Local ${store.local_number}`} · {formatRelative(store.last_activity_at)}
                    </p>
                  </div>
                  <div className="text-right sm:text-left">
                    <p className="text-sm font-semibold tabular-nums text-slate-900">{store.pairs_on_loan} pares</p>
                    {store.pairs_on_loan > 0 && (
                      <p className="text-xs">
                        {days >= OVERDUE_DAYS ? <Badge tone="amber">{days} días</Badge> : <span className="text-slate-500">{formatMoney(store.value_on_loan)}</span>}
                      </p>
                    )}
                  </div>
                  <div className="hidden sm:block">
                    <p className="text-xs text-slate-500">Pagado</p>
                    <p className="text-sm tabular-nums text-slate-700">{formatMoney(store.total_paid)}</p>
                  </div>
                  <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:block">
                    <p className="text-xs text-slate-500">Debe</p>
                    <p className={`text-sm font-semibold tabular-nums ${Number(store.balance_due) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {formatMoney(store.balance_due)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
