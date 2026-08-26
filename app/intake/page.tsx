'use client';

import { FormEvent, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useRouter } from 'next/navigation';
import { registerEntry } from '../../src/lib/inventory';
import { supabase } from '../../src/lib/supabaseClient';

type CreatedUnit = { id: string; qr_code: string; image?: string };

export default function IntakePage() {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [createdUnits, setCreatedUnits] = useState<CreatedUnit[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
    });
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setCreatedUnits([]);

    try {
      const units = await registerEntry({
        reference: reference.trim(),
        price: price ? Number(price) : null,
        quantity: Number(quantity)
      });
      const withImages = await Promise.all(units.map(async (unit) => ({
        ...unit,
        image: await QRCode.toDataURL(unit.qr_code, { margin: 1, width: 160 })
      })));
      setCreatedUnits(withImages);
      setReference('');
      setPrice('');
      setQuantity('1');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo registrar el ingreso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <div><p className="eyebrow">BODEGA</p><h1>Nuevo ingreso</h1></div>
        <button type="button" className="secondary-button" onClick={() => router.push('/inventory')}>Inventario</button>
      </header>
      <form onSubmit={handleSubmit} className="intake-form">
        <label>Referencia<input value={reference} onChange={(event) => setReference(event.target.value)} required /></label>
        <label>Precio<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
        <label>Cantidad de pares<input type="number" min="1" max="100" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? 'Registrando...' : 'Registrar y generar QR'}</button>
      </form>
      {createdUnits.length > 0 && <section className="qr-grid"><h2>Etiquetas generadas</h2>{createdUnits.map((unit) => <article className="qr-label" key={unit.id}><img src={unit.image} alt={`Código QR ${unit.qr_code}`} /><strong>{unit.qr_code}</strong></article>)}</section>}
    </section>
  );
}