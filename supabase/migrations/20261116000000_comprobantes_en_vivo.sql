-- Los comprobantes de pago llegan en vivo: el dueño los ve y recibe el aviso en el mismo instante.
-- (Las reglas de acceso siguen siendo las de la tabla: solo el dueño del negocio y el cliente del pedido los reciben.)
do $$
begin
  alter publication supabase_realtime add table public.order_proofs;
exception when duplicate_object then null;
end $$;
