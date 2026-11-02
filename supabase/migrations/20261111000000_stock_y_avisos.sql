-- Stock de productos (opcional por producto) y avisos en vivo de negocios nuevos.
--   stock = null  -> no se controla (siempre disponible)
--   stock = n     -> se descuenta al pedir y se devuelve si el pedido se cancela

alter table public.products add column if not exists stock integer check (stock is null or stock >= 0);

-- Avisos del administrador cuando un dueño empieza su demo (tiempo real sobre negocios)
do $$
begin
  alter publication supabase_realtime add table public.businesses;
exception when duplicate_object then null;
end $$;

-- Crear pedido: valida y descuenta el stock en la misma transacción (con bloqueo de fila para no vender de más)
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
  end loop;

  update orders set total = v_total where id = v_order.id returning * into v_order;

  update profiles
     set address_text = v_order.address_text, reference = v_order.reference,
         lat = v_order.lat, lng = v_order.lng, last_business_id = p_business_id
   where id = v_uid;

  return v_order;
end;
$$;

-- Cancelar: además de cerrar el pedido, devuelve el stock reservado
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_order.customer_id = auth.uid() and not public.is_staff(v_order.business_id) then
    if v_order.status <> 'pendiente' then
      raise exception 'Tu pedido ya fue aceptado; comunícate con el negocio para cancelarlo';
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
