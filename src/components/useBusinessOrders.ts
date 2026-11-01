"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";

/** Pedidos del negocio (últimos `days` días) con actualización en vivo. */
export function useBusinessOrders(businessId: string, days = 14) {
  const [orders, setOrders] = useState<Order[] | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await supabaseBrowser()
      .from("orders")
      .select("*, order_items(*)")
      .eq("business_id", businessId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<Order[]>();
    setOrders(data ?? []);
  }, [businessId, days]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`panel-${businessId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, load]);

  return { orders, reload: load };
}

export type Driver = { user_id: string; active: boolean; profiles: { full_name: string; phone: string | null } };

export function useDrivers(businessId: string) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("business_members")
      .select("user_id, active, profiles(full_name, phone)")
      .eq("business_id", businessId)
      .returns<Driver[]>();
    setDrivers(data ?? []);
  }, [businessId]);
  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);
  return { drivers, reload: load };
}
