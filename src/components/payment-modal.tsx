'use client';

import { useEffect, useState } from 'react';
import { registerPayment } from '@/lib/api';
import { errorMessage, formatMoney, paymentMethodLabel, parseMoney } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';
import { Button, Field, Input, Modal, cn } from './ui';
import { useToast } from './toast';

export function PaymentModal({
  open,
  onClose,
  onSaved,
  storeId,
  storeName,
  balanceDue
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  storeId: string;
  storeName: string;
  balanceDue: number;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount('');
      setMethod('efectivo');
      setNotes('');
    }
  }, [open]);

  const value = parseMoney(amount);

  async function save() {
    setSaving(true);
    try {
      await registerPayment({ storeId, amount: value, method, notes });
      toast('success', `Pago de ${formatMoney(value)} registrado para ${storeName}.`);
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
      title={`Registrar pago · ${storeName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="success" onClick={save} loading={saving} disabled={value <= 0}>
            Guardar pago
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
          Saldo actual: <span className="font-semibold text-slate-900">{formatMoney(balanceDue)}</span>
        </div>
        <Field label="Valor recibido">
          <Input
            inputMode="numeric"
            value={amount ? formatMoney(value) : ''}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="$ 0"
            className="h-12 text-lg font-semibold"
            autoFocus
          />
        </Field>
        {balanceDue > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setAmount(String(balanceDue))}>
            Pagó todo ({formatMoney(balanceDue)})
          </Button>
        )}
        <Field label="Medio de pago">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(paymentMethodLabel) as PaymentMethod[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMethod(key)}
                className={cn(
                  'rounded-lg px-3 py-2.5 text-sm font-medium ring-1 ring-inset transition',
                  method === key ? 'bg-brand-50 text-brand-700 ring-brand-500' : 'text-slate-600 ring-slate-200 hover:bg-slate-50'
                )}
              >
                {paymentMethodLabel[key]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Nota (opcional)">
          <Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. abono, recibió Juan" />
        </Field>
      </div>
    </Modal>
  );
}
