-- Un pago del cliente puede llevar varias imágenes (hasta 4 en total): la principal y las adicionales.
alter table public.order_proofs add column if not exists extra_paths text[] not null default '{}';

drop function if exists public.add_order_proof(uuid, text, numeric, text, text, text);
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
  return v_row;
end;
$$;

revoke execute on function public.add_order_proof(uuid, text, numeric, text, text, text, text[]) from public, anon;
grant execute on function public.add_order_proof(uuid, text, numeric, text, text, text, text[]) to authenticated;
