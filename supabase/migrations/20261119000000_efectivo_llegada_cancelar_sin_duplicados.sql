-- Flujo del pedido, versión final:
--   Recibido → Aceptado → En camino → Llegada al punto → Pago → (Validado) → Entregado
--  * Efectivo: cuando el repartidor confirma que cobró, el pedido queda ENTREGADO al instante (no necesita al dueño).
--  * Yape / Plin: el repartidor confirma el pago y el dueño lo valida; recién entonces queda entregado.
--  * El cliente puede cancelar mientras el repartidor no haya llegado; se avisa al dueño y al repartidor.
--  * Un mismo pedido no se duplica aunque se toque dos veces el botón de enviar.
--  * El cliente puede borrar de su lista los pedidos ya cerrados (customer_hidden_at); el negocio los conserva para sus estadísticas.

alter table public.orders add column if not exists customer_hidden_at timestamptz;
-- Identificador de cada intento de envío: el mismo intento nunca crea dos pedidos.
alter table public.orders add column if not exists request_id uuid;
create unique index if not exists orders_customer_request_idx on public.orders (customer_id, request_id) where request_id is not null;

-- ---------------------------------------------------------------------------
-- Crear pedido (sin duplicados): si el mismo intento de envío (p_request_id) llega dos veces, se devuelve el pedido ya creado.
-- ---------------------------------------------------------------------------
drop function if exists public.create_order(uuid, jsonb, public.payment_method, text, double precision, double precision, text, numeric, text);
create or replace function public.create_order(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_address_text text,
  p_lat double precision,
  p_lng double precision,
  p_reference text default null,
  p_cash_amount numeric default null,
  p_notes text default null,
  p_request_id uuid default null
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

  -- Doble toque o reintento de red: el mismo intento devuelve el pedido que ya se creó.
  if p_request_id is not null then
    perform pg_advisory_xact_lock(hashtext(v_uid::text));
    select * into v_order from orders where customer_id = v_uid and request_id = p_request_id;
    if found then return v_order; end if;
  end if;

  select * into v_profile from profiles where id = v_uid;

  insert into orders (business_id, customer_id, payment_method, cash_amount, customer_name, customer_phone,
                      address_text, reference, lat, lng, notes, request_id)
  values (p_business_id, v_uid, p_payment_method,
          case when p_payment_method = 'efectivo' then p_cash_amount end,
          coalesce(v_profile.full_name, ''), v_profile.phone,
          trim(p_address_text), nullif(trim(coalesce(p_reference, '')), ''), p_lat, p_lng,
          nullif(trim(coalesce(p_notes, '')), ''), p_request_id)
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
-- El repartidor confirma el cobro. Efectivo: queda entregado y validado al instante. Yape/Plin: espera al dueño.
-- ---------------------------------------------------------------------------
create or replace function public.complete_delivery(
  p_order_id uuid,
  p_amount_received numeric default null,
  p_operation_code text default null,
  p_payment_method public.payment_method default null
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders; v_method public.payment_method;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or not (v_order.driver_id = auth.uid() or public.is_owner(v_order.business_id)) then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order.status not in ('aceptado', 'en_camino') then raise exception 'El pedido no está en reparto'; end if;
  if v_order.payment_status = 'validado' then raise exception 'El pago ya fue validado'; end if;

  v_method := coalesce(p_payment_method, v_order.payment_method);

  update orders
     set status = 'en_camino',
         picked_at = coalesce(picked_at, now()),
         arrived_at = coalesce(arrived_at, now()),
         payment_method = v_method,
         amount_received = coalesce(p_amount_received, total),
         operation_code = nullif(trim(coalesce(p_operation_code, '')), ''),
         payment_status = 'reportado',
         payment_reported_at = now()
   where id = p_order_id returning * into v_order;

  if v_method = 'efectivo' then
    update orders
       set payment_status = 'validado',
           payment_validated_at = now(),
           payment_validated_by = auth.uid(),
           status = 'entregado',
           delivered_at = coalesce(delivered_at, now())
     where id = p_order_id returning * into v_order;
    perform public.compute_order_financials(p_order_id);
  end if;
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelar: el cliente puede mientras el repartidor no haya llegado; devuelve el stock reservado.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_order.customer_id = auth.uid() and not public.is_staff(v_order.business_id) then
    if v_order.status not in ('pendiente', 'aceptado', 'en_camino') or v_order.arrived_at is not null
       or v_order.payment_status not in ('pendiente', 'rechazado') then
      raise exception 'Tu repartidor ya llegó o el pedido ya está en cobro; comunícate con el negocio para cancelarlo';
    end if;
  elsif not public.is_staff(v_order.business_id) then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order.status in ('entregado', 'cancelado') then raise exception 'El pedido ya está cerrado'; end if;

  update products p
     set stock = p.stock + i.quantity
    from order_items i
   where i.order_id = p_order_id and i.product_id = p.id and p.stock is not null;

  update orders
     set status = 'cancelado', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

revoke execute on function public.create_order(uuid, jsonb, public.payment_method, text, double precision, double precision, text, numeric, text, uuid) from public, anon;
grant execute on function public.create_order(uuid, jsonb, public.payment_method, text, double precision, double precision, text, numeric, text, uuid) to authenticated;
