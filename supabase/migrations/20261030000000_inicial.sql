-- AguaGasExpress: esquema inicial
-- Tablas, seguridad (RLS), funciones de negocio y tiempo real.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('cliente', 'dueno', 'repartidor');
create type public.order_status as enum ('pendiente', 'aceptado', 'en_camino', 'entregado', 'cancelado');
create type public.payment_method as enum ('yape', 'plin', 'efectivo', 'otro');
create type public.payment_status as enum ('pendiente', 'reportado', 'validado', 'rechazado');
create type public.product_category as enum ('gas', 'agua', 'otro');

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text unique check (phone is null or phone ~ '^9[0-9]{8}$'),
  role public.user_role not null default 'cliente',
  onboarded boolean not null default false,
  has_pin boolean not null default false,
  address_text text,
  reference text,
  lat double precision,
  lng double precision,
  last_business_id uuid,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  slug text not null unique,
  phone text,
  yape_number text,
  plin_number text,
  payment_holder text,
  address_text text,
  lat double precision,
  lng double precision,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(name) between 2 and 80),
  description text,
  category public.product_category not null default 'gas',
  price numeric(10, 2) not null check (price >= 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  driver_id uuid references public.profiles (id) on delete set null,
  status public.order_status not null default 'pendiente',
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pendiente',
  total numeric(10, 2) not null default 0,
  cash_amount numeric(10, 2),
  amount_received numeric(10, 2),
  operation_code text,
  customer_name text not null default '',
  customer_phone text,
  address_text text not null,
  reference text,
  lat double precision not null,
  lng double precision not null,
  notes text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  picked_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  payment_reported_at timestamptz,
  payment_validated_at timestamptz,
  payment_validated_by uuid references public.profiles (id)
);
create index orders_business_created_idx on public.orders (business_id, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_driver_idx on public.orders (driver_id, status);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  category public.product_category not null,
  unit_price numeric(10, 2) not null,
  quantity int not null check (quantity between 1 and 50),
  subtotal numeric(10, 2) generated always as (unit_price * quantity) stored
);
create index order_items_order_idx on public.order_items (order_id);

create table public.driver_locations (
  driver_id uuid primary key references public.profiles (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  heading double precision,
  speed double precision,
  accuracy double precision,
  updated_at timestamptz not null default now()
);

create table public.pin_attempts (
  id bigserial primary key,
  phone text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index pin_attempts_phone_idx on public.pin_attempts (phone, created_at desc);

-- ---------------------------------------------------------------------------
-- Alta automática de perfil
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Funciones de apoyo para RLS
-- ---------------------------------------------------------------------------
create or replace function public.is_owner(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from businesses where id = p_business_id and owner_id = auth.uid());
$$;

create or replace function public.is_staff(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_owner(p_business_id)
      or exists (select 1 from business_members
                 where business_id = p_business_id and user_id = auth.uid() and active);
$$;

create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_profile_id = auth.uid()
      -- personal del negocio ve a sus clientes y repartidores
      or exists (select 1 from orders o where o.customer_id = p_profile_id and public.is_staff(o.business_id))
      or exists (select 1 from business_members m where m.user_id = p_profile_id and public.is_staff(m.business_id))
      or exists (select 1 from businesses b where b.owner_id = p_profile_id and public.is_staff(b.id))
      -- el cliente ve a su repartidor
      or exists (select 1 from orders o where o.driver_id = p_profile_id and o.customer_id = auth.uid());
$$;

create or replace function public.can_view_driver(p_driver_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_driver_id = auth.uid()
      or exists (select 1 from business_members m where m.user_id = p_driver_id and public.is_staff(m.business_id))
      or exists (select 1 from businesses b where b.owner_id = p_driver_id and public.is_staff(b.id))
      or exists (select 1 from orders o
                 where o.driver_id = p_driver_id and o.customer_id = auth.uid()
                   and o.status in ('aceptado', 'en_camino'));
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.driver_locations enable row level security;
alter table public.pin_attempts enable row level security;

create policy "perfil visible" on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy "perfil propio editable" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "negocios activos visibles" on public.businesses for select
  using (active or public.is_owner(id));
create policy "dueno edita su negocio" on public.businesses for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

create policy "miembros visibles" on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.is_owner(business_id));
create policy "dueno activa o desactiva" on public.business_members for update to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));

create policy "productos visibles" on public.products for select
  using (active or public.is_staff(business_id));
create policy "dueno crea productos" on public.products for insert to authenticated
  with check (public.is_owner(business_id));
create policy "dueno edita productos" on public.products for update to authenticated
  using (public.is_owner(business_id)) with check (public.is_owner(business_id));
create policy "dueno borra productos" on public.products for delete to authenticated
  using (public.is_owner(business_id));

create policy "pedidos visibles" on public.orders for select to authenticated
  using (customer_id = auth.uid() or public.is_staff(business_id));

create policy "items visibles" on public.order_items for select to authenticated
  using (exists (select 1 from orders o where o.id = order_id
                 and (o.customer_id = auth.uid() or public.is_staff(o.business_id))));

create policy "ubicacion visible" on public.driver_locations for select to authenticated
  using (public.can_view_driver(driver_id));
create policy "repartidor publica su ubicacion" on public.driver_locations for insert to authenticated
  with check (driver_id = auth.uid());
create policy "repartidor actualiza su ubicacion" on public.driver_locations for update to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

-- Columnas que el usuario puede editar directamente (el resto solo por funciones)
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone, address_text, reference, lat, lng, last_business_id, onboarded)
  on public.profiles to authenticated;

revoke insert, update, delete on public.businesses from anon, authenticated;
grant update (name, phone, yape_number, plin_number, payment_holder, address_text, lat, lng, active)
  on public.businesses to authenticated;

revoke insert, update, delete on public.business_members from anon, authenticated;
grant update (active) on public.business_members to authenticated;

revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;
revoke all on public.pin_attempts from anon, authenticated;
revoke all on public.driver_locations from anon;

-- ---------------------------------------------------------------------------
-- Funciones de negocio
-- ---------------------------------------------------------------------------
create or replace function public.create_business(
  p_name text,
  p_phone text default null,
  p_yape text default null,
  p_plin text default null,
  p_address text default null,
  p_lat double precision default null,
  p_lng double precision default null
) returns public.businesses
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text;
  v_business businesses;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from businesses where owner_id = v_uid) then
    raise exception 'Ya tienes un negocio registrado';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(translate(p_name,
              'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU')), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then v_slug := 'negocio'; end if;
  v_slug := left(v_slug, 40) || '-' || substr(md5(gen_random_uuid()::text), 1, 4);

  insert into businesses (owner_id, name, slug, phone, yape_number, plin_number, address_text, lat, lng)
  values (v_uid, trim(p_name), v_slug, p_phone, p_yape, p_plin, p_address, p_lat, p_lng)
  returning * into v_business;

  update profiles set role = 'dueno', onboarded = true where id = v_uid;

  -- Productos de ejemplo: el dueño ajusta nombres y precios en su panel
  insert into products (business_id, name, description, category, price, sort_order) values
    (v_business.id, 'Balón de gas 10 kg', 'Precio de ejemplo, edítalo en tu panel', 'gas', 45.00, 1),
    (v_business.id, 'Bidón de agua 20 L (recarga)', 'Precio de ejemplo, edítalo en tu panel', 'agua', 10.00, 2),
    (v_business.id, 'Bidón de agua 20 L con envase', 'Precio de ejemplo, edítalo en tu panel', 'agua', 25.00, 3);

  return v_business;
end;
$$;

create or replace function public.create_order(
  p_business_id uuid,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_address_text text,
  p_lat double precision,
  p_lng double precision,
  p_reference text default null,
  p_cash_amount numeric default null,
  p_notes text default null
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles;
  v_order orders;
  v_item jsonb;
  v_product products;
  v_qty int;
  v_total numeric(10, 2) := 0;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if not exists (select 1 from businesses where id = p_business_id and active) then
    raise exception 'Negocio no disponible';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido está vacío';
  end if;
  if p_lat is null or p_lng is null or coalesce(trim(p_address_text), '') = '' then
    raise exception 'Falta la ubicación de entrega';
  end if;

  select * into v_profile from profiles where id = v_uid;

  insert into orders (business_id, customer_id, payment_method, cash_amount, customer_name, customer_phone,
                      address_text, reference, lat, lng, notes)
  values (p_business_id, v_uid, p_payment_method,
          case when p_payment_method = 'efectivo' then p_cash_amount end,
          coalesce(v_profile.full_name, ''), v_profile.phone,
          trim(p_address_text), nullif(trim(coalesce(p_reference, '')), ''), p_lat, p_lng,
          nullif(trim(coalesce(p_notes, '')), ''))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty < 1 or v_qty > 50 then raise exception 'Cantidad inválida'; end if;
    select * into v_product from products
      where id = (v_item ->> 'product_id')::uuid and business_id = p_business_id and active;
    if not found then raise exception 'Producto no disponible'; end if;
    insert into order_items (order_id, product_id, name, category, unit_price, quantity)
      values (v_order.id, v_product.id, v_product.name, v_product.category, v_product.price, v_qty);
    v_total := v_total + v_product.price * v_qty;
  end loop;

  update orders set total = v_total where id = v_order.id returning * into v_order;

  update profiles
     set address_text = v_order.address_text, reference = v_order.reference,
         lat = v_order.lat, lng = v_order.lng, last_business_id = p_business_id
   where id = v_uid;

  return v_order;
end;
$$;

-- El personal toma o asigna un pedido
create or replace function public.assign_order(p_order_id uuid, p_driver_id uuid default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order orders;
  v_driver uuid;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or not public.is_staff(v_order.business_id) then raise exception 'Pedido no encontrado'; end if;
  if v_order.status not in ('pendiente', 'aceptado') then raise exception 'El pedido ya está en curso o cerrado'; end if;

  if public.is_owner(v_order.business_id) then
    v_driver := coalesce(p_driver_id, v_uid);
    if v_driver <> v_uid and not exists (
      select 1 from business_members where business_id = v_order.business_id and user_id = v_driver and active
    ) then raise exception 'Repartidor no válido'; end if;
  else
    if v_order.status = 'aceptado' and v_order.driver_id <> v_uid then
      raise exception 'Otro repartidor ya tomó este pedido';
    end if;
    v_driver := v_uid;
  end if;

  update orders set driver_id = v_driver, status = 'aceptado', accepted_at = coalesce(accepted_at, now())
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

create or replace function public.start_delivery(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or not (v_order.driver_id = auth.uid() or public.is_owner(v_order.business_id)) then
    raise exception 'Pedido no encontrado';
  end if;
  if v_order.status <> 'aceptado' then raise exception 'El pedido debe estar aceptado'; end if;
  update orders set status = 'en_camino', picked_at = now() where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

-- Entrega efectiva + registro del cobro contra-entrega
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

  update orders
     set status = 'entregado',
         delivered_at = now(),
         payment_method = coalesce(p_payment_method, payment_method),
         amount_received = coalesce(p_amount_received, total),
         operation_code = nullif(trim(coalesce(p_operation_code, '')), ''),
         payment_status = 'reportado',
         payment_reported_at = now()
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

-- El dueño confirma (o rechaza) que el dinero llegó
create or replace function public.validate_payment(p_order_id uuid, p_valid boolean default true)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order orders;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found or not public.is_owner(v_order.business_id) then raise exception 'Pedido no encontrado'; end if;
  if v_order.status <> 'entregado' then raise exception 'Primero se debe marcar la entrega'; end if;
  update orders
     set payment_status = case when p_valid then 'validado'::payment_status else 'rechazado'::payment_status end,
         payment_validated_at = now(),
         payment_validated_by = auth.uid()
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

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
  update orders set status = 'cancelado', cancelled_at = now(), cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_order_id returning * into v_order;
  return v_order;
end;
$$;

revoke execute on function public.create_business, public.create_order, public.assign_order, public.start_delivery,
  public.complete_delivery, public.validate_payment, public.cancel_order from public, anon;
grant execute on function public.create_business, public.create_order, public.assign_order, public.start_delivery,
  public.complete_delivery, public.validate_payment, public.cancel_order to authenticated;

-- ---------------------------------------------------------------------------
-- Tiempo real
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders, public.driver_locations;
