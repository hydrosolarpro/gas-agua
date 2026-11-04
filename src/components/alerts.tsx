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
        const row = p.new as {
          id: string; code?: string; total?: number; customer_name?: string; customer_id?: string; status: string;
          payment_status: string; payment_method?: string; payment_reported_at: string | null; cancelled_by?: string | null; cancel_reason?: string | null;
        };
        const what = row.code ? `#${row.code} · ${row.customer_name || "Cliente"} · ${money(Number(row.total ?? 0))}` : undefined;
        // El cliente canceló su pedido: se avisa al instante (no cuenta en los pedidos del día).
        if (row.status === "cancelado" && row.cancelled_by && row.cancelled_by === row.customer_id) {
          if (first(`cancelado:${row.id}`)) notify({ kind: "cancelado", title: "¡Un cliente canceló su pedido!", body: what, href: "/panel/pedidos" });
          return;
        }
        // Efectivo: el repartidor cobró y el pedido quedó entregado sin necesidad de validar.
        if (row.status === "entregado" && row.payment_method === "efectivo" && row.payment_status === "validado") {
          if (first(`entregado:${row.id}`)) notify({ kind: "venta", title: "¡Pedido entregado y cobrado en efectivo!", body: what, href: "/panel/pedidos" });
          return;
        }
        if (row.payment_status !== "reportado" || !first(`pago:${row.id}:${row.payment_reported_at}`)) return;
        notify({ kind: "pago", title: "¡Pago por validar!", body: what, href: "/panel/pedidos?filtro=validar" });
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
          const row = p.new as { id: string; code?: string; status: string; address_text?: string; cancelled_by?: string | null };
          if (row.status === "cancelado" && row.cancelled_by !== uid) {
            if (first(`anulado:${row.id}`)) {
              notify({ kind: "cancelado", title: "¡Pedido anulado!", body: `El cliente canceló el pedido${row.code ? ` #${row.code}` : ""}${row.address_text ? ` · ${row.address_text}` : ""}. Ya no debes entregarlo.`, href: "/repartidor" });
            }
            return;
          }
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

/** Cliente: avisos fuertes en cada paso de su pedido (aceptado, en camino, llegada al punto, pago, entregado, cancelado). */
export function ClientAlerts() {
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
        .channel(`avisos-cliente-${uid}-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `customer_id=eq.${uid}` }, (p) => {
          const o = p.new as {
            id: string; code?: string; total?: number; status: string; payment_status: string; payment_method?: string;
            arrived_at: string | null; eta_at: string | null; cancelled_by?: string | null; cancel_reason?: string | null;
          };
          const href = `/cliente/pedido/${o.id}`;
          const tag = o.code ? `Pedido #${o.code}` : "Tu pedido";
          // Del paso más avanzado al primero: cada paso avisa una sola vez.
          if (o.status === "cancelado") {
            if (o.cancelled_by === uid || !first(`c:${o.id}:cancelado`)) return;
            notify({ kind: "cancelado", title: "Tu pedido fue cancelado", body: `${tag}${o.cancel_reason ? ` · ${o.cancel_reason}` : ""}`, href });
          } else if (o.status === "entregado") {
            if (!first(`c:${o.id}:entregado`)) return;
            notify({ kind: "venta", title: "¡Pedido entregado!", body: `${tag} · ${money(Number(o.total ?? 0))}. ¡Gracias por tu compra!`, href });
          } else if (o.payment_status === "reportado") {
            if (!first(`c:${o.id}:pago`)) return;
            notify({ kind: "pago", title: "¡Pago registrado!", body: `${tag}. El negocio lo está validando; en cuanto lo confirme, tu pedido queda entregado.`, href });
          } else if (o.arrived_at) {
            if (!first(`c:${o.id}:llegada`)) return;
            notify({ kind: "llegada", title: "¡Tu repartidor llegó al punto!", body: `${tag}. Ya está en tu dirección: prepárate para ${o.payment_method === "efectivo" ? "pagar en efectivo" : "pagar y enviar tu captura"}.`, href });
          } else if (o.status === "en_camino") {
            if (!first(`c:${o.id}:camino`)) return;
            const hora = o.eta_at ? new Date(o.eta_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }) : null;
            notify({ kind: "derivado", title: "¡Tu pedido va en camino!", body: `${tag}${hora ? ` · llega a las ${hora}` : ""}`, href });
          } else if (o.status === "aceptado") {
            if (!first(`c:${o.id}:aceptado`)) return;
            notify({ kind: "venta", title: "¡Tu pedido fue aceptado!", body: `${tag}. Tu repartidor ya lo está preparando.`, href });
          }
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
