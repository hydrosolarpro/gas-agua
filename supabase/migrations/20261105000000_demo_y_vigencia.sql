-- DEMO gratis de 15 días y plan pago de 30 días continuos (ambos días, inicio y fin, incluidos).
--   Demo:    desde el día en que se creó el negocio hasta 14 días después (15 días en total).
--   Plan:    cada pago validado cubre 30 días. Si se renueva antes de vencer, los días nuevos
--            empiezan el día siguiente al fin de lo ya cubierto, para no perder ninguno.
-- Las fechas se cuentan en hora de Perú (America/Lima).

-- ---------------------------------------------------------------------------
-- Eliminar un dueño: validated_by dejaba un vínculo sin cascada que podía impedir el borrado
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_payment_validated_by_fkey;
alter table public.orders add constraint orders_payment_validated_by_fkey
  foreign key (payment_validated_by) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Pagos de la suscripción: fecha y hora del pago + vigencia
-- ---------------------------------------------------------------------------
alter table public.subscription_payments add column if not exists paid_at timestamptz;
alter table public.subscription_payments add column if not exists valid_from date;
alter table public.subscription_payments add column if not exists valid_to date;

update public.subscription_payments set paid_at = coalesce(validated_at, reported_at) where paid_at is null;
update public.subscription_payments
   set valid_from = (paid_at at time zone 'America/Lima')::date,
       valid_to = (paid_at at time zone 'America/Lima')::date + 29
 where status = 'validado' and valid_from is null;
alter table public.subscription_payments alter column paid_at set not null;
alter table public.subscription_payments alter column paid_at set default now();

-- Ya no hay "un pago por mes": se puede renovar cuando se quiera.
drop index if exists public.subscription_one_validated_per_month;

-- Último día cubierto por el demo de un negocio.
create or replace function public.demo_end(p_business_id uuid)
returns date
language sql stable security definer set search_path = public
as $$
  select ((created_at at time zone 'America/Lima')::date + 14) from public.businesses where id = p_business_id;
$$;

-- Primer y último día que cubriría un pago hecho en p_paid_at (apilado tras lo ya cubierto).
create or replace function public.plan_window(p_business_id uuid, p_paid_at timestamptz)
returns table (valid_from date, valid_to date)
language plpgsql stable security definer set search_path = public
as $$
declare v_paid date := (p_paid_at at time zone 'America/Lima')::date; v_covered date; v_from date;
begin
  select greatest(public.demo_end(p_business_id), coalesce(max(sp.valid_to), date '0001-01-01'))
    into v_covered from public.subscription_payments sp
   where sp.business_id = p_business_id and sp.status = 'validado';
  v_from := greatest(v_paid, coalesce(v_covered, v_paid - 1) + 1);
  return query select v_from, v_from + 29;
end;
$$;

-- ¿El negocio puede recibir pedidos hoy? (demo vigente o plan pagado vigente)
create or replace function public.business_is_active(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.demo_end(p_business_id) >= (now() at time zone 'America/Lima')::date, false)
      or exists (select 1 from public.subscription_payments sp
                  where sp.business_id = p_business_id and sp.status = 'validado'
                    and (now() at time zone 'America/Lima')::date between sp.valid_from and sp.valid_to);
$$;

create or replace function public.orders_require_active_plan()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.business_is_active(new.business_id) then
    raise exception 'Este negocio no está recibiendo pedidos por ahora';
  end if;
  return new;
end;
$$;
drop trigger if exists orders_require_active_plan on public.orders;
create trigger orders_require_active_plan before insert on public.orders
  for each row execute function public.orders_require_active_plan();

-- ---------------------------------------------------------------------------
-- Quién puede subir comprobantes de mensualidad: el dueño y también el administrador
-- ---------------------------------------------------------------------------
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
    return public.is_owner(v_id) or public.is_admin();
  end if;
  return exists (
    select 1 from public.orders o
     where o.id = v_id
       and (o.customer_id = auth.uid() or (not p_write and public.is_staff(o.business_id)))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Avisar un pago (dueño), validarlo o registrarlo directamente (administrador)
-- ---------------------------------------------------------------------------
drop function if exists public.report_subscription_payment(numeric, date, text, text, text);
create or replace function public.report_subscription_payment(
  p_amount numeric, p_paid_at timestamptz, p_method text, p_code text default null, p_proof text default null
) returns public.subscription_payments
language plpgsql security definer set search_path = public
as $$
declare v_business uuid; v_row public.subscription_payments;
begin
  select id into v_business from public.businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Solo el dueño de un negocio puede reportar pagos'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if p_paid_at is null or p_paid_at > now() + interval '10 minutes' then raise exception 'La fecha y hora del pago no puede ser futura'; end if;
  if p_paid_at < now() - interval '90 days' then raise exception 'La fecha del pago es demasiado antigua'; end if;
  if p_proof is not null and p_proof not like 'subs/' || v_business || '/%' then raise exception 'Comprobante inválido'; end if;
  insert into public.subscription_payments (business_id, amount, period, method, operation_code, proof_path, paid_at)
  values (v_business, p_amount, date_trunc('month', p_paid_at at time zone 'America/Lima')::date, p_method,
          nullif(trim(coalesce(p_code, '')), ''), p_proof, p_paid_at)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.review_subscription_payment(p_id uuid, p_valid boolean)
returns public.subscription_payments
language plpgsql security definer set search_path = public
as $$
declare v_row public.subscription_payments; v_from date; v_to date;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into v_row from public.subscription_payments where id = p_id for update;
  if not found then raise exception 'Pago no encontrado'; end if;
  if v_row.status <> 'pendiente' then raise exception 'Ese pago ya fue revisado'; end if;
  if p_valid then
    select w.valid_from, w.valid_to into v_from, v_to from public.plan_window(v_row.business_id, v_row.paid_at) w;
  end if;
  update public.subscription_payments
     set status = case when p_valid then 'validado' else 'rechazado' end,
         valid_from = v_from, valid_to = v_to,
         validated_at = now(), validated_by = auth.uid()
   where id = p_id returning * into v_row;
  return v_row;
end;
$$;

drop function if exists public.admin_register_payment(uuid, numeric, date, text, text);
create or replace function public.admin_register_payment(
  p_business_id uuid, p_amount numeric, p_paid_at timestamptz, p_method text,
  p_code text default null, p_proof text default null
) returns public.subscription_payments
language plpgsql security definer set search_path = public
as $$
declare v_row public.subscription_payments; v_from date; v_to date;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if p_paid_at is null or p_paid_at > now() + interval '10 minutes' then raise exception 'La fecha y hora del pago no puede ser futura'; end if;
  if p_proof is not null and p_proof not like 'subs/' || p_business_id || '/%' then raise exception 'Comprobante inválido'; end if;
  select w.valid_from, w.valid_to into v_from, v_to from public.plan_window(p_business_id, p_paid_at) w;
  insert into public.subscription_payments
    (business_id, amount, period, method, operation_code, proof_path, paid_at, status, valid_from, valid_to, validated_at, validated_by)
  values (p_business_id, p_amount, date_trunc('month', p_paid_at at time zone 'America/Lima')::date, p_method,
          nullif(trim(coalesce(p_code, '')), ''), p_proof, p_paid_at, 'validado', v_from, v_to, now(), auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

revoke execute on function public.report_subscription_payment(numeric, timestamptz, text, text, text),
  public.admin_register_payment(uuid, numeric, timestamptz, text, text, text) from public, anon;
grant execute on function public.report_subscription_payment(numeric, timestamptz, text, text, text),
  public.admin_register_payment(uuid, numeric, timestamptz, text, text, text) to authenticated;
revoke execute on function public.demo_end(uuid), public.plan_window(uuid, timestamptz), public.business_is_active(uuid) from public, anon;
grant execute on function public.demo_end(uuid), public.plan_window(uuid, timestamptz), public.business_is_active(uuid) to authenticated;
