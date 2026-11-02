-- La estimación de entrega aparece desde que el repartidor toma el pedido (hasta el punto de entrega) y se confirma al salir.
alter table public.orders add column if not exists eta_source text check (eta_source is null or eta_source in ('ruta', 'local', 'referencial'));

-- El repartidor (o el dueño) guarda la estimación mientras el pedido está aceptado o en camino.
--   aceptado  -> solo los minutos estimados de camino
--   en_camino -> si aún no tiene hora de llegada, se calcula desde ahora
create or replace function public.set_eta(p_order_id uuid, p_eta_seconds integer, p_source text default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders; v_secs integer;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or not (v_order.driver_id = auth.uid() or public.is_owner(v_order.business_id)) then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order.status not in ('aceptado', 'en_camino') then raise exception 'El pedido no está en reparto'; end if;
  v_secs := case when p_eta_seconds between 30 and 10800 then p_eta_seconds end;
  if v_secs is null then return v_order; end if;

  update orders
     set eta_minutes = greatest(1, ceil(v_secs / 60.0)::int),
         eta_source = case when p_source in ('ruta', 'local', 'referencial') then p_source end,
         eta_at = case when status = 'en_camino' and eta_at is null then now() + make_interval(secs => v_secs) else eta_at end
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

-- Al salir se confirma la estimación (desde ese momento corre la cuenta regresiva)
drop function if exists public.start_delivery(uuid, integer);
create or replace function public.start_delivery(p_order_id uuid, p_eta_seconds integer default null, p_source text default null)
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

  v_secs := case when p_eta_seconds between 30 and 10800 then p_eta_seconds end;
  -- Sin estimación nueva, se conserva la que ya se había guardado al tomar el pedido.
  if v_secs is null and v_order.eta_minutes is not null then v_secs := v_order.eta_minutes * 60; end if;

  update orders
     set status = 'en_camino',
         picked_at = now(),
         eta_at = case when v_secs is not null then now() + make_interval(secs => v_secs) end,
         eta_minutes = case when v_secs is not null then greatest(1, ceil(v_secs / 60.0)::int) end,
         eta_source = case when p_eta_seconds between 30 and 10800 and p_source in ('ruta', 'local', 'referencial') then p_source else eta_source end
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

revoke execute on function public.set_eta(uuid, integer, text), public.start_delivery(uuid, integer, text) from public, anon;
grant execute on function public.set_eta(uuid, integer, text), public.start_delivery(uuid, integer, text) to authenticated;
