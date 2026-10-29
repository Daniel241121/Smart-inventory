export type UnitStatus = 'en_bodega' | 'prestado' | 'vendido' | 'perdido';
export type MovementType = 'ingreso' | 'prestamo' | 'devolucion' | 'venta' | 'perdida' | 'ajuste';
export type PaymentMethod = 'efectivo' | 'transferencia' | 'otro';

export type ShoppingCenter = { id: string; name: string };

export type StoreBalance = {
  id: string;
  name: string;
  local_number: string | null;
  contact_name: string | null;
  phone: string | null;
  active: boolean;
  shopping_center_id: string;
  shopping_center_name: string;
  pairs_on_loan: number;
  value_on_loan: number;
  oldest_loan_at: string | null;
  total_sold: number;
  total_paid: number;
  balance_due: number;
  last_activity_at: string | null;
};

export type Product = {
  id: string;
  reference: string;
  brand: string | null;
  color: string | null;
  default_price: number;
  photo_url: string | null;
};

export type ProductSummary = Product & {
  total: number;
  en_bodega: number;
  prestado: number;
  vendido: number;
};

export type Unit = {
  id: string;
  code: string;
  size: string;
  price: number;
  status: UnitStatus;
  store_id: string | null;
  loaned_at: string | null;
  created_at: string;
  product: Pick<Product, 'reference' | 'brand' | 'color' | 'photo_url'>;
  store?: { name: string } | null;
};

export type Movement = {
  id: string;
  type: MovementType;
  amount: number | null;
  notes: string | null;
  created_at: string;
  unit: { code: string; size: string; product: Pick<Product, 'reference' | 'color'> };
  store: { id: string; name: string } | null;
};

export type Payment = {
  id: string;
  store_id: string;
  amount: number;
  method: PaymentMethod;
  notes: string | null;
  created_at: string;
  store?: { name: string } | null;
};
