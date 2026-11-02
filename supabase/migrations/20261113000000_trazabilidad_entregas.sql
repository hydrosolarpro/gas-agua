-- Trazabilidad de cada entrega: además de recibido, aceptado, salida, pago y entrega, se guarda la hora real de llegada al punto.
alter table public.orders add column if not exists arrived_at timestamptz;

-- El repartidor (su app lo detecta al estar a pocos metros del punto de entrega) deja registrada la llegada. No se reescribe.
create or replace function public.mark_arrived(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or not (v_order.driver_id = auth.uid() or public.is_owner(v_order.business_id)) then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order.status <> 'en_camino' then raise exception 'El pedido no está en camino'; end if;
  if v_order.arrived_at is null then
    update orders set arrived_at = now() where id = p_order_id returning * into v_order;
  end if;
  return v_order;
end;
$$;

revoke execute on function public.mark_arrived(uuid) from public, anon;
grant execute on function public.mark_arrived(uuid) to authenticated;
