"use client";

import { Bike, CircleCheck, Hand, House, MapPin, MethodMark, Search, StickyNote, TriangleAlert } from "@/components/icons";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Navigation, Phone } from "lucide-react";
import Map, { type MapMarker } from "@/components/map/Map";
import { OrderItems } from "@/components/orders";
import { Empty, ErrorText, FullLoader, MethodBadge, Sheet, Spinner, StatusBadge, TopBar } from "@/components/ui";
import { errorMessage, METHOD, money, telLink, waLink } from "@/lib/format";
import { distanceM, formatDistance, formatEta, googleMapsLink, wazeLink } from "@/lib/geo";
import { EtaCard, MapEta, etaLabel } from "@/components/Eta";
import { hasArrived } from "@/lib/arrival";
import { useOrder, useRoute, useSession, useShareLocation } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { PaymentMethod } from "@/lib/types";

type Tab = "entrega" | "pedido";

type Estimate = { secs: number; source: "ruta" | "local" | "referencial" };
const RANK = { referencial: 1, local: 2, ruta: 3 } as const;

/** Estimación hasta el punto de entrega: por la ruta real; si no hay GPS, desde el local; si tampoco, un valor referencial. */
function estimateEta(route: { durationS: number } | null, business: { lat: number | null; lng: number | null } | null, destination: { lat: number; lng: number } | null): Estimate {
  if (route) return { secs: route.durationS, source: "ruta" };
  if (business?.lat != null && business?.lng != null && destination) {
    return { secs: Math.max(120, (distanceM({ lat: business.lat, lng: business.lng }, destination) * 1.4) / 6), source: "local" };
  }
  return { secs: 15 * 60, source: "referencial" };
}

export default function EntregaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { loading, profile, business } = useSession(["repartidor"]);
  const { order, reload } = useOrder(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [received, setReceived] = useState("");
  const [opCode, setOpCode] = useState("");
  const [tab, setTab] = useState<Tab>("entrega");

  const mine = order?.driver_id === profile?.id;
  const sharing = Boolean(order && mine && (order.status === "aceptado" || order.status === "en_camino"));
  const { state: gps, position } = useShareLocation(sharing, profile?.id);
  const destination = useMemo(() => (order ? { lat: order.lat, lng: order.lng } : null), [order]);
  const route = useRoute(position, destination);

  async function rpc(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { error } = await supabaseBrowser().rpc(fn, args);
    if (error) setError(errorMessage(error));
    await reload();
    setBusy(false);
    return !error;
  }

  // Al llegar al punto de entrega (a pocos metros) se registra la hora real de llegada, una sola vez.
  const arrivalSent = useRef(false);
  useEffect(() => {
    if (!order || arrivalSent.current || order.status !== "en_camino" || order.arrived_at || !mine) return;
    if (!hasArrived(position, destination)) return;
    arrivalSent.current = true;
    supabaseBrowser().rpc("mark_arrived", { p_order_id: order.id }).then(() => reload());
  }, [order, mine, position, destination, reload]);

  // Desde que toma el pedido se guarda la estimación hasta el punto de entrega; se mejora cuando llega la ruta real.
  const estimate = estimateEta(route, business, destination);
  const sentRank = useRef(0);
  useEffect(() => {
    if (!order || !mine || order.status !== "aceptado") return;
    const dbRank = order.eta_source ? RANK[order.eta_source] : 0;
    const rank = RANK[estimate.source];
    if (rank <= Math.max(sentRank.current, dbRank)) return;
    sentRank.current = rank;
    supabaseBrowser()
      .rpc("set_eta", { p_order_id: order.id, p_eta_seconds: Math.round(estimate.secs), p_source: estimate.source })
      .then(() => reload());
  }, [order, mine, estimate.secs, estimate.source, reload]);

  async function startDelivery() {
    if (!order) return;
    await rpc("start_delivery", { p_order_id: order.id, p_eta_seconds: Math.round(estimate.secs), p_source: estimate.source });
  }

  async function confirmDelivery() {
    if (!order) return;
    const amount = received ? Number(received) : order.total;
    if (method === "efectivo" && amount < order.total) return setError("El monto recibido es menor al total del pedido");
    const ok = await rpc("complete_delivery", {
      p_order_id: order.id,
      p_amount_received: amount,
      p_operation_code: opCode || null,
      p_payment_method: method,
    });
    if (ok) {
      setPayOpen(false);
      router.replace("/repartidor");
    }
  }

  if (loading || order === undefined) return <FullLoader />;
  if (!order) return <div className="p-4"><Empty icon={<Search className="h-12 w-12 text-slate-300" />} title="Pedido no encontrado" /></div>;

  const total = Number(order.total);
  const change = method === "efectivo" && received ? Number(received) - total : null;
  const etaText = etaLabel(order);
  const markers: MapMarker[] = [{ id: "destino", kind: "destino", position: destination!, label: etaText ? `${order.address_text} · ${etaText}` : order.address_text, permanent: Boolean(etaText) }];
  if (position) markers.push({ id: "yo", kind: "repartidor", position, label: "Tú" });
  const payNumber = method === "yape" ? business?.yape_number : method === "plin" ? business?.plin_number : null;

  const TABS: { id: Tab; label: string }[] = [
    { id: "entrega", label: "Entrega" },
    { id: "pedido", label: "Pedido y cobro" },
  ];
  const pane = (t: Tab) => (tab === t ? "block space-y-3" : "hidden");

  // Mapa y datos lado a lado en pantallas grandes; abajo, la acción principal siempre a la vista.
  return (
    <div className="flex h-full flex-col">
      <TopBar title={`Pedido #${order.code}`} back="/repartidor" right={<StatusBadge status={order.status} />} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[28dvh] shrink-0 lg:h-auto lg:flex-1">
          <Map center={position ?? destination!} zoom={16} className="h-full" markers={markers} route={sharing ? route?.points : undefined} fitKey={`${order.status}-${position ? 1 : 0}`} />
          <MapEta order={order} />
        </div>

        <aside className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-3 lg:w-[26rem] lg:flex-none lg:border-l lg:border-slate-200">
          <div className="flex shrink-0 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-xl px-2 py-2 text-sm font-bold transition ${tab === t.id ? "bg-white text-agua-700 shadow-sm" : "text-slate-500"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={pane("entrega")}>
              <EtaCard order={order} />
        {sharing && (
          <section className="card p-3">
            {gps === "sin_permiso" ? (
              <p className="text-sm font-medium text-rose-700"><TriangleAlert className="mr-1 inline h-4 w-4 -mt-0.5" /> Activa el permiso de ubicación del navegador para que el cliente te vea en el mapa.</p>
            ) : (
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                </span>
                Compartiendo tu ubicación en vivo {route && `· ${formatDistance(route.distanceM)} · ${formatEta(route.durationS)}`}
              </p>
            )}
          </section>
        )}

        <section className="card space-y-3 p-4">
          <div>
            <p className="text-xs text-slate-500">Cliente</p>
            <p className="text-xl font-bold">{order.customer_name || "Cliente"}</p>
            {order.customer_phone && (
              <p className="mt-0.5 flex items-center gap-1.5 text-lg font-semibold text-slate-700">
                <Phone className="h-4 w-4 text-slate-500" /> {order.customer_phone}
              </p>
            )}
            <p className="mt-1 text-slate-700"><MapPin className="mr-1 inline h-4 w-4 -mt-0.5 text-gas-600" />{order.address_text}</p>
            {order.reference && <p className="text-sm text-slate-500"><House className="mr-1 inline h-4 w-4 -mt-0.5" />{order.reference}</p>}
            {order.notes && <p className="mt-1 text-sm text-slate-500"><StickyNote className="mr-1 inline h-4 w-4 -mt-0.5" />{order.notes}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <a href={googleMapsLink(destination!)} target="_blank" className="btn-primary px-3 text-sm">
              <Navigation className="h-4 w-4" /> Google Maps
            </a>
            <a href={wazeLink(destination!)} target="_blank" className="btn-outline px-3 text-sm">
              <Navigation className="h-4 w-4" /> Waze
            </a>
            {order.customer_phone && (
              <>
                <a href={telLink(order.customer_phone)} className="btn-ghost px-3 text-sm">
                  <Phone className="h-4 w-4" /> Llamar
                </a>
                <a href={waLink(order.customer_phone, `Hola ${order.customer_name}, soy tu repartidor de ${business?.name ?? "AguaGasExpress"}. Pedido #${order.code}.`)} target="_blank" className="btn-ghost px-3 text-sm text-emerald-700">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </>
            )}
          </div>
        </section>

            </div>
            <div className={pane("pedido")}>
        <section className="card space-y-3 p-5">
          <OrderItems order={order} />
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
            <span className="text-sm text-slate-600">Cobrar al entregar</span>
            <MethodBadge method={order.payment_method} />
          </div>
          {order.payment_method === "efectivo" && order.cash_amount && (
            <p className="text-sm text-slate-600">
              Paga con {money(order.cash_amount)} → lleva vuelto de <b>{money(order.cash_amount - total)}</b>
            </p>
          )}
        </section>

            </div>
          </div>

          <div className="shrink-0 space-y-2">
            <ErrorText>{error}</ErrorText>
        {order.status === "pendiente" && (
          <button onClick={() => rpc("assign_order", { p_order_id: order.id })} disabled={busy} className="cta-gas">
            <Hand className="h-5 w-5" /> Tomar este pedido
          </button>
        )}
        {order.status === "aceptado" && mine && (
          <button onClick={startDelivery} disabled={busy} className="cta-primary">
            {busy ? <Spinner className="h-5 w-5" /> : <Bike className="h-5 w-5" />} Salir a entregar · ≈ {formatEta(estimate.secs)}
          </button>
        )}
        {order.status === "en_camino" && mine && order.payment_status !== "reportado" && (
          <button
            onClick={() => {
              setMethod(order.payment_method === "otro" ? "efectivo" : order.payment_method);
              setReceived(order.payment_method === "efectivo" && order.cash_amount ? String(order.cash_amount) : "");
              setOpCode("");
              setPayOpen(true);
            }}
            className="cta-success"
          >
            <CircleCheck className="h-6 w-6" /> Entregué y cobré
          </button>
        )}
        {order.status === "en_camino" && order.payment_status === "reportado" && (
          <p className="rounded-2xl bg-orange-50 p-4 text-center font-semibold text-orange-800">
            Cobro de {money(order.amount_received ?? total)} registrado. Cuando el negocio lo valide, el pedido queda entregado.
          </p>
        )}
        {order.status === "entregado" && (
          <p className="rounded-2xl bg-emerald-50 p-4 text-center font-semibold text-emerald-800">
            Pedido entregado y pago validado. ¡Buen trabajo!
          </p>
        )}
          </div>
        </aside>
      </div>

      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title="Registrar cobro">
        <p className="mb-4 text-3xl font-extrabold">{money(total)}</p>
        <p className="label">¿Cómo pagó el cliente?</p>
        <div className="grid grid-cols-3 gap-2">
          {(["yape", "plin", "efectivo"] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-2xl border-2 p-3 font-bold transition ${method === m ? "border-transparent text-white" : "border-slate-200"}`}
              style={method === m ? { background: METHOD[m].color } : undefined}
            >
              <span className="inline-flex items-center justify-center gap-1.5"><MethodMark method={m} className="h-6 w-6" />{METHOD[m].label}</span>
            </button>
          ))}
        </div>

        {method === "efectivo" ? (
          <div className="mt-4">
            <label className="label">Monto recibido</label>
            <input className="input" inputMode="decimal" value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(total)} />
            {change !== null && change >= 0 && (
              <p className="mt-2 rounded-2xl bg-emerald-50 p-3 text-center font-bold text-emerald-800">Vuelto a dar: {money(change)}</p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {payNumber && (
              <p className="rounded-2xl bg-slate-50 p-3 text-sm">
                El cliente debe pagar al <b>{payNumber}</b>. Confirma en tu celular que el pago llegó.
              </p>
            )}
            <div>
              <label className="label">Código de operación (opcional)</label>
              <input className="input" inputMode="numeric" value={opCode} onChange={(e) => setOpCode(e.target.value)} placeholder="Ej. 4821937" />
            </div>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        <button onClick={confirmDelivery} disabled={busy} className="cta-success mt-5">
          {busy && <Spinner className="h-5 w-5" />} Confirmar cobro
        </button>
      </Sheet>
    </div>
  );
}
