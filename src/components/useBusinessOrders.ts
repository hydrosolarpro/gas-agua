"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { FINANCE_COLS } from "@/lib/finance";
import type { Order } from "@/lib/types";

/** Pedidos del negocio (últimos `days` días) con actualización en vivo. */
export function useBusinessOrders(businessId: string, days = 14) {
  const [orders, setOrders] = useState<Order[] | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const query = (cols: string) =>
      supabaseBrowser().from("orders").select(cols).eq("business_id", businessId).gte("created_at", since).order("created_at", { ascending: false }).limit(300).returns<Order[]>();
    // Si las tablas de ganancias aún no existen, el panel sigue funcionando sin ellas.
    const full = await query(`*, order_items(*), ${FINANCE_COLS}`);
    const { data } = full.error ? await query("*, order_items(*)") : full;
    setOrders(data ?? []);
  }, [businessId, days]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`panel-${businessId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` }, (p) => {
        // El cambio se ve al instante con lo que trae el evento; luego se completa con los detalles.
        const row = p.new as Order;
        setOrders((prev) => (prev ? prev.map((o) => (o.id === row.id ? { ...o, ...row, order_items: o.order_items, order_finance: o.order_finance, order_driver_pay: o.order_driver_pay } : o)) : prev));
        load();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, load]);

  /** Aplica de inmediato el pedido que devolvió una acción (validar, asignar…), sin esperar otra consulta. */
  const patch = useCallback((row: Partial<Order> & { id: string }) => {
    setOrders((prev) => (prev ? prev.map((o) => (o.id === row.id ? { ...o, ...row, order_items: o.order_items, order_finance: o.order_finance, order_driver_pay: o.order_driver_pay } : o)) : prev));
  }, []);

  return { orders, reload: load, patch };
}

export type Driver = {
  user_id: string;
  active: boolean;
  accepted: boolean;
  pay_type: "porcentaje" | "fijo" | "distancia" | null;
  pay_value: number | null;
  profiles: { full_name: string; phone: string | null; has_pin: boolean };
};

export function useDrivers(businessId: string) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const load = useCallback(async () => {
    const query = (cols: string) => supabaseBrowser().from("business_members").select(cols).eq("business_id", businessId).returns<Driver[]>();
    // Si las columnas de pago aún no existen en la base de datos, el equipo se sigue mostrando sin ellas.
    const full = await query("user_id, active, accepted, pay_type, pay_value, profiles(full_name, phone, has_pin)");
    const { data } = full.error ? await query("user_id, active, accepted, profiles(full_name, phone, has_pin)") : full;
    setDrivers(data ?? []);
  }, [businessId]);
  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);
  return { drivers, reload: load };
}
