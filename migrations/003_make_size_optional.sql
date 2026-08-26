-- La talla ya no es necesaria para el ingreso del MVP.
ALTER TABLE public.shoe_units
  ALTER COLUMN size DROP NOT NULL;