-- Logo y horario del negocio, pago a repartidores, costos y ganancias.
-- Todo es aditivo: no se cambia ninguna tabla ni columna existente. Lo privado (costos, ganancias, pagos)
-- vive en tablas aparte con sus propias reglas, para que los clientes y repartidores no lo vean.

-- ---------------------------------------------------------------------------
-- Logo y horario de atención
-- ---------------------------------------------------------------------------
alter table public.businesses add column if not exists logo_url text;
alter table public.businesses add column if not exists opening_hours jsonb check (opening_hours is null or jsonb_typeof(opening_hours) = 'object');
grant update (logo_url, opening_hours) on public.businesses to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Solo el dueño sube o cambia el logo de SU negocio (carpeta = id del negocio). Verlo es público.
create or replace function public.can_manage_logo(p_path text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_path is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+$' then
    return false;
  end if;
  return public.is_owner(split_part(p_path, '/', 1)::uuid);
end;
$$;

drop policy if exists "logos: ver" on storage.objects;
create policy "logos: ver" on storage.objects for select to anon, authenticated using (bucket_id = 'logos');
drop policy if exists "logos: subir" on storage.objects;
create policy "logos: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and public.can_manage_logo(name));
drop policy if exists "logos: cambiar" on storage.objects;
create policy "logos: cambiar" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and public.can_manage_logo(name))
  with check (bucket_id = 'logos' and public.can_manage_logo(name));
drop policy if exists "logos: borrar" on storage.objects;
create policy "logos: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and public.can_manage_logo(name));

-- ---------------------------------------------------------------------------
-- Costos de productos (privados del dueño)
-- ---------------------------------------------------------------------------
create table if not exists public.product_costs (
  product_id uuid primary key references public.products (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  cost numeric(10, 2) not null check (cost >= 0)
);
alter table public.product_costs enable row level security;
drop policy if exists "costos solo del dueno" on public.product_costs;
create policy "costos solo del dueno" on public.product_costs for select to authenticated using (public.is_owner(business_id));
revoke insert, update, delete on public.product_costs from anon, authenticated;

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
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pago a repartidores: forma de pago por repartidor
--   porcentaje -> % del monto total del pedido
--   fijo       -> monto fijo por pedido
--   distancia  -> monto por km de cada pedido (local → dirección, en línea recta × 1.3)
-- ---------------------------------------------------------------------------
alter table public.business_members add column if not exists pay_type text check (pay_type is null or pay_type in ('porcentaje', 'fijo', 'distancia'));
alter table public.business_members add column if not exists pay_value numeric(10, 2) check (pay_value is null or pay_value >= 0);

-- Ganancias por pedido (solo el dueño) y pago al repartidor por pedido (el dueño y ese repartidor)
create table if not exists public.order_finance (
  order_id uuid primary key references public.orders (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  cost_total numeric(10, 2) not null default 0,
  gross_profit numeric(10, 2),
  net_profit numeric(10, 2)
);
alter table public.order_finance enable row level security;
drop policy if exists "ganancias solo del dueno" on public.order_finance;
create policy "ganancias solo del dueno" on public.order_finance for select to authenticated using (public.is_owner(business_id));
revoke insert, update, delete on public.order_finance from anon, authenticated;

create table if not exists public.order_driver_pay (
  order_id uuid primary key references public.orders (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  pay_type text,
  pay_value numeric(10, 2),
  distance_km numeric(8, 2),
  amount numeric(10, 2)
);
create index if not exists order_driver_pay_driver_idx on public.order_driver_pay (driver_id);
alter table public.order_driver_pay enable row level security;
drop policy if exists "pago visible al dueno y al repartidor" on public.order_driver_pay;
create policy "pago visible al dueno y al repartidor" on public.order_driver_pay for select to authenticated
  using (public.is_owner(business_id) or driver_id = auth.uid());
revoke insert, update, delete on public.order_driver_pay from anon, authenticated;

-- Distancia estimada de un pedido: línea recta local → dirección × 1.3 (factor de calles)
create or replace function public.order_distance_km(p_order_id uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select case when b.lat is null or b.lng is null then null
    else round((1.3 * 6371 * 2 * asin(least(1, sqrt(
           power(sin(radians(o.lat - b.lat) / 2), 2)
           + cos(radians(b.lat)) * cos(radians(o.lat)) * power(sin(radians(o.lng - b.lng) / 2), 2)))))::numeric, 2) end
  from orders o join businesses b on b.id = o.business_id where o.id = p_order_id;
$$;

-- Calcula (o recalcula) el pago al repartidor y las ganancias de un pedido. Solo se usa desde otras funciones.
create or replace function public.compute_order_financials(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  o orders; m business_members; v_dist numeric; v_pay numeric; v_cost numeric;
begin
  select * into o from orders where id = p_order_id;
  if not found then return; end if;
  v_dist := public.order_distance_km(p_order_id);
  v_pay := null;
  if o.driver_id is not null then
    select * into m from business_members where business_id = o.business_id and user_id = o.driver_id;
    if found and m.pay_type is not null and m.pay_value is not null then
      v_pay := case m.pay_type
        when 'porcentaje' then round(o.total * m.pay_value / 100, 2)
        when 'fijo' then m.pay_value
        when 'distancia' then case when v_dist is null then null else round(v_dist * m.pay_value, 2) end
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

-- El dueño define cómo paga a un repartidor y se aplica a los pedidos ya entregados que aún no tenían pago asignado.
create or replace function public.set_driver_pay(p_user_id uuid, p_type text, p_value numeric)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_business uuid; v_count integer := 0; v_max numeric; r record;
begin
  select id into v_business from businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Solo el dueño del negocio puede definir el pago'; end if;
  if p_type not in ('porcentaje', 'fijo', 'distancia') then raise exception 'Forma de pago inválida'; end if;
  v_max := case when p_type = 'porcentaje' then 100 else 1000 end;
  if p_value is null or p_value < 0 or p_value > v_max then
    raise exception 'Valor de pago inválido';
  end if;
  update business_members set pay_type = p_type, pay_value = round(p_value, 2)
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

-- ---------------------------------------------------------------------------
-- Crear pedido: además guarda el costo de los productos de ese momento (privado)
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_address_text text,
  p_lat double precision,
  p_lng double precision,
  p_reference text default null,
  p_cash_amount numeric default null,
  p_notes text default null
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles;
  v_order orders;
  v_item jsonb;
  v_product products;
  v_qty int;
  v_total numeric(10, 2) := 0;
  v_cost numeric(10, 2) := 0;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from businesses where id = p_business_id and active) then
    raise exception 'Negocio no disponible';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido está vacío';
  end if;
  if p_lat is null or p_lng is null or coalesce(trim(p_address_text), '') = '' then
    raise exception 'Falta la ubicación de entrega';
  end if;

  select * into v_profile from profiles where id = v_uid;

  insert into orders (business_id, customer_id, payment_method, cash_amount, customer_name, customer_phone,
                      address_text, reference, lat, lng, notes)
  values (p_business_id, v_uid, p_payment_method,
          case when p_payment_method = 'efectivo' then p_cash_amount end,
          coalesce(v_profile.full_name, ''), v_profile.phone,
          trim(p_address_text), nullif(trim(coalesce(p_reference, '')), ''), p_lat, p_lng,
          nullif(trim(coalesce(p_notes, '')), ''))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty < 1 or v_qty > 50 then raise exception 'Cantidad inválida'; end if;
    select * into v_product from products
      where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id and active
      for update;
    if not found then raise exception 'Producto no disponible'; end if;
    if v_product.stock is not null then
      if v_product.stock < v_qty then
        raise exception 'No hay stock suficiente de % (quedan %)', v_product.name, v_product.stock;
      end if;
      update products set stock = stock - v_qty where id = v_product.id;
    end if;
    insert into order_items (order_id, product_id, name, category, unit_price, quantity)
      values (v_order.id, v_product.id, v_product.name, v_product.category, v_product.price, v_qty);
    v_total := v_total + v_product.price * v_qty;
    v_cost := v_cost + coalesce((select c.cost from product_costs c where c.product_id = v_product.id), 0) * v_qty;
  end loop;

  update orders set total = v_total where id = v_order.id returning * into v_order;
  insert into order_finance (order_id, business_id, cost_total) values (v_order.id, p_business_id, v_cost);

  update profiles
     set address_text = v_order.address_text, reference = v_order.reference,
         lat = v_order.lat, lng = v_order.lng, last_business_id = p_business_id
   where id = v_uid;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Validar el pago: al quedar entregado se fijan el pago al repartidor y las ganancias del pedido
-- ---------------------------------------------------------------------------
create or replace function public.validate_payment(p_order_id uuid, p_valid boolean default true)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or not public.is_owner(v_order.business_id) then raise exception 'Pedido no encontrado'; end if;
  if v_order.status not in ('en_camino', 'entregado') then raise exception 'El pedido aún no está en camino'; end if;
  if v_order.payment_status = 'validado' then raise exception 'Ese pago ya fue validado'; end if;
  if v_order.payment_status = 'pendiente' then raise exception 'Aún no hay un pago informado'; end if;

  if p_valid then
    update orders
       set payment_status = 'validado',
           payment_validated_at = now(),
           payment_validated_by = auth.uid(),
           status = 'entregado',
           delivered_at = coalesce(delivered_at, now())
     where id = p_order_id returning * into v_order;
    perform public.compute_order_financials(p_order_id);
  else
    update orders
       set payment_status = 'rechazado',
           payment_validated_at = now(),
           payment_validated_by = auth.uid()
     where id = p_order_id returning * into v_order;
  end if;
  return v_order;
end;
$$;

revoke execute on function public.set_product_cost(uuid, numeric), public.set_driver_pay(uuid, text, numeric) from public, anon;
grant execute on function public.set_product_cost(uuid, numeric), public.set_driver_pay(uuid, text, numeric) to authenticated;

-- Pedidos ya entregados: se les calcula su ganancia (sin costos ni pago hasta que el dueño los defina)
do $$
declare r record;
begin
  for r in select id from public.orders where status = 'entregado' loop
    perform public.compute_order_financials(r.id);
  end loop;
end $$;
