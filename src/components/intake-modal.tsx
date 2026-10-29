'use client';

import { useRouter } from 'next/navigation';
import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { registerIntake, upsertProduct } from '@/lib/api';
import { errorMessage, formatMoney, normalizeText, parseMoney, productName } from '@/lib/format';
import type { ProductSummary } from '@/lib/types';
import { ProductThumb } from './product-thumb';
import { useToast } from './toast';
import { Button, Field, Input, Modal, cn } from './ui';

const COMMON_SIZES = ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'];

/**
 * Ingreso de pares a bodega. Al escribir la referencia sugiere los modelos existentes
 * para no crear duplicados ("AF1", "Air Force 1", "air force uno"…).
 */
export function IntakeModal({
  open,
  onClose,
  products,
  initialProduct
}: {
  open: boolean;
  onClose: () => void;
  products: ProductSummary[];
  initialProduct?: ProductSummary | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<ProductSummary | null>(null);
  const [reference, setReference] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [price, setPrice] = useState('');
  const [focused, setFocused] = useState(false);
  const [sizes, setSizes] = useState<string[]>(COMMON_SIZES);
  const [customSize, setCustomSize] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuantities({});
    setCustomSize('');
    setSizes(COMMON_SIZES);
    pick(initialProduct ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProduct]);

  function pick(product: ProductSummary | null) {
    setSelected(product);
    setReference(product?.reference ?? '');
    setBrand(product?.brand ?? '');
    setColor(product?.color ?? '');
    setPrice(product ? String(product.default_price) : '');
    setFocused(false);
  }

  const suggestions = useMemo(() => {
    const term = normalizeText(reference);
    if (!term || selected) return [];
    return products.filter((p) => normalizeText(`${p.reference}${p.brand}${p.color}`).includes(term)).slice(0, 6);
  }, [products, reference, selected]);

  // Si lo escrito coincide exacto con un modelo existente, se usa ese.
  const exactMatch = useMemo(
    () =>
      selected ??
      products.find((p) => normalizeText(p.reference) === normalizeText(reference) && normalizeText(p.color) === normalizeText(color)) ??
      null,
    [products, reference, color, selected]
  );

  const totalPairs = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const priceValue = parseMoney(price);

  function change(size: string, delta: number) {
    setQuantities((current) => ({ ...current, [size]: Math.max(0, (current[size] ?? 0) + delta) }));
  }

  function addCustomSize() {
    const size = customSize.trim();
    if (!size) return;
    if (!sizes.includes(size)) setSizes((current) => [...current, size]);
    change(size, 1);
    setCustomSize('');
  }

  async function save() {
    setSaving(true);
    try {
      const productId = exactMatch?.id ?? (await upsertProduct({ reference, brand, color, price: priceValue })).id;
      const sizeList = sizes.flatMap((size) => Array<string>(quantities[size] ?? 0).fill(size));
      const created = await registerIntake(productId, sizeList, priceValue);
      toast('success', `${created.length} pares ingresados. Imprime sus etiquetas.`);
      router.push(`/etiquetas?ids=${created.map((u) => u.id).join(',')}`);
    } catch (err) {
      toast('error', errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ingresar pares a bodega"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!reference.trim() || totalPairs === 0}>
            Ingresar {totalPairs || ''} {totalPairs === 1 ? 'par' : 'pares'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {selected ? (
          <div className="flex items-center gap-3 rounded-lg bg-brand-50 p-3 ring-1 ring-inset ring-brand-100">
            <ProductThumb url={selected.photo_url} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{productName(selected)}</p>
              <p className="text-xs text-slate-600">
                {selected.brand && `${selected.brand} · `}
                {selected.en_bodega} en bodega · {formatMoney(selected.default_price)}
              </p>
            </div>
            <button onClick={() => pick(null)} className="rounded-md p-1.5 text-slate-500 hover:bg-white" aria-label="Elegir otro modelo">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="relative col-span-2">
              <Field label="Referencia" hint="Escribe para buscar un modelo existente, o crea uno nuevo.">
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 150)}
                  placeholder="Ej. Air Force 1"
                  autoFocus
                  autoComplete="off"
                />
              </Field>
              {focused && suggestions.length > 0 && (
                <ul className="absolute inset-x-0 top-[4.5rem] z-10 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {suggestions.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(p)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <ProductThumb url={p.photo_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{productName(p)}</p>
                          <p className="text-xs text-slate-500">
                            {p.brand && `${p.brand} · `}
                            {formatMoney(p.default_price)} · {p.en_bodega} en bodega
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Field label="Marca">
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Nike" />
            </Field>
            <Field label="Color">
              <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="Blanco" />
            </Field>
            {exactMatch && (
              <p className="col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Ya existe “{productName(exactMatch)}”. Los pares se sumarán a ese modelo.{' '}
                <button className="font-semibold underline" onClick={() => pick(exactMatch as ProductSummary)}>
                  Usarlo
                </button>
              </p>
            )}
          </div>
        )}

        <Field label="Precio por par (lo que paga el local)">
          <Input inputMode="numeric" value={price ? formatMoney(priceValue) : ''} onChange={(e) => setPrice(e.target.value)} placeholder="$ 0" />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Cantidad por talla</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {sizes.map((size) => {
              const qty = quantities[size] ?? 0;
              return (
                <div
                  key={size}
                  className={cn('flex items-center justify-between rounded-lg px-2 py-1.5 ring-1 ring-inset', qty ? 'bg-brand-50 ring-brand-200' : 'ring-slate-200')}
                >
                  <span className="pl-1 text-sm font-medium text-slate-700">T. {size}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => change(size, -1)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={`Menos talla ${size}`}>
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-sm font-semibold tabular-nums">{qty}</span>
                    <button onClick={() => change(size, 1)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={`Más talla ${size}`}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={customSize}
              onChange={(e) => setCustomSize(e.target.value)}
              placeholder="Otra talla, ej. 9.5 US"
              onKeyDown={(e) => e.key === 'Enter' && addCustomSize()}
            />
            <Button variant="secondary" onClick={addCustomSize} disabled={!customSize.trim()}>
              Agregar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
