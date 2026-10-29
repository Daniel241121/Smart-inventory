'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import QRCode from 'qrcode';
import { Suspense, useEffect, useState } from 'react';
import { listUnitsByIds, listUnitsOfProduct } from '@/lib/api';
import type { Unit } from '@/lib/types';
import { useQuery } from '@/lib/use-query';
import { Button, ErrorBox, Spinner, buttonClass } from '@/components/ui';

export default function LabelsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Labels />
    </Suspense>
  );
}

function Labels() {
  const params = useSearchParams();
  const ids = params.get('ids');
  const productId = params.get('producto');
  const { data, error, loading } = useQuery<Unit[]>(async () => {
    if (ids) return listUnitsByIds(ids.split(','));
    if (productId) return (await listUnitsOfProduct(productId)).filter((u) => u.status === 'en_bodega');
    return [];
  }, [ids, productId]);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 print:hidden">
        <Link href="/inventario" className={buttonClass('ghost', 'md')}>
          <ArrowLeft className="h-4 w-4" /> Inventario
        </Link>
        <p className="text-sm text-slate-500">{data?.length ?? 0} etiquetas · 50 × 30 mm</p>
        <Button onClick={() => window.print()} disabled={!data?.length}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="p-6">
          <ErrorBox message={error} />
        </div>
      ) : !data?.length ? (
        <p className="p-10 text-center text-sm text-slate-500">No hay pares en bodega para imprimir.</p>
      ) : (
        <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-3 p-6 print:block print:max-w-none print:p-0">
          {data.map((unit) => (
            <Label key={unit.id} unit={unit} />
          ))}
        </div>
      )}

      {/* Una etiqueta por página: formato de impresora térmica de rollo. */}
      <style>{`
        @media print {
          @page { size: 50mm 30mm; margin: 0; }
          .label { break-after: page; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; }
        }
      `}</style>
    </div>
  );
}

function Label({ unit }: { unit: Unit }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(unit.code, { margin: 0, width: 220, errorCorrectionLevel: 'M' }).then(setSrc);
  }, [unit.code]);

  return (
    <div className="label flex h-[30mm] w-[50mm] items-center gap-[2mm] overflow-hidden rounded border border-slate-300 bg-white p-[2mm] shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt={unit.code} className="h-[25mm] w-[25mm]" />}
      <div className="min-w-0 flex-1 leading-tight">
        <p className="font-mono text-[11pt] font-bold">{unit.code}</p>
        <p className="mt-[1mm] line-clamp-2 text-[7pt] font-medium">{unit.product.reference}</p>
        {unit.product.color && <p className="truncate text-[7pt]">{unit.product.color}</p>}
        <p className="mt-[1mm] text-[10pt] font-bold">T. {unit.size}</p>
      </div>
    </div>
  );
}
