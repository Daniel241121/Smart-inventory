-- =====================================================================
-- Smart Inventory — esquema v2
-- Pegar completo en Supabase > SQL Editor > Run.
--
-- ATENCIÓN: borra TODAS las tablas y datos del esquema anterior.
-- Los usuarios de Auth (correos y contraseñas) NO se borran.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Limpieza del esquema anterior
-- ---------------------------------------------------------------------
drop view if exists public.store_balances cascade;
drop table if exists public.day_closings cascade;
drop table if exists public.daily_routes cascade;
drop table if exists public.payments cascade;
drop table if exists public.movements cascade;
drop table if exists public.shoe_units cascade;
drop table if exists public.store_locations cascade;
drop table if exists public.products cascade;
drop table if exists public.stores cascade;
drop table if exists public.shopping_centers cascade;
drop sequence if exists public.shoe_unit_code_seq;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.register_intake(uuid, text[], numeric);
drop function if exists public.lend_units(uuid, text[]);
drop function if exists public.settle_visit(uuid, text[], text[], numeric, text, text);

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------

-- Centros comerciales de San Andresito (agrupan locales).
create table public.shopping_centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
create unique index shopping_centers_name_key on public.shopping_centers (lower(name));

-- Locales a los que se les prestan pares.
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  shopping_center_id uuid not null references public.shopping_centers (id),
  name text not null,
  local_number text,
  contact_name text,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index stores_center_idx on public.stores (shopping_center_id);

-- Referencias de producto (modelo + color).
create table public.products (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  brand text,
  color text,
  default_price numeric(12, 0) not null default 0 check (default_price >= 0),
  created_at timestamptz not null default now()
);
create unique index products_reference_color_key
  on public.products (lower(reference), lower(coalesce(color, '')));

-- Cada par físico. El código corto (P-000001) es lo que lleva el QR.
create sequence public.shoe_unit_code_seq;

create table public.shoe_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    default ('P-' || lpad(nextval('public.shoe_unit_code_seq')::text, 6, '0')),
  product_id uuid not null references public.products (id),
  size text not null,
  price numeric(12, 0) not null check (price >= 0),
  status text not null default 'en_bodega'
    check (status in ('en_bodega', 'prestado', 'vendido', 'perdido')),
  store_id uuid references public.stores (id),
  loaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un par tiene local asignado si y solo si está prestado.
  constraint shoe_units_loan_consistency
    check ((status = 'prestado') = (store_id is not null))
);
create index shoe_units_store_status_idx on public.shoe_units (store_id, status);
create index shoe_units_product_idx on public.shoe_units (product_id);

-- Historial: cada cosa que le pasa a un par.
create table public.movements (
  id uuid primary key default gen_random_uuid(),
  shoe_unit_id uuid not null references public.shoe_units (id) on delete cascade,
  store_id uuid references public.stores (id),
  type text not null
    check (type in ('ingreso', 'prestamo', 'devolucion', 'venta', 'perdida', 'ajuste')),
  amount numeric(12, 0),
  notes text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index movements_store_created_idx on public.movements (store_id, created_at desc);
create index movements_unit_created_idx on public.movements (shoe_unit_id, created_at desc);
create index movements_created_idx on public.movements (created_at desc);

-- Pagos y abonos que hace cada local por lo vendido.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id),
  amount numeric(12, 0) not null check (amount > 0),
  method text not null default 'efectivo'
    check (method in ('efectivo', 'transferencia', 'otro')),
  notes text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index payments_store_created_idx on public.payments (store_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shoe_units_set_updated_at
  before update on public.shoe_units
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Vista de saldos por local
--    saldo = total vendido - total pagado
-- ---------------------------------------------------------------------
create view public.store_balances
with (security_invoker = true)
as
select
  s.id,
  s.name,
  s.local_number,
  s.contact_name,
  s.phone,
  s.active,
  s.shopping_center_id,
  sc.name as shopping_center_name,
  coalesce(l.pairs_on_loan, 0)::int as pairs_on_loan,
  coalesce(l.value_on_loan, 0) as value_on_loan,
  l.oldest_loan_at,
  coalesce(v.total_sold, 0) as total_sold,
  coalesce(p.total_paid, 0) as total_paid,
  coalesce(v.total_sold, 0) - coalesce(p.total_paid, 0) as balance_due,
  greatest(v.last_movement_at, p.last_payment_at) as last_activity_at
from public.stores s
join public.shopping_centers sc on sc.id = s.shopping_center_id
left join lateral (
  select count(*) as pairs_on_loan, sum(u.price) as value_on_loan, min(u.loaned_at) as oldest_loan_at
  from public.shoe_units u
  where u.store_id = s.id and u.status = 'prestado'
) l on true
left join lateral (
  select sum(m.amount) filter (where m.type = 'venta') as total_sold, max(m.created_at) as last_movement_at
  from public.movements m
  where m.store_id = s.id
) v on true
left join lateral (
  select sum(pa.amount) as total_paid, max(pa.created_at) as last_payment_at
  from public.payments pa
  where pa.store_id = s.id
) p on true;

-- ---------------------------------------------------------------------
-- 3. Operaciones atómicas (todo o nada)
-- ---------------------------------------------------------------------

-- Ingreso a bodega: crea un par por cada talla de la lista (se puede repetir).
create function public.register_intake(p_product_id uuid, p_sizes text[], p_price numeric)
returns setof public.shoe_units
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  if coalesce(array_length(p_sizes, 1), 0) = 0 then
    raise exception 'Agrega al menos una talla';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Precio inválido';
  end if;

  return query
  with inserted as (
    insert into shoe_units (product_id, size, price)
    select p_product_id, trim(s.size), p_price
    from unnest(p_sizes) with ordinality as s(size, ord)
    where trim(s.size) <> ''
    order by s.ord
    returning *
  ), logged as (
    insert into movements (shoe_unit_id, type, amount)
    select i.id, 'ingreso', i.price from inserted i
  )
  select * from inserted order by code;
end;
$$;

-- Préstamo: los pares salen de bodega hacia un local.
create function public.lend_units(p_store_id uuid, p_codes text[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_codes text[];
  v_missing text[];
  v_unavailable text[];
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;
  if not exists (select 1 from stores where id = p_store_id and active) then
    raise exception 'El local no existe o está inactivo';
  end if;

  select array_agg(distinct upper(trim(c))) into v_codes
  from unnest(p_codes) c
  where trim(c) <> '';
  if v_codes is null then
    raise exception 'No hay códigos para registrar';
  end if;

  select array_agg(c) into v_missing
  from unnest(v_codes) c
  where not exists (select 1 from shoe_units u where u.code = c);
  if v_missing is not null then
    raise exception 'Códigos que no existen: %', array_to_string(v_missing, ', ');
  end if;

  select array_agg(code) into v_unavailable
  from shoe_units
  where code = any (v_codes) and status <> 'en_bodega';
  if v_unavailable is not null then
    raise exception 'Estos pares no están en bodega: %', array_to_string(v_unavailable, ', ');
  end if;

  with updated as (
    update shoe_units
    set status = 'prestado', store_id = p_store_id, loaned_at = now()
    where code = any (v_codes) and status = 'en_bodega'
    returning id, price
  )
  insert into movements (shoe_unit_id, store_id, type, amount)
  select id, p_store_id, 'prestamo', price from updated;

  get diagnostics v_count = row_count;
  -- Si otro trabajador movió un par al mismo tiempo, se cancela todo.
  if v_count <> array_length(v_codes, 1) then
    raise exception 'Algunos pares cambiaron de estado mientras se registraba. Intenta de nuevo.';
  end if;
  return v_count;
end;
$$;

-- Recogida en un local: devueltos vuelven a bodega, vendidos generan deuda,
-- lo no mencionado sigue prestado. Opcionalmente registra un pago.
create function public.settle_visit(
  p_store_id uuid,
  p_returned text[],
  p_sold text[],
  p_payment numeric default 0,
  p_payment_method text default 'efectivo',
  p_notes text default null
)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_returned text[];
  v_sold text[];
  v_invalid text[];
  v_returned_count integer := 0;
  v_sold_count integer := 0;
  v_sold_amount numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;

  select coalesce(array_agg(distinct upper(trim(c))), '{}') into v_returned
  from unnest(coalesce(p_returned, '{}')) c where trim(c) <> '';
  select coalesce(array_agg(distinct upper(trim(c))), '{}') into v_sold
  from unnest(coalesce(p_sold, '{}')) c where trim(c) <> '';

  if v_returned && v_sold then
    raise exception 'Un par no puede estar devuelto y vendido a la vez';
  end if;

  select array_agg(c) into v_invalid
  from unnest(v_returned || v_sold) c
  where not exists (
    select 1 from shoe_units u
    where u.code = c and u.status = 'prestado' and u.store_id = p_store_id
  );
  if v_invalid is not null then
    raise exception 'Estos pares no están prestados a este local: %', array_to_string(v_invalid, ', ');
  end if;

  if cardinality(v_returned) > 0 then
    with updated as (
      update shoe_units
      set status = 'en_bodega', store_id = null, loaned_at = null
      where code = any (v_returned) and status = 'prestado' and store_id = p_store_id
      returning id, price
    )
    insert into movements (shoe_unit_id, store_id, type, amount, notes)
    select id, p_store_id, 'devolucion', price, p_notes from updated;
    get diagnostics v_returned_count = row_count;
  end if;

  if cardinality(v_sold) > 0 then
    with updated as (
      update shoe_units
      set status = 'vendido', store_id = null
      where code = any (v_sold) and status = 'prestado' and store_id = p_store_id
      returning id, price
    )
    insert into movements (shoe_unit_id, store_id, type, amount, notes)
    select id, p_store_id, 'venta', price, p_notes from updated;
    get diagnostics v_sold_count = row_count;

    select coalesce(sum(price), 0) into v_sold_amount
    from shoe_units where code = any (v_sold);
  end if;

  if v_returned_count <> cardinality(v_returned) or v_sold_count <> cardinality(v_sold) then
    raise exception 'Algunos pares cambiaron de estado mientras se registraba. Intenta de nuevo.';
  end if;

  if coalesce(p_payment, 0) > 0 then
    insert into payments (store_id, amount, method, notes)
    values (p_store_id, p_payment, coalesce(p_payment_method, 'efectivo'), p_notes);
  end if;

  return json_build_object(
    'returned', v_returned_count,
    'sold', v_sold_count,
    'sold_amount', v_sold_amount,
    'payment', coalesce(p_payment, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Seguridad: solo usuarios con sesión (equipo interno)
-- ---------------------------------------------------------------------
alter table public.shopping_centers enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.shoe_units enable row level security;
alter table public.movements enable row level security;
alter table public.payments enable row level security;

create policy "equipo interno" on public.shopping_centers for all to authenticated using (true) with check (true);
create policy "equipo interno" on public.stores for all to authenticated using (true) with check (true);
create policy "equipo interno" on public.products for all to authenticated using (true) with check (true);
create policy "equipo interno" on public.shoe_units for all to authenticated using (true) with check (true);
create policy "equipo interno" on public.movements for all to authenticated using (true) with check (true);
create policy "equipo interno" on public.payments for all to authenticated using (true) with check (true);

revoke all on public.store_balances from anon;
grant select on public.store_balances to authenticated;

revoke execute on function public.register_intake(uuid, text[], numeric) from public, anon;
revoke execute on function public.lend_units(uuid, text[]) from public, anon;
revoke execute on function public.settle_visit(uuid, text[], text[], numeric, text, text) from public, anon;
grant execute on function public.register_intake(uuid, text[], numeric) to authenticated;
grant execute on function public.lend_units(uuid, text[]) to authenticated;
grant execute on function public.settle_visit(uuid, text[], text[], numeric, text, text) to authenticated;
grant usage on sequence public.shoe_unit_code_seq to authenticated;

-- Refresca la caché de la API para que vea las tablas nuevas.
notify pgrst, 'reload schema';
