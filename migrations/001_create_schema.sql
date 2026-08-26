-- Migration: esquema inicial según spec-sistema-inventario-tenis
-- Ejecutar en Supabase / Postgres

-- shopping_centers
CREATE TABLE IF NOT EXISTS public.shopping_centers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  route_order integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shopping_centers_pkey PRIMARY KEY (id)
);

-- stores
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shopping_center_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT stores_pkey PRIMARY KEY (id),
  CONSTRAINT stores_shopping_center_id_fkey FOREIGN KEY (shopping_center_id) REFERENCES public.shopping_centers(id)
);

-- store_locations
CREATE TABLE IF NOT EXISTS public.store_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['prestamo'::text, 'mostrario'::text])),
  name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT store_locations_pkey PRIMARY KEY (id),
  CONSTRAINT store_locations_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.stores(id),
  CONSTRAINT store_locations_unique_type UNIQUE (store_id, type)
);

-- products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reference text NOT NULL,
  default_price numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id)
);

-- shoe_units
CREATE TABLE IF NOT EXISTS public.shoe_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  qr_code text NOT NULL UNIQUE,
  size text NOT NULL,
  status text NOT NULL DEFAULT 'available'::text CHECK (status = ANY (ARRAY['available'::text, 'loaned'::text, 'sold'::text])),
  current_location_id uuid,
  price numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT shoe_units_pkey PRIMARY KEY (id),
  CONSTRAINT shoe_units_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT shoe_units_current_location_id_fkey FOREIGN KEY (current_location_id) REFERENCES public.store_locations(id)
);

-- movements
CREATE TABLE IF NOT EXISTS public.movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shoe_unit_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['ingreso'::text, 'salida'::text, 'devolucion'::text, 'venta'::text, 'ajuste'::text])),
  location_id uuid,
  requested_by_text text,
  payment_method text CHECK (payment_method = ANY (ARRAY['cash'::text, 'transfer'::text, 'card'::text, 'pending'::text])),
  sale_price numeric,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT movements_pkey PRIMARY KEY (id),
  CONSTRAINT movements_shoe_unit_id_fkey FOREIGN KEY (shoe_unit_id) REFERENCES public.shoe_units(id),
  CONSTRAINT movements_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.store_locations(id),
  CONSTRAINT movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

-- daily_routes
CREATE TABLE IF NOT EXISTS public.daily_routes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_date date NOT NULL,
  operator_id uuid NOT NULL,
  shopping_center_id uuid NOT NULL,
  order_in_route integer,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'done'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_routes_pkey PRIMARY KEY (id),
  CONSTRAINT daily_routes_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES auth.users(id),
  CONSTRAINT daily_routes_shopping_center_id_fkey FOREIGN KEY (shopping_center_id) REFERENCES public.shopping_centers(id)
);

-- day_closings
CREATE TABLE IF NOT EXISTS public.day_closings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  closing_date date NOT NULL,
  location_id uuid NOT NULL,
  pending_units_count integer NOT NULL DEFAULT 0,
  pending_units_snapshot jsonb,
  closed_by uuid NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT day_closings_pkey PRIMARY KEY (id),
  CONSTRAINT day_closings_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.store_locations(id),
  CONSTRAINT day_closings_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES auth.users(id)
);

-- Índices para las consultas principales del inventario y los pendientes.
CREATE INDEX IF NOT EXISTS shoe_units_status_location_idx
  ON public.shoe_units (status, current_location_id);
CREATE INDEX IF NOT EXISTS movements_shoe_unit_created_at_idx
  ON public.movements (shoe_unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS movements_location_created_at_idx
  ON public.movements (location_id, created_at DESC);
CREATE INDEX IF NOT EXISTS daily_routes_operator_date_idx
  ON public.daily_routes (operator_id, route_date, order_in_route);
CREATE INDEX IF NOT EXISTS day_closings_location_date_idx
  ON public.day_closings (location_id, closing_date DESC);

-- Mantiene updated_at sincronizado cuando cambia un par.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shoe_units_set_updated_at ON public.shoe_units;
CREATE TRIGGER shoe_units_set_updated_at
  BEFORE UPDATE ON public.shoe_units
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- En el MVP todos los usuarios autenticados comparten permisos.
ALTER TABLE public.shopping_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shoe_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can manage shopping centers"
  ON public.shopping_centers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated users can manage stores"
  ON public.stores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated users can manage store locations"
  ON public.store_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated users can manage products"
  ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated users can manage shoe units"
  ON public.shoe_units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated users can manage movements"
  ON public.movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated users can manage daily routes"
  ON public.daily_routes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated users can manage day closings"
  ON public.day_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);
