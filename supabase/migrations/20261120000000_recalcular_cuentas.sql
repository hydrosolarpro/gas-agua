-- Cuentas siempre al día: costos, pago a repartidores y ganancias bruta y neta de cada pedido.
--  * Un pedido hecho ANTES de registrar el costo de un producto quedaba con costo 0 (ganancia inflada). Ahora, al registrar el costo,
--    esos pedidos se corrigen con el costo del producto.
--  * Un pedido que quedó con pago 0 o sin pago (por la forma de pago o los productos que había entonces) se recalcula cuando el
--    dueño cambia la forma de pago del repartidor.
--  * El dueño puede pedir «Recalcular cuentas»: vuelve a calcular pago y ganancias de todos los pedidos entregados con la forma
--    de pago y los costos actuales.

-- Recalcula costos y cuentas de un negocio. p_all = false respeta los pagos que ya tienen monto; p_all = true los vuelve a calcular.
create or replace function public.recalc_business_accounts(p_business uuid, p_all boolean default false)
returns integer
language plpgsql security definer set search_path = public
as $$
declare r record; v_count integer := 0;
begin
  -- 1. Costos de pedidos que se hicieron antes de registrar el costo del producto
  update order_finance f
     set cost_total = c.cost
    from (select i.order_id, sum(i.quantity * pc.cost) as cost
            from order_items i join product_costs pc on pc.product_id = i.product_id
           group by i.order_id) c
   where f.order_id = c.order_id and f.business_id = p_business and f.cost_total = 0 and c.cost > 0;

  -- 2. Pago al repartidor y ganancias de los pedidos entregados
  for r in
    select o.id, o.total, d.amount
      from orders o left join order_driver_pay d on d.order_id = o.id
     where o.business_id = p_business and o.status = 'entregado'
  loop
    if p_all or r.amount is null or r.amount = 0 then
      perform public.compute_order_financials(r.id);
    else
      update order_finance
         set gross_profit = r.total - cost_total, net_profit = r.total - cost_total - r.amount
       where order_id = r.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.recalc_business_accounts(uuid, boolean) from public, anon, authenticated;

-- El dueño pide recalcular sus cuentas (botón en Mis Estadísticas).
create or replace function public.owner_recalc_accounts(p_all boolean default false)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_business uuid;
begin
  select id into v_business from businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Solo el dueño del negocio puede recalcular sus cuentas'; end if;
  return public.recalc_business_accounts(v_business, p_all);
end;
$$;
revoke execute on function public.owner_recalc_accounts(boolean) from public, anon;
grant execute on function public.owner_recalc_accounts(boolean) to authenticated;

-- Al registrar el costo de un producto, los pedidos que no tenían costo se corrigen.
create or replace function public.set_product_cost(p_product_id uuid, p_cost numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_business uuid;
begin
  select business_id into v_business from products where id = p_product_id;
  if v_business is null or not public.is_owner(v_business) then raise exception 'Producto no encontrado'; end if;
  if p_cost is null then
    delete from product_costs where product_id = p_product_id;
  else
    if p_cost < 0 or p_cost > 100000 then raise exception 'Costo inválido'; end if;
    insert into product_costs (product_id, business_id, cost) values (p_product_id, v_business, round(p_cost, 2))
      on conflict (product_id) do update set cost = excluded.cost;
    perform public.recalc_business_accounts(v_business, false);
  end if;
end;
$$;

-- Al cambiar la forma de pago de un repartidor, se recalculan sus pedidos entregados sin pago (o con pago 0).
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
     where o.business_id = v_business and o.driver_id = p_user_id and o.status = 'entregado'
       and (d.amount is null or d.amount = 0)
  loop
    perform public.compute_order_financials(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Corrección de lo que ya existe: costos faltantes y pedidos entregados con pago 0 o sin pago.
do $$
declare b record;
begin
  for b in select id from public.businesses loop
    perform public.recalc_business_accounts(b.id, false);
  end loop;
end $$;
