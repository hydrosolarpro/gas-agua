-- Garantiza en la base de datos que toda cuenta activa (cliente, dueño o repartidor) tenga celular y nombre.
-- Hasta ahora lo exigía solo la pantalla; los usuarios de Google entran sin celular y lo completan en "Bienvenida".
alter table public.profiles
  add constraint profiles_phone_required_when_onboarded
  check (not onboarded or phone is not null);

alter table public.profiles
  add constraint profiles_name_required_when_onboarded
  check (not onboarded or length(trim(full_name)) >= 2);
