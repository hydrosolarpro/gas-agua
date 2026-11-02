"use client";

import { Bike, MapPin, Search, Store } from "@/components/icons";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Copy, MessageCircle, Phone } from "lucide-react";
import Map, { type MapMarker } from "@/components/map/Map";
import { OrderItems, OrderTimeline } from "@/components/orders";
import { OrderProofsClient } from "@/components/OrderProofs";
import { Empty, ErrorText, FullLoader, MethodBadge, PayBadge, TopBar } from "@/components/ui";
import { errorMessage, money, telLink, waLink } from "@/lib/format";
import { formatDistance, formatEta } from "@/lib/geo";
import { useDriverLocation, useOrder, useRoute, useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Business } from "@/lib/types";

type Person = { full_name: string; phone: string | null };

export default function SeguimientoPage() {
  const { id } = useParams<{ id: string }>();
  const { loading } = useSession(["cliente"]);
  const { order } = useOrder(id);
  const [business, setBusiness] = useState<Business | null>(null);
  const [driver, setDriver] = useState<Person | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const tracking = order && (order.status === "aceptado" || order.status === "en_camino");
  const driverLoc = useDriverLocation(tracking ? order.driver_id : null);
  const destination = useMemo(() => (order ? { lat: order.lat, lng: order.lng } : null), [order]);
  const driverPoint = driverLoc ? { lat: driverLoc.lat, lng: driverLoc.lng } : null;
  const route = useRoute(driverPoint, destination);

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

  const markers: MapMarker[] = [{ id: "destino", kind: "destino", position: { lat: order.lat, lng: order.lng }, label: "Tu dirección" }];
  if (tracking && driverPoint) markers.push({ id: "repartidor", kind: "repartidor", position: driverPoint, label: driver?.full_name ?? "Repartidor" });

  const payNumber = order.payment_method === "yape" ? business?.yape_number : order.payment_method === "plin" ? business?.plin_number : null;

  const headline = {
    pendiente: { title: "Buscando repartidor…", text: `${business?.name ?? "El negocio"} está revisando tu pedido.` },
    aceptado: { title: "¡Pedido aceptado!", text: `${driver?.full_name ?? "Tu repartidor"} está preparando tu pedido.` },
    en_camino: { title: route ? `Llega en ${formatEta(route.durationS)}` : "¡Va en camino!", text: route ? `A ${formatDistance(route.distanceM)} de tu puerta` : `${driver?.full_name ?? "Tu repartidor"} ya salió hacia tu dirección.` },
    entregado: { title: "¡Entregado!", text: "Gracias por tu pedido." },
    cancelado: { title: "Pedido cancelado", text: order.cancel_reason ?? "" },
  }[order.status];

  return (
    <div className="min-h-dvh pb-8">
      <TopBar title={`Pedido #${order.code}`} back="/cliente" />
      <div className="relative">
        <Map
          center={driverPoint ?? { lat: order.lat, lng: order.lng }}
          zoom={16}
          className="h-[46dvh]"
          markers={markers}
          route={tracking ? route?.points : undefined}
          fitKey={`${order.status}-${driverPoint ? "con" : "sin"}`}
        />
      </div>

      <main className="relative z-10 mx-auto -mt-8 max-w-lg space-y-4 px-4">
        <section className="card p-5">
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

        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Pago contra-entrega</h2>
            {order.status === "entregado" ? <PayBadge status={order.payment_status} /> : <MethodBadge method={order.payment_method} />}
          </div>
          <p className="text-3xl font-extrabold">{money(order.total)}</p>
          {payNumber && order.status !== "entregado" && order.status !== "cancelado" && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(payNumber);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex w-full items-center justify-between rounded-2xl bg-slate-50 p-4 text-left"
            >
              <span>
                <span className="block text-xs text-slate-500">Al recibir, paga al número</span>
                <span className="text-lg font-bold">{payNumber}</span>
                {business?.payment_holder && <span className="block text-xs text-slate-500">{business.payment_holder}</span>}
              </span>
              <span className="flex items-center gap-1 text-sm font-semibold text-agua-700">
                <Copy className="h-4 w-4" /> {copied ? "¡Copiado!" : "Copiar"}
              </span>
            </button>
          )}
          {order.payment_method === "efectivo" && order.cash_amount && (
            <p className="text-sm text-slate-600">
              Pagas con {money(order.cash_amount)} · vuelto: <b>{money(order.cash_amount - order.total)}</b>
            </p>
          )}
        </section>

        {order.status !== "cancelado" && order.payment_method !== "efectivo" && <OrderProofsClient order={order} />}

        <section className="card space-y-3 p-5">
          <h2 className="font-bold">Detalle</h2>
          <OrderItems order={order} />
          <p className="text-sm text-slate-600"><MapPin className="mr-1 inline h-4 w-4 -mt-0.5 text-gas-600" />{order.address_text}{order.reference ? ` · ${order.reference}` : ""}</p>
          {business && (
            <p className="text-sm text-slate-600">
              <Store className="mr-1 inline h-4 w-4 -mt-0.5" />{business.name}
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
      </main>
    </div>
  );
}
