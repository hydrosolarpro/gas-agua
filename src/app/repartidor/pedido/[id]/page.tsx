"use client";

import { Bike, CircleCheck, Hand, House, MapPin, MethodMark, Search, StickyNote, TriangleAlert } from "@/components/icons";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MessageCircle, Navigation, Phone } from "lucide-react";
import Map, { type MapMarker } from "@/components/map/Map";
import { OrderItems } from "@/components/orders";
import { Empty, ErrorText, FullLoader, MethodBadge, Sheet, Spinner, StatusBadge, TopBar } from "@/components/ui";
import { errorMessage, METHOD, money, telLink, waLink } from "@/lib/format";
import { formatDistance, formatEta, googleMapsLink, wazeLink } from "@/lib/geo";
import { useOrder, useRoute, useSession, useShareLocation } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { PaymentMethod } from "@/lib/types";

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
  const markers: MapMarker[] = [{ id: "destino", kind: "destino", position: destination!, label: order.address_text }];
  if (position) markers.push({ id: "yo", kind: "repartidor", position, label: "Tú" });
  const payNumber = method === "yape" ? business?.yape_number : method === "plin" ? business?.plin_number : null;

  return (
    <div className="min-h-dvh pb-8">
      <TopBar title={`Pedido #${order.code}`} back="/repartidor" right={<StatusBadge status={order.status} />} />
      <Map center={position ?? destination!} zoom={16} className="h-[40dvh]" markers={markers} route={sharing ? route?.points : undefined} fitKey={`${order.status}-${position ? 1 : 0}`} />

      <main className="relative z-10 mx-auto -mt-6 max-w-lg space-y-4 px-4">
        {sharing && (
          <section className="card p-4">
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

        <section className="card space-y-4 p-5">
          <div>
            <p className="text-xs text-slate-500">Cliente</p>
            <p className="text-xl font-bold">{order.customer_name || "Cliente"}</p>
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

        <ErrorText>{error}</ErrorText>

        {order.status === "pendiente" && (
          <button onClick={() => rpc("assign_order", { p_order_id: order.id })} disabled={busy} className="btn-gas w-full">
            <Hand className="h-5 w-5" /> Tomar este pedido
          </button>
        )}
        {order.status === "aceptado" && mine && (
          <button onClick={() => rpc("start_delivery", { p_order_id: order.id })} disabled={busy} className="btn-primary w-full text-lg">
            {busy ? <Spinner className="h-5 w-5" /> : <Bike className="h-5 w-5" />} Salir a entregar
          </button>
        )}
        {(order.status === "aceptado" || order.status === "en_camino") && mine && order.payment_status !== "reportado" && (
          <button
            onClick={() => {
              setMethod(order.payment_method === "otro" ? "efectivo" : order.payment_method);
              setReceived(order.payment_method === "efectivo" && order.cash_amount ? String(order.cash_amount) : "");
              setOpCode("");
              setPayOpen(true);
            }}
            className="btn-success w-full text-lg"
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
      </main>

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
        <button onClick={confirmDelivery} disabled={busy} className="btn-success mt-5 w-full text-lg">
          {busy && <Spinner className="h-5 w-5" />} Confirmar cobro
        </button>
      </Sheet>
    </div>
  );
}
