'use client';

import Link from 'next/link';
import { Plus, Search, Store } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createStore, listShoppingCenters, listStoreBalances } from '@/lib/api';
import { errorMessage, formatMoney, formatRelative } from '@/lib/format';
import { useQuery } from '@/lib/use-query';
import { useToast } from '@/components/toast';
import { Button, Card, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, cn } from '@/components/ui';

type Filter = 'todos' | 'prestamos' | 'deuda';

export default function StoresPage() {
  const { data, error, loading, reload } = useQuery(listStoreBalances);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');
  const [creating, setCreating] = useState(false);

  const stores = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((s) => {
      if (filter === 'prestamos' && s.pairs_on_loan === 0) return false;
      if (filter === 'deuda' && Number(s.balance_due) <= 0) return false;
      return (
        !term ||
        s.name.toLowerCase().includes(term) ||
        s.shopping_center_name.toLowerCase().includes(term) ||
        s.local_number?.toLowerCase().includes(term)
      );
    });
  }, [data, search, filter]);

  return (
    <>
      <PageHeader
        title="Locales"
        description="Los pares que tiene cada local, sus abonos y lo que debe"
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nuevo local
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar local o centro comercial" className="pl-9" />
        </div>
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm">
          {(
            [
              ['todos', 'Todos'],
              ['prestamos', 'Con pares'],
              ['deuda', 'Con deuda']
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 font-medium transition sm:flex-none',
                filter === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : stores.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Store className="h-6 w-6" />}
            title={data?.length ? 'Ningún local coincide' : 'Aún no hay locales'}
            description={data?.length ? 'Prueba con otra búsqueda o filtro.' : 'Agrega los locales de San Andresito a los que les prestas pares.'}
            action={!data?.length && <Button onClick={() => setCreating(true)}>Crear el primer local</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <Link key={store.id} href={`/locales/${store.id}`}>
              <Card className="h-full p-5 transition hover:border-brand-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{store.name}</p>
                    <p className="truncate text-sm text-slate-500">
                      {store.shopping_center_name}
                      {store.local_number && ` · Local ${store.local_number}`}
                    </p>
                  </div>
                  {!store.active && <span className="text-xs text-slate-400">Inactivo</span>}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                  <div>
                    <dt className="text-xs text-slate-500">Prestados</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{store.pairs_on_loan}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Abonos</dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-emerald-600">{formatMoney(store.total_abonos)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Debe</dt>
                    <dd
                      className={cn(
                        'mt-0.5 truncate text-sm font-semibold tabular-nums',
                        Number(store.balance_due) > 0 ? 'text-rose-600' : 'text-slate-400'
                      )}
                    >
                      {formatMoney(store.balance_due)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-slate-400">{formatRelative(store.last_activity_at)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewStoreModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
    </>
  );
}

function NewStoreModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const centers = useQuery(listShoppingCenters, [open]);
  const [centerId, setCenterId] = useState('');
  const [newCenter, setNewCenter] = useState('');
  const [name, setName] = useState('');
  const [localNumber, setLocalNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const isNewCenter = centerId === 'nuevo' || (centers.data?.length === 0 && !centerId);
  const canSave = name.trim() && (isNewCenter ? newCenter.trim() : centerId);

  function reset() {
    setCenterId('');
    setNewCenter('');
    setName('');
    setLocalNumber('');
    setContactName('');
    setPhone('');
  }

  async function save() {
    setSaving(true);
    try {
      await createStore({
        shoppingCenterId: isNewCenter ? null : centerId,
        newShoppingCenter: newCenter,
        name,
        localNumber,
        contactName,
        phone
      });
      toast('success', `Local "${name.trim()}" creado.`);
      reset();
      onCreated();
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
      title="Nuevo local"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!canSave}>
            Crear local
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Centro comercial">
          <Select value={isNewCenter ? 'nuevo' : centerId} onChange={(e) => setCenterId(e.target.value)}>
            <option value="" disabled>
              Selecciona…
            </option>
            {centers.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="nuevo">+ Agregar centro comercial</option>
          </Select>
        </Field>
        {isNewCenter && (
          <Field label="Nombre del centro comercial">
            <Input value={newCenter} onChange={(e) => setNewCenter(e.target.value)} placeholder="Ej. San Andresito de la 38" />
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Nombre del local">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tenis Express" />
            </Field>
          </div>
          <Field label="N.º local">
            <Input value={localNumber} onChange={(e) => setLocalNumber(e.target.value)} placeholder="214" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Encargado (opcional)">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label="Celular (opcional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
