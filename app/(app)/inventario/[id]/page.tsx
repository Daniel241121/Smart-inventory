'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Camera, GitMerge, Pencil, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { listProductSummaries, listUnitsOfProduct, mergeProducts, removeProductPhoto, updateProduct, uploadProductPhoto } from '@/lib/api';
import { errorMessage, formatMoney, normalizeText, parseMoney, productName, statusLabel } from '@/lib/format';
import type { ProductSummary, UnitStatus } from '@/lib/types';
import { useQuery } from '@/lib/use-query';
import { IntakeModal } from '@/components/intake-modal';
import { ProductThumb } from '@/components/product-thumb';
import { StatusBadge } from '@/components/status-badge';
import { useToast } from '@/components/toast';
import { Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, LinkButton, Modal, PageHeader, Spinner, Stat, cn } from '@/components/ui';

type Filter = UnitStatus | 'todos';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const products = useQuery(listProductSummaries);
  const units = useQuery(() => listUnitsOfProduct(id), [id]);
  const [filter, setFilter] = useState<Filter>('todos');
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [intake, setIntake] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const product = products.data?.find((p) => p.id === id) ?? null;

  const sizesInStock = useMemo(() => {
    const counts = new Map<string, number>();
    (units.data ?? []).filter((u) => u.status === 'en_bodega').forEach((u) => counts.set(u.size, (counts.get(u.size) ?? 0) + 1));
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }));
  }, [units.data]);

  if (products.loading && !products.data) return <Spinner />;
  if (products.error) return <ErrorBox message={products.error} onRetry={products.reload} />;
  if (!product) return <ErrorBox message="Este modelo no existe o fue unido con otro." />;

  const visibleUnits = (units.data ?? []).filter((u) => filter === 'todos' || u.status === filter);

  async function handlePhoto(file: File | undefined) {
    if (!file || !product) return;
    setUploading(true);
    try {
      await uploadProductPhoto(product.id, file);
      toast('success', 'Foto actualizada.');
      products.reload();
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleRemovePhoto() {
    if (!product?.photo_url) return;
    try {
      await removeProductPhoto(product.id, product.photo_url);
      products.reload();
    } catch (err) {
      toast('error', errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        back={
          <Link href="/inventario" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Inventario
          </Link>
        }
        title={productName(product)}
        description={[product.brand, `${formatMoney(product.default_price)} por par`].filter(Boolean).join(' · ')}
        action={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
            <Button variant="secondary" onClick={() => setMerging(true)}>
              <GitMerge className="h-4 w-4" /> Unir con otro
            </Button>
            <Button onClick={() => setIntake(true)}>
              <Plus className="h-4 w-4" /> Ingresar pares
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <Card className="flex flex-row items-center gap-4 p-4 lg:flex-col lg:p-5">
          <button
            onClick={() => fileRef.current?.click()}
            className="group relative overflow-hidden rounded-xl"
            aria-label="Cambiar foto"
            disabled={uploading}
          >
            <ProductThumb url={product.photo_url} size="lg" className="h-28 w-28 lg:h-44 lg:w-44" />
            <span className="absolute inset-0 flex items-center justify-center bg-slate-900/50 text-white opacity-0 transition group-hover:opacity-100">
              <Camera className="h-6 w-6" />
            </span>
          </button>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              <Camera className="h-4 w-4" /> {product.photo_url ? 'Cambiar foto' : 'Agregar foto'}
            </Button>
            {product.photo_url && (
              <Button variant="ghost" size="sm" onClick={handleRemovePhoto}>
                <Trash2 className="h-4 w-4" /> Quitar
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0])} />
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="En bodega" value={product.en_bodega} />
            <Stat label="Prestados" value={product.prestado} />
            <Stat label="Vendidos" value={product.vendido} tone="success" />
          </div>
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-700">Tallas en bodega</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sizesInStock.length === 0 ? (
                    <span className="text-sm text-slate-500">Ninguna</span>
                  ) : (
                    sizesInStock.map(([size, count]) => (
                      <span key={size} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        T. {size} <span className="text-slate-400">×{count}</span>
                      </span>
                    ))
                  )}
                </div>
              </div>
              {product.en_bodega > 0 && (
                <LinkButton href={`/etiquetas?producto=${product.id}`} variant="secondary" size="sm">
                  <Printer className="h-4 w-4" /> Etiquetas de bodega ({product.en_bodega})
                </LinkButton>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title={`Pares (${units.data?.length ?? 0})`} description="Toca la impresora para reimprimir una etiqueta dañada" />
        <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-5 py-3">
          {(['todos', 'en_bodega', 'prestado', 'vendido', 'perdido'] as Filter[]).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset',
                filter === key ? 'bg-slate-900 text-white ring-slate-900' : 'text-slate-600 ring-slate-200 hover:bg-slate-50'
              )}
            >
              {key === 'todos' ? 'Todos' : statusLabel[key]}
            </button>
          ))}
        </div>
        {units.loading && !units.data ? (
          <Spinner />
        ) : visibleUnits.length === 0 ? (
          <EmptyState title="Sin pares en este estado" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleUnits.map((unit) => (
              <li key={unit.id} className="flex items-center gap-3 px-5 py-2.5">
                <span className="w-20 font-mono text-sm font-medium text-slate-900">{unit.code}</span>
                <span className="w-14 text-sm text-slate-600">T. {unit.size}</span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <StatusBadge status={unit.status} />
                  {unit.store && unit.store_id && (
                    <Link href={`/locales/${unit.store_id}`} className="truncate text-xs text-brand-600 hover:underline">
                      {unit.store.name}
                    </Link>
                  )}
                </div>
                <span className="hidden text-sm tabular-nums text-slate-600 sm:block">{formatMoney(unit.price)}</span>
                <Link
                  href={`/etiquetas?ids=${unit.id}`}
                  className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`Reimprimir etiqueta ${unit.code}`}
                  title="Reimprimir etiqueta"
                >
                  <Printer className="h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EditModal
        open={editing}
        onClose={() => setEditing(false)}
        product={product}
        onSaved={() => {
          products.reload();
          units.reload();
        }}
      />
      <MergeModal open={merging} onClose={() => setMerging(false)} product={product} products={products.data ?? []} />
      <IntakeModal open={intake} onClose={() => setIntake(false)} products={products.data ?? []} initialProduct={product} />
    </>
  );
}

function EditModal({ open, onClose, product, onSaved }: { open: boolean; onClose: () => void; product: ProductSummary; onSaved: () => void }) {
  const toast = useToast();
  const [reference, setReference] = useState(product.reference);
  const [brand, setBrand] = useState(product.brand ?? '');
  const [color, setColor] = useState(product.color ?? '');
  const [price, setPrice] = useState(String(product.default_price));
  const [applyToStock, setApplyToStock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);

  // Rellena el formulario cada vez que se abre.
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setReference(product.reference);
      setBrand(product.brand ?? '');
      setColor(product.color ?? '');
      setPrice(String(product.default_price));
      setApplyToStock(true);
    }
  }

  const priceValue = parseMoney(price);
  const priceChanged = priceValue !== Number(product.default_price);

  async function save() {
    setSaving(true);
    try {
      const changed = await updateProduct({ id: product.id, reference, brand, color, price: priceValue, applyToStock: priceChanged && applyToStock });
      toast('success', changed ? `Modelo actualizado. ${changed} pares en bodega cambiaron de precio.` : 'Modelo actualizado.');
      onSaved();
      onClose();
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar modelo"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!reference.trim()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Referencia">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>
          <Field label="Color">
            <Input value={color} onChange={(e) => setColor(e.target.value)} />
          </Field>
        </div>
        <Field label="Precio por par">
          <Input inputMode="numeric" value={price ? formatMoney(priceValue) : ''} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        {priceChanged && product.en_bodega > 0 && (
          <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <input type="checkbox" checked={applyToStock} onChange={(e) => setApplyToStock(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            <span>
              Aplicar el nuevo precio a los <strong>{product.en_bodega} pares en bodega</strong>.
              <span className="block text-xs text-slate-500">Los pares prestados conservan el precio con el que salieron.</span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}

function MergeModal({ open, onClose, product, products }: { open: boolean; onClose: () => void; product: ProductSummary; products: ProductSummary[] }) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<ProductSummary | null>(null);
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => {
    const term = normalizeText(search);
    return products.filter((p) => p.id !== product.id && (!term || normalizeText(`${p.reference}${p.brand}${p.color}`).includes(term))).slice(0, 20);
  }, [products, product.id, search]);

  function close() {
    setSearch('');
    setTarget(null);
    onClose();
  }

  async function merge() {
    if (!target) return;
    setSaving(true);
    try {
      const moved = await mergeProducts(product.id, target.id);
      toast('success', `${moved} pares movidos a "${productName(target)}".`);
      router.replace(`/inventario/${target.id}`);
    } catch (err) {
      toast('error', errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Unir con otro modelo"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={merge} loading={saving} disabled={!target}>
            Unir modelos
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Úsalo cuando el mismo zapato quedó creado dos veces. Los <strong>{product.total} pares</strong> de “{productName(product)}” pasan al modelo
          que elijas y este se borra. Los códigos QR no cambian.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar el modelo correcto" className="pl-9" autoFocus />
        </div>
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg ring-1 ring-slate-200">
          {options.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No hay otros modelos</li>}
          {options.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setTarget(p)}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', target?.id === p.id ? 'bg-brand-50' : 'hover:bg-slate-50')}
              >
                <ProductThumb url={p.photo_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{productName(p)}</p>
                  <p className="text-xs text-slate-500">
                    {p.brand && `${p.brand} · `}
                    {p.total} pares · {formatMoney(p.default_price)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
