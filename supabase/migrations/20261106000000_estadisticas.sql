-- Estadísticas del negocio: quién canceló cada pedido (los pedidos cancelados ya se conservan con motivo y fecha).
alter table public.orders add column if not exists cancelled_by uuid references public.profiles (id) on delete set null;

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
  update orders
     set status = 'cancelado', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;
