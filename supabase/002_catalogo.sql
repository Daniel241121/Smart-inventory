-- =====================================================================
-- Smart Inventory — 002: catálogo de modelos
-- Pegar completo en Supabase > SQL Editor > Run. No borra datos.
-- =====================================================================

-- Foto del modelo
alter table public.products add column if not exists photo_url text;

-- Espacio público para las fotos (solo el equipo con sesión puede subir)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "equipo sube fotos" on storage.objects;
drop policy if exists "equipo actualiza fotos" on storage.objects;
drop policy if exists "equipo borra fotos" on storage.objects;
create policy "equipo sube fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-photos');
create policy "equipo actualiza fotos" on storage.objects
  for update to authenticated using (bucket_id = 'product-photos');
create policy "equipo borra fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'product-photos');

-- Editar un modelo. Si cambia el precio, opcionalmente lo aplica a los pares
-- que siguen en bodega (los prestados conservan el precio con que salieron).
create or replace function public.update_product(
  p_product_id uuid,
  p_reference text,
  p_brand text,
  p_color text,
  p_price numeric,
  p_apply_to_stock boolean default true
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  if coalesce(trim(p_reference), '') = '' then
    raise exception 'La referencia es obligatoria';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Precio inválido';
  end if;

  update products
  set reference = trim(p_reference),
      brand = nullif(trim(p_brand), ''),
      color = nullif(trim(p_color), ''),
      default_price = p_price
  where id = p_product_id;
  if not found then
    raise exception 'El modelo no existe';
  end if;

  if p_apply_to_stock then
    update shoe_units set price = p_price
    where product_id = p_product_id and status = 'en_bodega' and price <> p_price;
    get diagnostics v_updated = row_count;
  end if;
  return v_updated;
end;
$$;

-- Unir un modelo duplicado dentro de otro: mueve todos sus pares y lo borra.
create or replace function public.merge_products(p_from uuid, p_into uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_moved integer;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  if p_from = p_into then
    raise exception 'Elige un modelo distinto';
  end if;
  if not exists (select 1 from products where id = p_into) then
    raise exception 'El modelo destino no existe';
  end if;

  update shoe_units set product_id = p_into where product_id = p_from;
  get diagnostics v_moved = row_count;

  delete from products where id = p_from;
  if not found then
    raise exception 'El modelo a unir no existe';
  end if;
  return v_moved;
end;
$$;

revoke execute on function public.update_product(uuid, text, text, text, numeric, boolean) from public, anon;
revoke execute on function public.merge_products(uuid, uuid) from public, anon;
grant execute on function public.update_product(uuid, text, text, text, numeric, boolean) to authenticated;
grant execute on function public.merge_products(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
