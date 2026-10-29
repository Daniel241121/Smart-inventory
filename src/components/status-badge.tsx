import { movementLabel, statusLabel } from '@/lib/format';
import type { MovementType, UnitStatus } from '@/lib/types';
import { Badge } from './ui';

const statusTone = { en_bodega: 'slate', prestado: 'blue', vendido: 'green', perdido: 'red' } as const;
const movementTone = {
  ingreso: 'slate',
  prestamo: 'blue',
  devolucion: 'violet',
  venta: 'green',
  perdida: 'red',
  ajuste: 'amber'
} as const;

export function StatusBadge({ status }: { status: UnitStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

export function MovementBadge({ type }: { type: MovementType }) {
  return <Badge tone={movementTone[type]}>{movementLabel[type]}</Badge>;
}
