'use client';

import { useEffect, useState } from 'react';
import { settleVisit } from '@/lib/api';
import { errorMessage, formatMoney, paymentMethodLabel, productName } from '@/lib/format';
import type { PaymentMethod, Unit } from '@/lib/types';
import { ProductThumb } from './product-thumb';
import { useToast } from './toast';
import { Button, Field, Input, Modal, cn } from './ui';

/**
 * Venta de pares que el local tenía prestados, registrada desde su ficha
 * (por ejemplo, cuando el dueño va a la bodega a pagarlos). Descuenta los abonos a favor.
 */
export function SellModal({
  open,
  onClose,
  onSaved,
  storeId,
  storeName,
  units,
  credit
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  storeId: string;
  storeName: string;
  units: Unit[];
  credit: number;
}) {
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod('efectivo');
      setNotes('');
      setConfirmed(false);
    }
  }, [open]);

  const soldAmount = units.reduce((sum, u) => sum + Number(u.price), 0);
  const creditUsed = Math.min(soldAmount, Math.max(0, credit));
  const toReceive = soldAmount - creditUsed;

  async function save() {
    setSaving(true);
    try {
      const result = await settleVisit({
        storeId,
        returned: [],
        sold: units.map((u) => u.code),
        paymentMethod: method,
        notes
      });
      toast(
        'success',
        `${storeName}: ${result.sold} ${result.sold === 1 ? 'par vendido' : 'pares vendidos'}` +
          (result.received ? `, recibido ${formatMoney(result.received)}.` : ', cubierto con abonos.')
      );
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
      title={`Registrar venta · ${storeName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={save} loading={saving} disabled={!units.length || (toReceive > 0 && !confirmed)}>
            {toReceive > 0 && !confirmed ? 'Confirma el pago' : 'Guardar venta'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {units.map((unit) => (
            <li key={unit.id} className="flex items-center gap-3 px-3 py-2">
              <ProductThumb url={unit.product.photo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{productName(unit.product)}</p>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{unit.code}</span> · Talla {unit.size}
                </p>
              </div>
              <span className="text-sm tabular-nums text-slate-700">{formatMoney(unit.price)}</span>
            </li>
          ))}
        </ul>

        <dl className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Pares vendidos ({units.length})</dt>
            <dd className="tabular-nums text-slate-700">{formatMoney(soldAmount)}</dd>
          </div>
          {credit > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Abonos a favor (tiene {formatMoney(credit)})</dt>
              <dd className="tabular-nums text-emerald-700">− {formatMoney(creditUsed)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2">
            <dt className="font-medium text-slate-900">Total a recibir</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">{formatMoney(toReceive)}</dd>
          </div>
        </dl>

        {toReceive > 0 && (
          <>
            <Field label="Medio de pago">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((key) => (
                  <button
                    key={key}
                    type="button"
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
          </>
        )}

        <Field label="Nota (opcional)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. vino a pagar a la bodega" />
        </Field>
      </div>
    </Modal>
  );
}
