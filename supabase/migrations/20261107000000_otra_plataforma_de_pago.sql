-- Otra plataforma de pago del negocio (cuenta bancaria, Agora, Tunki, etc.), además de Yape y Plin.
alter table public.businesses add column if not exists other_pay_name text check (other_pay_name is null or length(other_pay_name) between 2 and 40);
alter table public.businesses add column if not exists other_pay_value text check (other_pay_value is null or length(other_pay_value) between 3 and 60);
grant update (other_pay_name, other_pay_value) on public.businesses to authenticated;
