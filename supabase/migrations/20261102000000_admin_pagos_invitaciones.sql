-- Administrador de la plataforma, cobro de la suscripción a los dueños e invitaciones.

-- ---------------------------------------------------------------------------
-- Administrador
-- ---------------------------------------------------------------------------
-- is_admin no está en la lista de columnas editables por el usuario: solo el servidor lo cambia.
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create policy "admin ve perfiles" on public.profiles for select to authenticated
  using (public.is_admin());
create policy "admin ve negocios" on public.businesses for select to authenticated
  using (public.is_admin());

-- Monto mensual propio de un negocio (si es null se usa el monto general).
alter table public.businesses add column if not exists fee_override numeric(10, 2) check (fee_override >= 0);

-- ---------------------------------------------------------------------------
-- Datos de cobro y monto de la suscripción (una sola fila)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  id int primary key default 1 check (id = 1),
  admin_name text,
  admin_email text,
  admin_phone text,
  account_holder text,
  bank_name text,
  bank_account text,
  bank_cci text,
  yape_number text,
  plin_number text,
  monthly_fee numeric(10, 2) not null default 79 check (monthly_fee >= 0),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (1) on conflict do nothing;

alter table public.platform_settings enable row level security;
create policy "ajustes visibles a admin y duenos" on public.platform_settings for select to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dueno'));
create policy "admin edita ajustes" on public.platform_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete on public.platform_settings from anon, authenticated;
grant update (admin_name, admin_email, admin_phone, account_holder, bank_name, bank_account, bank_cci,
              yape_number, plin_number, monthly_fee, updated_at)
  on public.platform_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Pagos de la suscripción (dueño -> plataforma)
-- ---------------------------------------------------------------------------
create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0),
  period date not null check (period = date_trunc('month', period)::date),
  method text not null check (method in ('yape', 'plin', 'transferencia', 'deposito', 'efectivo', 'otro')),
  operation_code text,
  status text not null default 'pendiente' check (status in ('pendiente', 'validado', 'rechazado')),
  reported_at timestamptz not null default now(),
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null
);
create index subscription_payments_business_idx on public.subscription_payments (business_id, period desc);
-- Un solo pago validado por negocio y mes.
create unique index subscription_one_validated_per_month
  on public.subscription_payments (business_id, period) where status = 'validado';

alter table public.subscription_payments enable row level security;
create policy "pagos visibles" on public.subscription_payments for select to authenticated
  using (public.is_admin() or public.is_owner(business_id));
revoke insert, update, delete on public.subscription_payments from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Invitaciones para dueños de negocio (solo se guarda el hash del enlace)
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  note text,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.invitations enable row level security;
create policy "admin ve invitaciones" on public.invitations for select to authenticated
  using (public.is_admin());
revoke insert, update, delete on public.invitations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funciones del administrador y del dueño
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_invitation(p_note text default null, p_days int default 7)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_token text;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invitations (token_hash, note, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
          nullif(trim(coalesce(p_note, '')), ''),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 7), 60))));
  return v_token;
end;
$$;

create or replace function public.admin_revoke_invitation(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  update public.invitations set revoked = true where id = p_id and used_at is null;
end;
$$;

create or replace function public.admin_set_fee(p_business_id uuid, p_fee numeric)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_fee is not null and p_fee < 0 then raise exception 'Monto inválido'; end if;
  update public.businesses set fee_override = p_fee where id = p_business_id;
end;
$$;

create or replace function public.report_subscription_payment(
  p_amount numeric, p_period date, p_method text, p_code text default null
) returns public.subscription_payments
language plpgsql security definer set search_path = public
as $$
declare v_business uuid; v_row public.subscription_payments;
begin
  select id into v_business from public.businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Solo el dueño de un negocio puede reportar pagos'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  insert into public.subscription_payments (business_id, amount, period, method, operation_code)
  values (v_business, p_amount, date_trunc('month', p_period)::date, p_method,
          nullif(trim(coalesce(p_code, '')), ''))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.review_subscription_payment(p_id uuid, p_valid boolean)
returns public.subscription_payments
language plpgsql security definer set search_path = public
as $$
declare v_row public.subscription_payments;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into v_row from public.subscription_payments where id = p_id for update;
  if not found then raise exception 'Pago no encontrado'; end if;
  if v_row.status <> 'pendiente' then raise exception 'Ese pago ya fue revisado'; end if;
  if p_valid and exists (select 1 from public.subscription_payments
                         where business_id = v_row.business_id and period = v_row.period and status = 'validado') then
    raise exception 'Ese mes ya tiene un pago validado';
  end if;
  update public.subscription_payments
     set status = case when p_valid then 'validado' else 'rechazado' end,
         validated_at = now(), validated_by = auth.uid()
   where id = p_id returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.admin_register_payment(
  p_business_id uuid, p_amount numeric, p_period date, p_method text, p_code text default null
) returns public.subscription_payments
language plpgsql security definer set search_path = public
as $$
declare v_row public.subscription_payments;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Monto inválido'; end if;
  if exists (select 1 from public.subscription_payments
             where business_id = p_business_id and period = date_trunc('month', p_period)::date and status = 'validado') then
    raise exception 'Ese mes ya tiene un pago validado';
  end if;
  insert into public.subscription_payments (business_id, amount, period, method, operation_code, status, validated_at, validated_by)
  values (p_business_id, p_amount, date_trunc('month', p_period)::date, p_method,
          nullif(trim(coalesce(p_code, '')), ''), 'validado', now(), auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.admin_owner_stats()
returns table (business_id uuid, orders_total bigint, orders_delivered bigint, sales_validated numeric)
language sql stable security definer set search_path = public
as $$
  select b.id,
         count(o.id),
         count(o.id) filter (where o.status = 'entregado'),
         coalesce(sum(o.total) filter (where o.payment_status = 'validado'), 0)
    from public.businesses b
    left join public.orders o on o.business_id = b.id
   where public.is_admin()
   group by b.id;
$$;

-- ---------------------------------------------------------------------------
-- Alta de negocios: solo por invitación (la crea el servidor con la clave de servicio)
-- ---------------------------------------------------------------------------
revoke execute on function public.create_business(text, text, text, text, text, double precision, double precision)
  from public, anon, authenticated;

create or replace function public.admin_create_business(
  p_owner_id uuid, p_name text, p_phone text default null, p_yape text default null, p_plin text default null
) returns public.businesses
language plpgsql security definer set search_path = public
as $$
declare
  v_slug text;
  v_business public.businesses;
begin
  if exists (select 1 from public.businesses where owner_id = p_owner_id) then
    raise exception 'Ya tiene un negocio registrado';
  end if;
  v_slug := trim(both '-' from regexp_replace(lower(translate(p_name,
              'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU')), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'negocio'; end if;
  v_slug := left(v_slug, 40) || '-' || substr(md5(gen_random_uuid()::text), 1, 4);

  insert into public.businesses (owner_id, name, slug, phone, yape_number, plin_number)
  values (p_owner_id, trim(p_name), v_slug, p_phone, p_yape, p_plin)
  returning * into v_business;

  update public.profiles set role = 'dueno', onboarded = true where id = p_owner_id;

  insert into public.products (business_id, name, description, category, price, sort_order) values
    (v_business.id, 'Balón de gas 10 kg', 'Precio de ejemplo, edítalo en tu panel', 'gas', 45.00, 1),
    (v_business.id, 'Bidón de agua 20 L (recarga)', 'Precio de ejemplo, edítalo en tu panel', 'agua', 10.00, 2),
    (v_business.id, 'Bidón de agua 20 L con envase', 'Precio de ejemplo, edítalo en tu panel', 'agua', 25.00, 3);
  return v_business;
end;
$$;

revoke execute on function public.admin_create_business(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_create_business(uuid, text, text, text, text) to service_role;

revoke execute on function public.admin_create_invitation(text, int), public.admin_revoke_invitation(uuid),
  public.admin_set_fee(uuid, numeric), public.report_subscription_payment(numeric, date, text, text),
  public.review_subscription_payment(uuid, boolean), public.admin_register_payment(uuid, numeric, date, text, text),
  public.admin_owner_stats() from public, anon;
grant execute on function public.admin_create_invitation(text, int), public.admin_revoke_invitation(uuid),
  public.admin_set_fee(uuid, numeric), public.report_subscription_payment(numeric, date, text, text),
  public.review_subscription_payment(uuid, boolean), public.admin_register_payment(uuid, numeric, date, text, text),
  public.admin_owner_stats() to authenticated;
