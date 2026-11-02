-- Hora estimada de llegada: el repartidor la calcula al pulsar «Salir a entregar» y la ven él, el cliente y el dueño.
alter table public.orders add column if not exists eta_at timestamptz;
alter table public.orders add column if not exists eta_minutes integer check (eta_minutes is null or eta_minutes between 1 and 180);

drop function if exists public.start_delivery(uuid);
create or replace function public.start_delivery(p_order_id uuid, p_eta_seconds integer default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders; v_secs integer;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or not (v_order.driver_id = auth.uid() or public.is_owner(v_order.business_id)) then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order.status <> 'aceptado' then raise exception 'El pedido debe estar aceptado'; end if;

  -- Solo se guardan estimaciones razonables (entre 1 minuto y 3 horas); si no, el pedido sale sin hora estimada.
  v_secs := case when p_eta_seconds between 30 and 10800 then p_eta_seconds end;

  update orders
     set status = 'en_camino',
         picked_at = now(),
         eta_at = case when v_secs is not null then now() + make_interval(secs => v_secs) end,
         eta_minutes = case when v_secs is not null then greatest(1, ceil(v_secs / 60.0)::int) end
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

revoke execute on function public.start_delivery(uuid, integer) from public, anon;
grant execute on function public.start_delivery(uuid, integer) to authenticated;
