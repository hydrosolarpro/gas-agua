"use client";

import { Bike, MapPin, Search } from "@/components/icons";
import { BusinessLogo } from "@/components/BusinessBadge";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, MessageCircle, Phone } from "lucide-react";
import Map, { type MapMarker } from "@/components/map/Map";
import { OrderItems, OrderTimeline } from "@/components/orders";
import { OrderProofsClient } from "@/components/OrderProofs";
import { CopyField } from "@/components/CopyField";
import { EtaCard, MapEta, etaClock, etaLabel } from "@/components/Eta";
import { Empty, ErrorText, FullLoader, MethodBadge, PayBadge, TopBar } from "@/components/ui";
import { hasArrived } from "@/lib/arrival";
import { errorMessage, money, telLink, waLink } from "@/lib/format";
import { formatDistance, formatEta } from "@/lib/geo";
import { useDriverLocation, useOrder, useRoute, useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Business } from "@/lib/types";

type Person = { full_name: string; phone: string | null };

type Tab = "seguimiento" | "pago" | "detalle";

export default function SeguimientoPage() {
  const { id } = useParams<{ id: string }>();
  const { loading } = useSession(["cliente"]);
  const { order } = useOrder(id);
  const [business, setBusiness] = useState<Business | null>(null);
  const [driver, setDriver] = useState<Person | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("seguimiento");

  const tracking = order && (order.status === "aceptado" || order.status === "en_camino");
  const driverLoc = useDriverLocation(tracking ? order.driver_id : null);
  const destination = useMemo(() => (order ? { lat: order.lat, lng: order.lng } : null), [order]);
  const driverPoint = driverLoc ? { lat: driverLoc.lat, lng: driverLoc.lng } : null;
  const route = useRoute(driverPoint, destination);
  // Una vez que llega (o ya entregó) el pago queda a la vista; no se oculta si el GPS rebota.
  const [arrivedSeen, setArrivedSeen] = useState(false);
  const arrivedNow = Boolean(tracking && hasArrived(driverPoint, destination));
  useEffect(() => {
    if (arrivedNow) setArrivedSeen(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [arrivedNow]);
  const arrived = arrivedSeen || arrivedNow;
  useEffect(() => {
    if (arrivedNow) setTab("pago"); // eslint-disable-line react-hooks/set-state-in-effect
  }, [arrivedNow]);

  useEffect(() => {
    if (!order) return;
    supabaseBrowser().from("businesses").select("*").eq("id", order.business_id).single<Business>().then(({ data }) => setBusiness(data));
  }, [order?.business_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!order?.driver_id) return;
    supabaseBrowser().from("profiles").select("full_name, phone").eq("id", order.driver_id).single<Person>().then(({ data }) => setDriver(data));
  }, [order?.driver_id]);

  async function cancel() {
    if (!order || !confirm("¿Seguro que quieres cancelar tu pedido?")) return;
    const { error } = await supabaseBrowser().rpc("cancel_order", { p_order_id: order.id, p_reason: "Cancelado por el cliente" });
    if (error) setError(errorMessage(error));
  }

  if (loading || order === undefined) return <FullLoader />;
  if (!order) return <div className="p-4"><Empty icon={<Search className="h-12 w-12 text-slate-300" />} title="Pedido no encontrado" /></div>;

  const etaText = etaLabel(order);
  const markers: MapMarker[] = [{ id: "destino", kind: "destino", position: { lat: order.lat, lng: order.lng }, label: etaText ? `Tu dirección · ${etaText}` : "Tu dirección", permanent: Boolean(etaText) }];
  if (tracking && driverPoint) markers.push({ id: "repartidor", kind: "repartidor", position: driverPoint, label: driver?.full_name ?? "Repartidor" });

  const payNumber =
    order.payment_method === "yape" ? business?.yape_number : order.payment_method === "plin" ? business?.plin_number : order.payment_method === "otro" ? business?.other_pay_value : null;

  const etaTime = order.status === "en_camino" && order.eta_at ? etaClock(order.eta_at) : null;
  const base = {
    pendiente: { title: "Buscando repartidor…", text: `${business?.name ?? "El negocio"} está revisando tu pedido.` },
    aceptado: { title: "¡Pedido aceptado!", text: `${driver?.full_name ?? "Tu repartidor"} está preparando tu pedido.${order.eta_minutes ? ` Tardará ≈ ${order.eta_minutes} min en llegar una vez que salga.` : ""}` },
    en_camino: { title: etaTime ? `Llega a las ${etaTime}` : route ? `Llega en ${formatEta(route.durationS)}` : "¡Va en camino!", text: route ? `A ${formatDistance(route.distanceM)} de tu puerta` : `${driver?.full_name ?? "Tu repartidor"} ya salió hacia tu dirección.` },
    entregado: { title: "¡Entregado!", text: "Gracias por tu pedido." },
    cancelado: { title: "Pedido cancelado", text: order.cancel_reason ?? "" },
  }[order.status];
  const headline =
    order.status === "en_camino" && order.payment_status === "reportado"
      ? { title: "Validando tu pago…", text: "El negocio está confirmando tu pago. Apenas lo valide, tu pedido queda entregado." }
      : order.status === "en_camino" && order.payment_status === "rechazado"
        ? { title: "No pudimos confirmar tu pago", text: "Vuelve a enviar tu comprobante o paga directamente al repartidor." }
        : base;
  // El pago se muestra cuando llega el repartidor y se mantiene mientras se valida.
  const payNow = arrived && (order.payment_status === "pendiente" || order.payment_status === "rechazado") && order.status === "en_camino";
  const showPay = arrived || order.payment_status !== "pendiente" || order.status === "entregado";

  const TABS: { id: Tab; label: string; dot?: boolean }[] = [
    { id: "seguimiento", label: "Seguimiento" },
    { id: "pago", label: "Pago", dot: arrived && order.payment_status === "pendiente" },
    { id: "detalle", label: "Detalle" },
  ];
  const pane = (t: Tab) => (tab === t ? "block space-y-3" : "hidden");

  // Mapa y datos lado a lado en pantallas grandes; en celular, mapa arriba y una sección a la vez abajo.
  return (
    <div className="flex h-full flex-col">
      <TopBar title={`Pedido #${order.code}`} back="/cliente" />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[30dvh] shrink-0 lg:h-auto lg:flex-1">
          <Map
            center={driverPoint ?? { lat: order.lat, lng: order.lng }}
            zoom={16}
            className="h-full"
            markers={markers}
            route={tracking ? route?.points : undefined}
            fitKey={`${order.status}-${driverPoint ? "con" : "sin"}`}
          />
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
                className={`relative flex-1 rounded-xl px-2 py-2 text-sm font-bold transition ${tab === t.id ? "bg-white text-agua-700 shadow-sm" : "text-slate-500"}`}
              >
                {t.label}
                {t.dot && <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" aria-label="Novedad" />}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className={pane("seguimiento")}>
              <EtaCard order={order} />
        <section className="card p-4">
          <p className="text-2xl font-extrabold">{headline.title}</p>
          <p className="text-slate-600">{headline.text}</p>
          <div className="mt-5">
            <OrderTimeline order={order} />
          </div>
          {tracking && !driverPoint && order.status === "en_camino" && (
            <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">Esperando la señal GPS del repartidor…</p>
          )}
        </section>

        {driver && tracking && (
          <section className="card flex items-center gap-3 p-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-agua-100"><Bike className="h-6 w-6 text-agua-700" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500">Tu repartidor</p>
              <p className="truncate font-bold">{driver.full_name}</p>
              {driver.phone && (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Phone className="h-4 w-4 text-slate-500" /> {driver.phone}
                </p>
              )}
            </div>
            {driver.phone && (
              <>
                <a href={telLink(driver.phone)} className="rounded-full bg-agua-600 p-3 text-white" aria-label="Llamar">
                  <Phone className="h-5 w-5" />
                </a>
                <a href={waLink(driver.phone, `Hola, soy ${order.customer_name}, pedido #${order.code}`)} target="_blank" className="rounded-full bg-emerald-500 p-3 text-white" aria-label="WhatsApp">
                  <MessageCircle className="h-5 w-5" />
                </a>
              </>
            )}
          </section>
        )}

            </div>

            <div className={pane("pago")}>
        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Pago contra-entrega</h2>
            {order.payment_status !== "pendiente" ? <PayBadge status={order.payment_status} /> : <MethodBadge method={order.payment_method} />}
          </div>
          <p className="text-3xl font-extrabold">{money(order.total)}</p>
          {order.status !== "cancelado" && order.status !== "entregado" && !showPay && (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              Pagarás cuando tu repartidor llegue. Te avisaremos aquí y te mostraremos los datos para pagar.
            </p>
          )}
          {arrived && order.payment_status === "pendiente" && order.status !== "entregado" && order.status !== "cancelado" && (
            <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              ¡Tu repartidor llegó! {order.payment_method === "efectivo" ? "Entrégale el pago en efectivo." : "Paga ahora con los datos de abajo y sube tu captura."}
            </p>
          )}
          {payNumber && showPay && order.payment_status !== "validado" && (
            <CopyField
              label={order.payment_method === "otro" ? `Paga a: ${business?.other_pay_name ?? "otra plataforma"}` : `Paga por ${order.payment_method === "yape" ? "Yape" : "Plin"} al número`}
              value={payNumber}
              hint={business?.payment_holder ? `Titular: ${business.payment_holder}` : undefined}
            />
          )}
          {order.payment_method === "efectivo" && order.cash_amount && (
            <p className="text-sm text-slate-600">
              Pagas con {money(order.cash_amount)} · vuelto: <b>{money(order.cash_amount - order.total)}</b>
            </p>
          )}
        </section>

        {showPay && order.status !== "cancelado" && order.payment_method !== "efectivo" && <OrderProofsClient order={order} />}

            </div>

            <div className={pane("detalle")}>
        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Detalle</h2>
          <OrderItems order={order} />
          <p className="text-sm text-slate-600"><MapPin className="mr-1 inline h-4 w-4 -mt-0.5 text-gas-600" />{order.address_text}{order.reference ? ` · ${order.reference}` : ""}</p>
          {business && (
            <p className="text-sm text-slate-600">
              <BusinessLogo business={business} size="sm" className="mr-2 inline-block !h-6 !w-6 !rounded-lg align-middle !text-xs" />{business.name}
              {business.phone && (
                <a href={telLink(business.phone)} className="ml-2 font-semibold text-agua-700">Llamar</a>
              )}
            </p>
          )}
        </section>

        <ErrorText>{error}</ErrorText>
        {order.status === "pendiente" && (
          <button onClick={cancel} className="btn-outline w-full text-rose-600">
            Cancelar pedido
          </button>
        )}
            </div>
          </div>

          {payNow && tab !== "pago" && (
            <button onClick={() => setTab("pago")} className="cta-success shrink-0 animate-pulse">
              <CircleDollarSign className="h-6 w-6" /> {order.payment_method === "efectivo" ? "Ver cuánto pagar" : "Pagar ahora"}
            </button>
          )}
          {payNow && tab === "pago" && order.payment_method === "efectivo" && (
            <p className="shrink-0 rounded-2xl bg-emerald-600 p-4 text-center text-lg font-extrabold text-white">
              Entrega {money(order.total)} al repartidor
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
