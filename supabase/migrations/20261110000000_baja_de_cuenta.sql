-- Baja de cuenta de un cliente: la cuenta queda cerrada y sin datos de contacto, pero los negocios conservan
-- el historial de sus pedidos. El celular queda libre para registrarse de nuevo.
alter table public.profiles add column if not exists deactivated_at timestamptz;
