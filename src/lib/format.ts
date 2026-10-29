import type { MovementType, PaymentMethod, UnitStatus } from './types';

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

export function formatMoney(value: number | null | undefined) {
  return money.format(Number(value ?? 0));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Bogota'
  }).format(new Date(value));
}

export function daysSince(value: string | null) {
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

export function formatRelative(value: string | null) {
  if (!value) return 'Sin actividad';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Ayer' : `Hace ${days} días`;
}

/** Inicio del día actual en Bogotá, como ISO para filtrar en Supabase. */
export function startOfTodayBogota() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  return new Date(`${today}T00:00:00-05:00`).toISOString();
}

export function parseMoney(value: string) {
  return Number(value.replace(/[^\d]/g, '')) || 0;
}

export const statusLabel: Record<UnitStatus, string> = {
  en_bodega: 'En bodega',
  prestado: 'Prestado',
  vendido: 'Vendido',
  perdido: 'Perdido'
};

export const movementLabel: Record<MovementType, string> = {
  ingreso: 'Ingreso',
  prestamo: 'Préstamo',
  devolucion: 'Devolución',
  venta: 'Venta',
  perdida: 'Pérdida',
  ajuste: 'Ajuste'
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  otro: 'Otro'
};

export function productName(product: { reference: string; color?: string | null }) {
  return product.color ? `${product.reference} · ${product.color}` : product.reference;
}

/** Para comparar textos sin importar mayúsculas, tildes, espacios ni guiones ("Air-Force 1" = "airforce1"). */
export function normalizeText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Convierte los mensajes de error de Postgres/Supabase en texto legible. */
export function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: string }).message);
  }
  return 'Ocurrió un error inesperado.';
}
