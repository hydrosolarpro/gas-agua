-- Pago a repartidores por productos: el dueño elige a qué productos de «Mis productos» se aplica la forma de pago de cada repartidor.
--   business_members.pay_products = null  -> el pago se calcula sobre todos los productos (como hasta ahora)
--   business_members.pay_products = {ids} -> solo cuentan esos productos:
--       porcentaje : % de lo que suman esos productos dentro del pedido
--       fijo       : el monto fijo, solo si el pedido trae al menos uno de esos productos
--       distancia  : km x tarifa, solo si el pedido trae al menos uno de esos productos
--     Un pedido sin ninguno de esos productos paga 0 al repartidor.
alter table public.business_members add column if not exists pay_products uuid[];

-- Cálculo del pago y de las ganancias de un pedido, ahora considerando los productos elegidos.
create or replace function public.compute_order_financials(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  o orders; m business_members; v_dist numeric; v_pay numeric; v_cost numeric;
  v_base numeric; v_hits integer;
begin
  select * into o from orders where id = p_order_id;
  if not found then return; end if;
  v_dist := public.order_distance_km(p_order_id);
  v_pay := null;
  if o.driver_id is not null then
    select * into m from business_members where business_id = o.business_id and user_id = o.driver_id;
    if found and m.pay_type is not null and m.pay_value is not null then
      if m.pay_products is null then
        v_base := o.total;
        v_hits := 1;
      else
        select coalesce(sum(i.subtotal), 0), count(*) into v_base, v_hits
          from order_items i where i.order_id = p_order_id and i.product_id = any (m.pay_products);
      end if;
      v_pay := case
        when v_hits = 0 then 0
        when m.pay_type = 'porcentaje' then round(v_base * m.pay_value / 100, 2)
        when m.pay_type = 'fijo' then m.pay_value
        when m.pay_type = 'distancia' then case when v_dist is null then null else round(v_dist * m.pay_value, 2) end
      end;
    end if;
    insert into order_driver_pay (order_id, business_id, driver_id, pay_type, pay_value, distance_km, amount)
      values (p_order_id, o.business_id, o.driver_id, m.pay_type, m.pay_value, v_dist, v_pay)
      on conflict (order_id) do update
        set driver_id = excluded.driver_id, pay_type = excluded.pay_type, pay_value = excluded.pay_value,
            distance_km = excluded.distance_km, amount = excluded.amount;
  end if;
  select coalesce(cost_total, 0) into v_cost from order_finance where order_id = p_order_id;
  insert into order_finance (order_id, business_id, cost_total, gross_profit, net_profit)
    values (p_order_id, o.business_id, coalesce(v_cost, 0), o.total - coalesce(v_cost, 0), o.total - coalesce(v_cost, 0) - coalesce(v_pay, 0))
    on conflict (order_id) do update
      set gross_profit = excluded.gross_profit, net_profit = excluded.net_profit;
end;
$$;
revoke execute on function public.compute_order_financials(uuid) from public, anon, authenticated;

-- El dueño define cómo y sobre qué productos paga a un repartidor. Se aplica a los pedidos ya entregados que aún no tenían pago.
drop function if exists public.set_driver_pay(uuid, text, numeric);
create or replace function public.set_driver_pay(p_user_id uuid, p_type text, p_value numeric, p_products uuid[] default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_business uuid; v_count integer := 0; v_max numeric; v_products uuid[]; r record;
begin
  select id into v_business from businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Solo el dueño del negocio puede definir el pago'; end if;
  if p_type not in ('porcentaje', 'fijo', 'distancia') then raise exception 'Forma de pago inválida'; end if;
  v_max := case when p_type = 'porcentaje' then 100 else 1000 end;
  if p_value is null or p_value < 0 or p_value > v_max then
    raise exception 'Valor de pago inválido';
  end if;
  v_products := case when p_products is null or cardinality(p_products) = 0 then null else p_products end;
  if v_products is not null and (select count(*) from products where business_id = v_business and id = any (v_products))
       <> (select count(distinct x) from unnest(v_products) as x) then
    raise exception 'Hay productos que no son de tu negocio';
  end if;
  update business_members set pay_type = p_type, pay_value = round(p_value, 2), pay_products = v_products
   where business_id = v_business and user_id = p_user_id;
  if not found then raise exception 'Esa persona no está en tu equipo'; end if;
  for r in
    select o.id from orders o
     left join order_driver_pay d on d.order_id = o.id
     where o.business_id = v_business and o.driver_id = p_user_id and o.status = 'entregado' and d.amount is null
  loop
    perform public.compute_order_financials(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.set_driver_pay(uuid, text, numeric, uuid[]) from public, anon;
grant execute on function public.set_driver_pay(uuid, text, numeric, uuid[]) to authenticated;
