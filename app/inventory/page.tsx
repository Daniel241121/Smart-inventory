'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { InventoryUnit, listInventory } from '../../src/lib/inventory';
import { supabase } from '../../src/lib/supabaseClient';

const statusLabels = {
  available: 'Disponible',
  loaned: 'Prestado',
  sold: 'Vendido'
};

export default function InventoryPage() {
  const router = useRouter();
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadInventory() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/login');
        return;
      }

      try {
        setUnits(await listInventory());
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el inventario.');
      } finally {
        setLoading(false);
      }
    }

    void loadInventory();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <section className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">OPERACIÓN</p>
          <h1>Inventario</h1>
        </div>
        <div className="header-actions">
          <Link className="button-link" href="/intake">Nuevo ingreso</Link>
          <Link className="button-link" href="/outgoing">Salida diaria</Link>
          <button type="button" className="secondary-button" onClick={signOut}>Salir</button>
        </div>
      </header>
      {loading && <p className="muted">Cargando inventario...</p>}
      {error && <p className="form-error">{error}</p>}
      {!loading && !error && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Referencia</th><th>QR</th><th>Estado</th><th>Precio</th></tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td>{unit.product?.reference ?? 'Sin referencia'}</td>
                  <td>{unit.qr_code}</td>
                  <td><span className={`status status-${unit.status}`}>{statusLabels[unit.status]}</span></td>
                  <td>{unit.price == null ? '-' : `$${unit.price.toFixed(2)}`}</td>
                </tr>
              ))}
              {units.length === 0 && <tr><td colSpan={4}>No hay pares registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
