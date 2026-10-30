-- =====================================================================
-- Smart Inventory — 003: abonos del local y cobro de vendidos
-- Pegar completo en Supabase > SQL Editor > Run. No borra datos.
--
-- Nueva lógica:
--   * Abono: el local da plata a su cuenta cuando quiera (varios días).
--   * Recogida: los pares marcados "vendido" se cobran en ese momento,
--     descontando los abonos que el local tenga sin usar.
--   * Debe            = valor de sus pares + vendido − pagado
--   * Abonos sin usar = pagado − vendido (si es positivo)
-- =====================================================================

-- Tipo de pago: cobro de pares vendidos o abono a la cuenta.
alter table public.payments
  add column if not exists kind text not null default 'abono'
  check (kind in ('venta', 'abono'));

-- Vista de saldos con la nueva fórmula
drop view if exists public.store_balances;

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
  coalesce(p.total_abonos, 0) as total_abonos,
  greatest(coalesce(p.total_paid, 0) - coalesce(v.total_sold, 0), 0) as credit_available,
  coalesce(l.value_on_loan, 0) + coalesce(v.total_sold, 0) - coalesce(p.total_paid, 0) as balance_due,
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
  select
    sum(pa.amount) as total_paid,
    sum(pa.amount) filter (where pa.kind = 'abono') as total_abonos,
    max(pa.created_at) as last_payment_at
  from public.payments pa
  where pa.store_id = s.id
) p on true;

revoke all on public.store_balances from anon;
grant select on public.store_balances to authenticated;

-- Recogida: devueltos vuelven a bodega; vendidos se cobran en el momento,
-- descontando los abonos sin usar. El valor lo calcula la base, no el celular.
drop function if exists public.settle_visit(uuid, text[], text[], numeric, text, text);

create function public.settle_visit(
  p_store_id uuid,
  p_returned text[],
  p_sold text[],
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
  v_credit numeric := 0;
  v_to_receive numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión no válida';
  end if;

  -- Bloquea el local para que dos visitas simultáneas no usen el mismo abono.
  perform 1 from stores where id = p_store_id for update;
  if not found then
    raise exception 'El local no existe';
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

  -- Abonos sin usar antes de esta visita.
  select greatest(credit_available, 0) into v_credit from store_balances where id = p_store_id;

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

  -- Lo que se cobra ahora = vendidos − abonos sin usar.
  v_to_receive := greatest(v_sold_amount - coalesce(v_credit, 0), 0);
  if v_to_receive > 0 then
    insert into payments (store_id, amount, method, kind, notes)
    values (p_store_id, v_to_receive, coalesce(p_payment_method, 'efectivo'), 'venta', p_notes);
  end if;

  return json_build_object(
    'returned', v_returned_count,
    'sold', v_sold_count,
    'sold_amount', v_sold_amount,
    'credit_used', least(v_sold_amount, coalesce(v_credit, 0)),
    'received', v_to_receive
  );
end;
$$;

revoke execute on function public.settle_visit(uuid, text[], text[], text, text) from public, anon;
grant execute on function public.settle_visit(uuid, text[], text[], text, text) to authenticated;

notify pgrst, 'reload schema';
