-- Baja de dueños y repartidores: la cuenta se cierra, pero el administrador (y cada dueño, en el caso de sus repartidores)
-- conserva el registro indicando que se dio de baja.
--   businesses.deactivated_at : cuándo el dueño se dio de baja (el negocio queda inactivo)
--   profiles.deactivated_phone : celular que tenía la persona al darse de baja (el celular queda libre para registrarse otra vez);
--                                solo lo ven el administrador, la propia persona y su equipo, como ya ocurre con el resto del perfil.
alter table public.businesses add column if not exists deactivated_at timestamptz;
alter table public.profiles add column if not exists deactivated_phone text;
