'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listStores, registerLoanBatch, StoreOption } from '../../src/lib/inventory';
import { supabase } from '../../src/lib/supabaseClient';

export default function OutgoingPage() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return router.replace('/login');
      try { setStores(await listStores()); } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los locales.');
      }
    }
    void load();
  }, [router]);

  function addCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = qrCode.trim();
    if (normalized && !codes.includes(normalized)) setCodes((current) => [...current, normalized]);
    setQrCode('');
  }

  async function confirmLoan() {
    setSaving(true);
    setError('');
    try {
      await registerLoanBatch(storeId, codes);
      setCodes([]);
      setQrCode('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo registrar la salida.');
    } finally { setSaving(false); }
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <div><p className="eyebrow">OPERACIÓN DIARIA</p><h1>Salida a local</h1></div>
        <button type="button" className="secondary-button" onClick={() => router.push('/inventory')}>Inventario</button>
      </header>
      <div className="intake-form outgoing-form">
        <label>Local destino<select value={storeId} onChange={(event) => setStoreId(event.target.value)} required><option value="">Selecciona un local</option>{stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>
        <form onSubmit={addCode} className="scan-form"><label>Escanear o escribir QR<input autoFocus value={qrCode} onChange={(event) => setQrCode(event.target.value)} placeholder="SHU-000123" /></label><button type="submit">Agregar par</button></form>
        {error && <p className="form-error">{error}</p>}
        <div className="scan-list"><strong>{codes.length} par(es) preparados</strong>{codes.length === 0 ? <p className="muted">Los códigos aparecerán aquí antes de confirmar.</p> : <ul>{codes.map((code) => <li key={code}>{code}<button type="button" className="remove-button" onClick={() => setCodes((current) => current.filter((item) => item !== code))}>Quitar</button></li>)}</ul>}</div>
        <button type="button" disabled={!storeId || codes.length === 0 || saving} onClick={confirmLoan}>{saving ? 'Registrando...' : 'Confirmar salida'}</button>
      </div>
    </section>
  );
}