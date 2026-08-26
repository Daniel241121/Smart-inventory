-- Corrección de RLS para instalaciones que ya ejecutaron 001_create_schema.sql.
-- Ejecutar una sola vez en Supabase SQL Editor.

ALTER TABLE public.shopping_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shoe_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users can manage shopping centers" ON public.shopping_centers;
DROP POLICY IF EXISTS "authenticated users can manage stores" ON public.stores;
DROP POLICY IF EXISTS "authenticated users can manage store locations" ON public.store_locations;
DROP POLICY IF EXISTS "authenticated users can manage products" ON public.products;
DROP POLICY IF EXISTS "authenticated users can manage shoe units" ON public.shoe_units;
DROP POLICY IF EXISTS "authenticated users can manage movements" ON public.movements;
DROP POLICY IF EXISTS "authenticated users can manage daily routes" ON public.daily_routes;
DROP POLICY IF EXISTS "authenticated users can manage day closings" ON public.day_closings;

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
