"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { hasArrived } from "@/lib/arrival";
import { useDriverLocation } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";

type Active = { id: string; code: string; driver_id: string; lat: number; lng: number };

/** Avisa al cliente, en cualquier pantalla de su sesión, cuando su repartidor llega al punto de entrega. */
export function ArrivalWatcher() {
  const pathname = usePathname();
  const [order, setOrder] = useState<Active | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  // Pedido en camino del cliente (se refresca cada 15 s, y al instante si hay cambios).
  useEffect(() => {
    const db = supabaseBrowser();
    let alive = true;
    const load = async () => {
      const { data: u } = await db.auth.getUser();
      if (!u.user) return;
      const { data } = await db
        .from("orders")
        .select("id, code, driver_id, lat, lng")
        .eq("customer_id", u.user.id)
        .eq("status", "en_camino")
        .in("payment_status", ["pendiente", "rechazado"])
        .not("driver_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<Active>();
      if (alive) setOrder(data ?? null);
    };
    load();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const loc = useDriverLocation(order?.driver_id);
  const arrived = Boolean(order && loc && hasArrived({ lat: loc.lat, lng: loc.lng }, { lat: order.lat, lng: order.lng }));

  // Vibración y notificación del navegador, una sola vez por pedido.
  useEffect(() => {
    if (!order || !arrived) return;
    const key = `llego_${order.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    navigator.vibrate?.([300, 150, 300, 150, 600]);
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("¡Tu repartidor llegó!", { body: `Pedido #${order.code}. Ya puedes pagar.` });
      }
    } catch {}
  }, [arrived, order]);

  // Pide permiso para avisar aunque la pestaña esté en segundo plano (solo una vez, si aún no se decidió).
  useEffect(() => {
    if (!order) return;
    try {
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    } catch {}
  }, [order]);

  if (!order || !arrived || dismissed === order.id) return null;
  const onOrderPage = pathname === `/cliente/pedido/${order.id}`;
  return (
    <div role="alert" className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-emerald-600 p-4 text-white shadow-2xl">
      <BellRing className="h-6 w-6 shrink-0 animate-bounce" />
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">¡Tu repartidor llegó!</p>
        <p className="text-sm opacity-90">Pedido #{order.code}. Es hora de pagar.</p>
      </div>
      {!onOrderPage && (
        <Link href={`/cliente/pedido/${order.id}`} className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-bold text-emerald-700">
          Pagar
        </Link>
      )}
      <button onClick={() => setDismissed(order.id)} className="shrink-0 rounded-full p-1.5 text-white/80" aria-label="Cerrar aviso">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
