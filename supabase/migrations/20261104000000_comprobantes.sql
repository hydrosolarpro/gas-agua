-- Comprobantes de pago (capturas de Yape, Plin, transferencias, etc.)
--   dueño  -> administrador : comprobante de su mensualidad  (subs/<negocio>/<archivo>)
--   cliente -> dueño        : comprobante del pago de un pedido (orders/<pedido>/<archivo>)
-- Las imágenes viven en un bucket PRIVADO; solo se ven con enlaces firmados temporales.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.subscription_payments add column if not exists proof_path text;

-- Comprobantes del cliente: uno o varios por pedido, cada uno por concepto (gas, agua u otro).
create table if not exists public.order_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  concept text not null check (concept in ('gas', 'agua', 'otro')),
  method text not null check (method in ('yape', 'plin', 'transferencia', 'otro')),
  amount numeric(10, 2) not null check (amount > 0),
  operation_code text,
  proof_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists order_proofs_order_idx on public.order_proofs (order_id, created_at);
alter table public.order_proofs enable row level security;
drop policy if exists "comprobantes de pedido visibles" on public.order_proofs;
create policy "comprobantes de pedido visibles" on public.order_proofs for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_id and (o.customer_id = auth.uid() or public.is_staff(o.business_id))));
revoke insert, update, delete on public.order_proofs from anon, authenticated;

-- Quién puede subir (p_write) o ver un comprobante según su ruta.
create or replace function public.can_access_proof(p_path text, p_write boolean)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare v_kind text; v_id uuid;
begin
  if p_path is null or p_path !~ '^(subs|orders)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+$' then
    return false;
  end if;
  v_kind := split_part(p_path, '/', 1);
  v_id := split_part(p_path, '/', 2)::uuid;
  if v_kind = 'subs' then
    return public.is_owner(v_id) or (not p_write and public.is_admin());
  end if;
  -- orders
  return exists (
    select 1 from public.orders o
     where o.id = v_id
       and (o.customer_id = auth.uid() or (not p_write and public.is_staff(o.business_id)))
  );
end;
$$;

drop policy if exists "comprobantes: subir" on storage.objects;
create policy "comprobantes: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and public.can_access_proof(name, true));
drop policy if exists "comprobantes: ver" on storage.objects;
create policy "comprobantes: ver" on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and public.can_access_proof(name, false));

-- Dueño avisa su pago de mensualidad, ahora con comprobante opcional
drop function if exists public.report_subscription_payment(numeric, date, text, text);
create or replace function public.report_subscription_payment(
  p_amount numeric, p_period date, p_method text, p_code text default null, p_proof text default null
) returns public.subscription_payments
language plpgsql security definer set search_path = public
as $$
declare v_business uuid; v_row public.subscription_payments;
begin
  select id into v_business from public.businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Solo el dueño de un negocio puede reportar pagos'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if p_proof is not null and p_proof not like 'subs/' || v_business || '/%' then
    raise exception 'Comprobante inválido';
  end if;
  insert into public.subscription_payments (business_id, amount, period, method, operation_code, proof_path)
  values (v_business, p_amount, date_trunc('month', p_period)::date, p_method,
          nullif(trim(coalesce(p_code, '')), ''), p_proof)
  returning * into v_row;
  return v_row;
end;
$$;

-- Dueño agrega o cambia el comprobante de un pago que aún no fue revisado
create or replace function public.attach_subscription_proof(p_payment_id uuid, p_proof text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_row public.subscription_payments;
begin
  select * into v_row from public.subscription_payments where id = p_payment_id for update;
  if not found or not public.is_owner(v_row.business_id) then raise exception 'Pago no encontrado'; end if;
  if v_row.status = 'validado' then raise exception 'Ese pago ya fue validado'; end if;
  if p_proof is null or p_proof not like 'subs/' || v_row.business_id || '/%' then raise exception 'Comprobante inválido'; end if;
  update public.subscription_payments set proof_path = p_proof where id = p_payment_id;
end;
$$;

-- Cliente agrega un comprobante de pago a su pedido, por concepto (gas o agua)
create or replace function public.add_order_proof(
  p_order_id uuid, p_concept text, p_amount numeric, p_method text, p_code text, p_proof text
) returns public.order_proofs
language plpgsql security definer set search_path = public
as $$
declare v_order public.orders; v_row public.order_proofs;
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
  if p_proof is null or p_proof not like 'orders/' || v_order.id || '/%' then raise exception 'Comprobante inválido'; end if;
  if (select count(*) from public.order_proofs where order_id = p_order_id) >= 6 then
    raise exception 'Ya adjuntaste el máximo de comprobantes';
  end if;
  insert into public.order_proofs (order_id, concept, method, amount, operation_code, proof_path)
  values (p_order_id, p_concept, p_method, p_amount, nullif(trim(coalesce(p_code, '')), ''), p_proof)
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.report_subscription_payment(numeric, date, text, text, text),
  public.attach_subscription_proof(uuid, text), public.add_order_proof(uuid, text, numeric, text, text, text) from public, anon;
grant execute on function public.report_subscription_payment(numeric, date, text, text, text),
  public.attach_subscription_proof(uuid, text), public.add_order_proof(uuid, text, numeric, text, text, text) to authenticated;
