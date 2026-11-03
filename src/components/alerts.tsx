"use client";

import { useEffect } from "react";
import { useNotify } from "@/components/NotifyProvider";
import { money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

// Cada aviso se muestra una sola vez por sesión del navegador, aunque llegue repetido por tiempo real.
const seen = new Set<string>();
const first = (key: string) => {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
};

/** Pide permiso (una sola vez) para avisar aunque la pestaña esté en segundo plano. */
function askSystemPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
  } catch {}
}

type OrderBrief = { code: string; total: number; customer_name: string; address_text: string; order_items: { name: string; quantity: number }[] | null };

async function briefOf(id: string): Promise<OrderBrief | null> {
  const { data } = await supabaseBrowser()
    .from("orders")
    .select("code, total, customer_name, address_text, order_items(name, quantity)")
    .eq("id", id)
    .maybeSingle<OrderBrief>();
  return data;
}

const itemsText = (o: OrderBrief) => (o.order_items ?? []).map((i) => `${i.quantity}× ${i.name}`).join(", ");

/** Dueño: llega un pedido nuevo de un cliente, o un pago queda por validar. */
export function OwnerAlerts({ businessId }: { businessId: string }) {
  const { notify } = useNotify();

  useEffect(() => {
    askSystemPermission();
    const db = supabaseBrowser();
    const channel = db
      .channel(`avisos-dueno-${businessId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` }, async (p) => {
        const id = (p.new as { id: string }).id;
        if (!first(`pedido:${id}`)) return;
        // El pedido y sus productos se guardan juntos: al llegar el evento ya están completos. El aviso sale al instante.
        const n = p.new as { code?: string; customer_name?: string; total?: number };
        notify({
          kind: "venta",
          title: "¡Nuevo pedido!",
          body: n.code ? `#${n.code} · ${n.customer_name || "Cliente"} · ${money(Number(n.total ?? 0))}` : undefined,
          href: "/panel/pedidos?filtro=nuevos",
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` }, async (p) => {
        const row = p.new as { id: string; code?: string; total?: number; customer_name?: string; payment_status: string; payment_reported_at: string | null };
        if (row.payment_status !== "reportado" || !first(`pago:${row.id}:${row.payment_reported_at}`)) return;
        notify({ kind: "pago", title: "Pago por validar", body: row.code ? `#${row.code} · ${money(Number(row.total ?? 0))} · ${row.customer_name || "Cliente"}` : undefined, href: "/panel/pedidos?filtro=validar" });
      })
      // Cada comprobante nuevo (por ejemplo el del agua, después del del gas) también avisa al instante.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_proofs" }, (p) => {
        const row = p.new as { id: string; amount?: number };
        if (!first(`comprobante:${row.id}`)) return;
        notify({ kind: "pago", title: "Nuevo comprobante de pago", body: row.amount ? `Monto informado: ${money(Number(row.amount))}` : undefined, href: "/panel/pedidos?filtro=validar" });
      })
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [businessId, notify]);

  return null;
}

/** Repartidor: el dueño le deriva (asigna) un pedido. */
export function DriverAlerts() {
  const { notify } = useNotify();

  useEffect(() => {
    askSystemPermission();
    const db = supabaseBrowser();
    let alive = true;
    let channel: ReturnType<typeof db.channel> | null = null;
    db.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid || !alive) return;
      channel = db
        .channel(`avisos-repartidor-${uid}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `driver_id=eq.${uid}` }, async (p) => {
          const row = p.new as { id: string; status: string };
          if (row.status !== "aceptado" || !first(`asignado:${row.id}`)) return;
          const o = await briefOf(row.id);
          notify({
            kind: "derivado",
            title: "¡Te asignaron un pedido!",
            body: o ? `#${o.code} · ${o.address_text}${itemsText(o) ? ` · ${itemsText(o)}` : ""}` : undefined,
            href: `/repartidor/pedido/${row.id}`,
          });
        })
        .subscribe();
    });
    return () => {
      alive = false;
      if (channel) db.removeChannel(channel);
    };
  }, [notify]);

  return null;
}

/** Administrador: un dueño de negocio acaba de empezar su DEMO. */
export function AdminAlerts() {
  const { notify } = useNotify();

  useEffect(() => {
    askSystemPermission();
    const db = supabaseBrowser();
    const channel = db
      .channel(`avisos-admin-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "businesses" }, (p) => {
        const b = p.new as { id: string; name: string };
        if (!first(`demo:${b.id}`)) return;
        notify({ kind: "demo", title: "¡Nuevo dueño en DEMO!", body: `${b.name} empezó sus 15 días gratis`, href: "/admin/duenos" });
      })
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [notify]);

  return null;
}
