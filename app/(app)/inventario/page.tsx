'use client';

import Link from 'next/link';
import { Boxes, ChevronRight, Plus, Printer, Search } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { findUnitByCode, listProductSummaries } from '@/lib/api';
import { formatDateTime, formatMoney, normalizeText, productName } from '@/lib/format';
import type { Unit } from '@/lib/types';
import { useQuery } from '@/lib/use-query';
import { IntakeModal } from '@/components/intake-modal';
import { ProductThumb } from '@/components/product-thumb';
import { StatusBadge } from '@/components/status-badge';
import { Button, Card, EmptyState, ErrorBox, Input, LinkButton, PageHeader, Spinner } from '@/components/ui';

export default function InventoryPage() {
  const { data, error, loading, reload } = useQuery(listProductSummaries);
  const [search, setSearch] = useState('');
  const [intakeOpen, setIntakeOpen] = useState(false);

  const products = useMemo(() => {
    const term = normalizeText(search);
    return (data ?? []).filter((p) => !term || normalizeText(`${p.reference}${p.brand}${p.color}`).includes(term));
  }, [data, search]);

  const totals = (data ?? []).reduce(
    (acc, p) => ({ en_bodega: acc.en_bodega + p.en_bodega, prestado: acc.prestado + p.prestado, vendido: acc.vendido + p.vendido }),
    { en_bodega: 0, prestado: 0, vendido: 0 }
  );

  return (
    <>
      <PageHeader
        title="Inventario"
        description={`${data?.length ?? 0} modelos · ${totals.en_bodega} en bodega · ${totals.prestado} prestados · ${totals.vendido} vendidos`}
        action={
          <Button onClick={() => setIntakeOpen(true)}>
            <Plus className="h-4 w-4" /> Ingresar pares
          </Button>
        }
      />

      <CodeLookup />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar modelo, marca o color" className="pl-9" />
      </div>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : products.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes className="h-6 w-6" />}
            title={data?.length ? 'Ningún modelo coincide' : 'La bodega está vacía'}
            description={data?.length ? undefined : 'Ingresa los primeros pares para generar sus códigos QR.'}
            action={!data?.length && <Button onClick={() => setIntakeOpen(true)}>Ingresar pares</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[2.5fr_repeat(4,1fr)_auto] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-500 sm:grid">
            <span>Modelo</span>
            <span>Precio</span>
            <span>Bodega</span>
            <span>Prestados</span>
            <span>Vendidos</span>
            <span className="w-5" />
          </div>
          <ul className="divide-y divide-slate-100">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/inventario/${p.id}`}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 transition hover:bg-slate-50 sm:grid-cols-[2.5fr_repeat(4,1fr)_auto]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <ProductThumb url={p.photo_url} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{productName(p)}</p>
                      <p className="truncate text-xs text-slate-500">
                        {p.brand}
                        <span className="sm:hidden">
                          {p.brand && ' · '}
                          {p.en_bodega} en bodega · {p.prestado} prestados
                        </span>
                      </p>
                    </div>
                  </div>
                  <span className="text-right text-sm tabular-nums text-slate-700 sm:text-left">{formatMoney(p.default_price)}</span>
                  <span className="hidden text-sm font-semibold tabular-nums text-slate-900 sm:block">{p.en_bodega}</span>
                  <span className="hidden text-sm tabular-nums text-brand-700 sm:block">{p.prestado}</span>
                  <span className="hidden text-sm tabular-nums text-emerald-700 sm:block">{p.vendido}</span>
                  <ChevronRight className="hidden h-5 w-5 text-slate-300 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <IntakeModal open={intakeOpen} onClose={() => setIntakeOpen(false)} products={data ?? []} />
    </>
  );
}

/** Buscar un par por código: dónde está y reimprimir su etiqueta. */
function CodeLookup() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Unit | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      setResult(await findUnitByCode(code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mb-4 p-4">
      <form onSubmit={lookup} className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Buscar un par por código, ej. P-000123"
          className="uppercase"
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" loading={loading} disabled={!code.trim()}>
          Buscar
        </Button>
      </form>
      {result === null && <p className="mt-3 text-sm text-slate-500">No existe un par con ese código.</p>}
      {result && (
        <div className="mt-3 flex flex-col gap-3 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ProductThumb url={result.product.photo_url} />
            <div className="min-w-0 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold">{result.code}</span>
                <StatusBadge status={result.status} />
              </p>
              <p className="truncate text-slate-700">
                {productName(result.product)} · Talla {result.size} · {formatMoney(result.price)}
              </p>
              {result.store && result.store_id && (
                <p className="text-slate-500">
                  En{' '}
                  <Link href={`/locales/${result.store_id}`} className="font-medium text-brand-600">
                    {result.store.name}
                  </Link>
                  {result.loaned_at && ` desde ${formatDateTime(result.loaned_at)}`}
                </p>
              )}
            </div>
          </div>
          <LinkButton href={`/etiquetas?ids=${result.id}`} variant="secondary" size="sm">
            <Printer className="h-4 w-4" /> Reimprimir etiqueta
          </LinkButton>
        </div>
      )}
    </Card>
  );
}
