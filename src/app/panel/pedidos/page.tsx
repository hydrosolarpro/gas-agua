"use client";

import { OrderProofsOwner } from "@/components/OrderProofs";
import { Bike, CircleCheck, CircleX, Hand, Inbox, MapPin, StickyNote } from "@/components/icons";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import Map from "@/components/map/Map";
import { OrderItems, OrderRow, OrderTimeline } from "@/components/orders";
import { Empty, ErrorText, FullLoader, MethodBadge, PayBadge, Sheet, Spinner, StatusBadge } from "@/components/ui";
import { useBusinessOrders, useDrivers } from "@/components/useBusinessOrders";
import { EtaCard } from "@/components/Eta";
import { Traza } from "@/components/Traza";
import { ACTIVE_STATUSES, dateTime, errorMessage, money, telLink, waLink } from "@/lib/format";
import { useDriverLocation } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";
import { usePanel } from "@/components/panel-context";

type Filter = "todos" | "nuevos" | "curso" | "validar" | "entregados" | "cancelados";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "nuevos", label: "Nuevos" },
  { id: "curso", label: "En curso" },
  { id: "validar", label: "Por validar" },
  { id: "entregados", label: "Entregados" },
  { id: "cancelados", label: "Cancelados" },
];

function matches(o: Order, f: Filter) {
  switch (f) {
    case "nuevos": return o.status === "pendiente";
    case "curso": return o.status === "aceptado" || o.status === "en_camino";
    case "validar": return o.payment_status === "reportado" && (o.status === "en_camino" || o.status === "entregado");
    case "entregados": return o.status === "entregado";
    case "cancelados": return o.status === "cancelado";
    default: return true;
  }
}

function OrderDetail({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const { business, profile } = usePanel();
  const { drivers } = useDrivers(business.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const tracking = order.status === "aceptado" || order.status === "en_camino";
  const driverLoc = useDriverLocation(tracking ? order.driver_id : null);
  const driverName = order.driver_id === profile.id ? "Tú" : drivers.find((d) => d.user_id === order.driver_id)?.profiles.full_name;

  async function run(key: string, fn: string, args: Record<string, unknown>) {
    setBusy(key);
    setError("");
    const { error } = await supabaseBrowser().rpc(fn, args);
    if (error) setError(errorMessage(error));
    else onChanged();
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <MethodBadge method={order.payment_method} />
        {order.payment_status !== "pendiente" && <PayBadge status={order.payment_status} />}
        <span className="ml-auto text-xs text-slate-500">{dateTime(order.created_at)}</span>
      </div>

      <EtaCard order={order} />

      {order.status !== "cancelado" && (order.status === "entregado" || order.payment_status === "reportado" || order.payment_status === "rechazado") && (
        <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-4">
          <p className="font-bold text-orange-900">Pago informado · {driverName ?? "repartidor"}</p>
          <p className="text-2xl font-extrabold">{money(order.amount_received ?? order.total)}</p>
          <p className="text-sm text-orange-900/80">
            {order.payment_method === "efectivo" ? "Recibe el efectivo del repartidor y confirma." : "Revisa tu app de Yape/Plin y confirma que el pago llegó."}
            {order.operation_code ? ` · Operación ${order.operation_code}` : ""}
          </p>
          {order.payment_status === "reportado" && order.status !== "entregado" && (
            <p className="mt-1 text-sm font-semibold text-orange-900">Al validar, el pedido se marca como entregado automáticamente.</p>
          )}
          {order.payment_status === "rechazado" && order.status !== "entregado" && (
            <p className="mt-1 text-sm font-semibold text-rose-700">Marcaste que el pago no llegó. Esperando un nuevo cobro o comprobante.</p>
          )}
          {order.payment_status === "reportado" && (
            <div className="mt-3 grid gap-2">
              <button onClick={() => run("ok", "validate_payment", { p_order_id: order.id, p_valid: true })} disabled={busy !== null} className="cta-success">
                {busy === "ok" ? <Spinner className="h-5 w-5" /> : <CircleCheck className="h-5 w-5" />} Validar pago
              </button>
              <button onClick={() => run("no", "validate_payment", { p_order_id: order.id, p_valid: false })} disabled={busy !== null} className="cta-danger">
                <CircleX className="h-5 w-5" /> No llegó
              </button>
            </div>
          )}
        </div>
      )}


      {(order.status === "pendiente" || order.status === "aceptado") && (
        <div className="space-y-2">
          <p className="text-lg font-extrabold">¿Quién lo lleva?</p>
          <div className="grid gap-2">
            <button onClick={() => run("yo", "assign_order", { p_order_id: order.id })} disabled={busy !== null} className={order.driver_id === profile.id ? "cta-primary" : "cta-outline"}>
              <Hand className="h-5 w-5" /> Yo lo llevo {order.driver_id === profile.id && "✓"}
            </button>
            {drivers.filter((d) => d.active && d.accepted && d.profiles.has_pin).map((d) => (
              <button key={d.user_id} onClick={() => run(d.user_id, "assign_order", { p_order_id: order.id, p_driver_id: d.user_id })} disabled={busy !== null} className={order.driver_id === d.user_id ? "cta-primary" : "cta-outline"}>
                <Bike className="h-5 w-5" /> {d.profiles.full_name} {order.driver_id === d.user_id && "✓"}
              </button>
            ))}
          </div>
          {drivers.length === 0 && <p className="text-xs text-slate-500">Agrega repartidores en la sección Equipo.</p>}
        </div>
      )}


      <OrderTimeline order={order} />

      <Map
        center={{ lat: order.lat, lng: order.lng }}
        zoom={16}
        className="h-52 rounded-2xl"
        markers={[
          { id: "d", kind: "destino", position: { lat: order.lat, lng: order.lng }, label: order.address_text },
          ...(driverLoc ? [{ id: "r", kind: "repartidor" as const, position: { lat: driverLoc.lat, lng: driverLoc.lng }, label: driverName ?? "Repartidor" }] : []),
        ]}
        fitKey={driverLoc ? "con" : "sin"}
      />

      <div className="rounded-2xl bg-slate-50 p-4">
        <p className="font-bold">{order.customer_name || "Cliente"}</p>
        <p className="text-sm text-slate-600"><MapPin className="mr-1 inline h-4 w-4 -mt-0.5 text-gas-600" />{order.address_text}{order.reference ? ` · ${order.reference}` : ""}</p>
        {order.notes && <p className="text-sm text-slate-600"><StickyNote className="mr-1 inline h-4 w-4 -mt-0.5" />{order.notes}</p>}
        {order.customer_phone && (
          <div className="mt-3 flex gap-2">
            <a href={telLink(order.customer_phone)} className="btn-ghost flex-1 py-2 text-sm"><Phone className="h-4 w-4" /> Llamar</a>
            <a href={waLink(order.customer_phone, `Hola ${order.customer_name}, te escribimos de ${business.name} por tu pedido #${order.code}.`)} target="_blank" className="btn-ghost flex-1 py-2 text-sm text-emerald-700"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
          </div>
        )}
      </div>

      <OrderItems order={order} />
      <OrderProofsOwner order={order} />

      {order.status === "aceptado" && order.driver_id === profile.id && (
        <p className="text-sm text-slate-600">Para entregar y cobrar tú mismo, abre el pedido en la vista de repartidor.</p>
      )}
      {order.driver_id === profile.id && ACTIVE_STATUSES.includes(order.status) && order.status !== "pendiente" && (
        <a href={`/repartidor/pedido/${order.id}`} className="cta-primary"><Bike className="h-5 w-5" /> Abrir como repartidor</a>
      )}

      <Traza order={order} driverName={driverName} />

      {(order.status === "pendiente" || order.status === "aceptado" || order.status === "en_camino") && (
        <button
          onClick={() => confirm("¿Cancelar este pedido?") && run("cancel", "cancel_order", { p_order_id: order.id, p_reason: "Cancelado por el negocio" })}
          disabled={busy !== null}
          className="btn-outline w-full text-rose-600"
        >
          Cancelar pedido
        </button>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function Pedidos() {
  const { business } = usePanel();
  const params = useSearchParams();
  const initial = (params.get("filtro") as Filter) || "todos";
  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.id === initial) ? initial : "todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { orders, reload } = useBusinessOrders(business.id, 30);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, (orders ?? []).filter((o) => matches(o, f.id)).length])) as Record<Filter, number>,
    [orders],
  );

  if (!orders) return <FullLoader />;
  const list = orders.filter((o) => matches(o, filter));
  const selected = orders.find((o) => o.id === selectedId) ?? null;

  return (
    <main className="mx-auto flex h-full max-w-6xl flex-col gap-3 p-3 md:p-5">
      <h1 className="shrink-0 text-xl font-extrabold md:text-2xl">Pedidos</h1>
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filter === f.id ? "bg-agua-600 text-white shadow" : "bg-white text-slate-600"}`}
          >
            {f.label} <span className="opacity-70">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
      {list.length === 0 && <Empty icon={<Inbox className="h-12 w-12 text-slate-300" />} title="No hay pedidos aquí" text="Los pedidos nuevos aparecerán solos, sin recargar." />}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {list.map((o) => (
          <button key={o.id} className="min-w-0 text-left" onClick={() => setSelectedId(o.id)}>
            <div className="pointer-events-none">
              <OrderRow order={o} href="#" showCustomer />
            </div>
          </button>
        ))}
      </div>
      </div>

      <Sheet open={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected ? `Pedido #${selected.code}` : ""}>
        {selected && <OrderDetail order={selected} onChanged={reload} />}
      </Sheet>
    </main>
  );
}

export default function PedidosPage() {
  return (
    <Suspense>
      <Pedidos />
    </Suspense>
  );
}
