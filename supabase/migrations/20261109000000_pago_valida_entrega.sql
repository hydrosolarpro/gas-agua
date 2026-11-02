-- Flujo contra-entrega: Recibido → Aceptado → En camino → Pago → Validado → Entregado.
-- El repartidor (o el cliente con su comprobante) informa el pago; cuando el dueño lo VALIDA, el pedido
-- queda ENTREGADO automáticamente. Los pedidos antiguos ya entregados siguen funcionando.

-- El repartidor registra el cobro; el pedido NO se cierra todavía.
create or replace function public.complete_delivery(
  p_order_id uuid,
  p_amount_received numeric default null,
  p_operation_code text default null,
  p_payment_method public.payment_method default null
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or not (v_order.driver_id = auth.uid() or public.is_owner(v_order.business_id)) then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order.status not in ('aceptado', 'en_camino') then raise exception 'El pedido no está en reparto'; end if;
  if v_order.payment_status = 'validado' then raise exception 'El pago ya fue validado'; end if;

  update orders
     set status = 'en_camino',
         picked_at = coalesce(picked_at, now()),
         payment_method = coalesce(p_payment_method, payment_method),
         amount_received = coalesce(p_amount_received, total),
         operation_code = nullif(trim(coalesce(p_operation_code, '')), ''),
         payment_status = 'reportado',
         payment_reported_at = now()
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

-- El dueño confirma (o rechaza) que el dinero llegó. Al confirmar, el pedido pasa a ENTREGADO.
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

-- El comprobante del cliente solo se acepta con el repartidor en camino (o ya entregado) y deja el pago "por validar".
create or replace function public.add_order_proof(
  p_order_id uuid, p_concept text, p_amount numeric, p_method text, p_code text, p_proof text,
  p_extra text[] default '{}'
) returns public.order_proofs
language plpgsql security definer set search_path = public
as $$
declare v_order public.orders; v_row public.order_proofs; v_path text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.customer_id <> auth.uid() then raise exception 'Pedido no encontrado'; end if;
  if v_order.status = 'cancelado' then raise exception 'El pedido está cancelado'; end if;
  if v_order.status not in ('en_camino', 'entregado') then
    raise exception 'Podrás enviar tu comprobante cuando tu repartidor esté en camino';
  end if;
  if v_order.payment_status = 'validado' then raise exception 'Ese pedido ya tiene el pago validado'; end if;
  if p_concept not in ('gas', 'agua', 'otro') then raise exception 'Concepto inválido'; end if;
  if p_concept <> 'otro' and not exists (
       select 1 from public.order_items i where i.order_id = p_order_id and i.category::text = p_concept) then
    raise exception 'Tu pedido no incluye %', p_concept;
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if p_method not in ('yape', 'plin', 'transferencia', 'otro') then raise exception 'Medio de pago inválido'; end if;
  p_extra := coalesce(p_extra, '{}');
  if coalesce(array_length(p_extra, 1), 0) > 3 then raise exception 'Máximo 4 imágenes por pago'; end if;
  foreach v_path in array array_prepend(p_proof, p_extra) loop
    if v_path is null or v_path not like 'orders/' || v_order.id || '/%' then raise exception 'Comprobante inválido'; end if;
  end loop;
  if (select count(*) from public.order_proofs where order_id = p_order_id) >= 6 then
    raise exception 'Ya adjuntaste el máximo de comprobantes';
  end if;
  insert into public.order_proofs (order_id, concept, method, amount, operation_code, proof_path, extra_paths)
  values (p_order_id, p_concept, p_method, p_amount, nullif(trim(coalesce(p_code, '')), ''), p_proof, p_extra)
  returning * into v_row;

  if v_order.payment_status in ('pendiente', 'rechazado') then
    update public.orders set payment_status = 'reportado', payment_reported_at = now() where id = p_order_id;
  end if;
  return v_row;
end;
$$;
