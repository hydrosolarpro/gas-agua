-- Clientes invitados por el dueño y repartidores registrados solo con nombre y celular.

-- ---------------------------------------------------------------------------
-- Repartidores: invitación con aceptación y activación del PIN por el propio repartidor
-- ---------------------------------------------------------------------------
-- accepted = false: el celular ya tenía cuenta y la persona aún debe aceptar la invitación.
alter table public.business_members add column if not exists accepted boolean not null default true;
-- Mientras no haya PIN, el repartidor puede crear el suyo hasta esta fecha (la fija el servidor).
alter table public.profiles add column if not exists pin_setup_until timestamptz;

create or replace function public.accept_driver_invitation(p_business_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.business_members set active = true, accepted = true
   where business_id = p_business_id and user_id = auth.uid() and accepted = false;
  if not found then raise exception 'No tienes una invitación pendiente de este negocio'; end if;
  update public.profiles set role = 'repartidor' where id = auth.uid() and role = 'cliente';
end;
$$;

create or replace function public.decline_driver_invitation(p_business_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.business_members where business_id = p_business_id and user_id = auth.uid() and accepted = false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clientes de cada negocio (por invitación o por haber pedido)
-- ---------------------------------------------------------------------------
create table if not exists public.customer_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  token_hash text not null unique,
  note text,
  expires_at timestamptz not null,
  uses int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.customer_invitations enable row level security;
drop policy if exists "dueno ve sus invitaciones de clientes" on public.customer_invitations;
create policy "dueno ve sus invitaciones de clientes" on public.customer_invitations for select to authenticated
  using (public.is_owner(business_id) or public.is_admin());
revoke insert, update, delete on public.customer_invitations from anon, authenticated;

create table if not exists public.business_customers (
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  invitation_id uuid references public.customer_invitations (id) on delete set null,
  source text not null default 'pedido' check (source in ('invitacion', 'pedido')),
  created_at timestamptz not null default now(),
  primary key (business_id, customer_id)
);
create index if not exists business_customers_customer_idx on public.business_customers (customer_id);
alter table public.business_customers enable row level security;
drop policy if exists "clientes visibles" on public.business_customers;
create policy "clientes visibles" on public.business_customers for select to authenticated
  using (customer_id = auth.uid() or public.is_staff(business_id) or public.is_admin());
revoke insert, update, delete on public.business_customers from anon, authenticated;

-- Quien hace un pedido queda como cliente de ese negocio.
create or replace function public.register_customer_from_order()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.business_customers (business_id, customer_id, source)
  values (new.business_id, new.customer_id, 'pedido')
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists orders_register_customer on public.orders;
create trigger orders_register_customer after insert on public.orders
  for each row execute function public.register_customer_from_order();

insert into public.business_customers (business_id, customer_id, source)
  select distinct business_id, customer_id, 'pedido' from public.orders
  on conflict do nothing;

-- El personal del negocio ve los datos básicos de sus clientes.
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_profile_id = auth.uid()
      or exists (select 1 from orders o where o.customer_id = p_profile_id and public.is_staff(o.business_id))
      or exists (select 1 from business_customers bc where bc.customer_id = p_profile_id and public.is_staff(bc.business_id))
      or exists (select 1 from business_members m where m.user_id = p_profile_id and public.is_staff(m.business_id))
      or exists (select 1 from businesses b where b.owner_id = p_profile_id and public.is_staff(b.id))
      or exists (select 1 from orders o where o.driver_id = p_profile_id and o.customer_id = auth.uid());
$$;

create or replace function public.owner_create_customer_invitation(p_note text default null, p_days int default 30)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_business uuid; v_token text;
begin
  select id into v_business from public.businesses where owner_id = auth.uid();
  if v_business is null then raise exception 'Solo el dueño de un negocio puede invitar clientes'; end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.customer_invitations (business_id, token_hash, note, expires_at)
  values (v_business, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
          nullif(trim(coalesce(p_note, '')), ''),
          now() + make_interval(days => greatest(1, least(coalesce(p_days, 30), 180))));
  return v_token;
end;
$$;

create or replace function public.owner_revoke_customer_invitation(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.customer_invitations set revoked = true
   where id = p_id and public.is_owner(business_id);
end;
$$;

revoke execute on function public.accept_driver_invitation(uuid), public.decline_driver_invitation(uuid),
  public.owner_create_customer_invitation(text, int), public.owner_revoke_customer_invitation(uuid) from public, anon;
grant execute on function public.accept_driver_invitation(uuid), public.decline_driver_invitation(uuid),
  public.owner_create_customer_invitation(text, int), public.owner_revoke_customer_invitation(uuid) to authenticated;
