"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import type { Order } from "@/lib/types";

const TZ = "America/Lima";

type EtaOrder = Pick<Order, "status" | "eta_at" | "eta_minutes" | "eta_source"> & { address_text?: string };

/** Reloj que se actualiza solo para que la cuenta regresiva avance sin recargar. */
function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** Hora de llegada en formato peruano (sin depender de la hora actual). */
export const etaClock = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", timeZone: TZ });

export function etaInfo(order: EtaOrder, now: number) {
  // Desde que el repartidor toma el pedido: minutos estimados de camino hasta el punto de entrega.
  if (order.status === "aceptado" && order.eta_minutes) {
    return { phase: "prep" as const, time: null as string | null, left: order.eta_minutes, minutes: order.eta_minutes, text: "de camino al punto de entrega, desde que salga", late: false };
  }
  if (order.status !== "en_camino" || !order.eta_at) return null;
  const at = new Date(order.eta_at);
  const left = Math.ceil((at.getTime() - now) / 60_000);
  const time = etaClock(order.eta_at);
  const text = left > 1 ? `faltan unos ${left} min` : left === 1 ? "falta alrededor de 1 min" : left >= -5 ? "debería estar llegando" : "se está demorando un poco";
  return { phase: "ruta" as const, time, left, minutes: order.eta_minutes ?? left, text, late: left < -5 };
}

const SOURCE_NOTE: Record<string, string> = {
  referencial: "Estimación referencial (sin ubicación del repartidor)",
  local: "Estimado desde el local hasta el punto de entrega",
};

/** Texto corto para el mapa: «≈ 12 min» al tomar el pedido, «Llega 4:35 p. m.» una vez en camino. */
export function etaLabel(order: EtaOrder): string | null {
  if (order.status === "aceptado" && order.eta_minutes) return `≈ ${order.eta_minutes} min`;
  if (order.status === "en_camino" && order.eta_at) return `Llega ${etaClock(order.eta_at)}`;
  return null;
}

/** Tarjeta grande y de color con el tiempo estimado hasta el punto de entrega (y la hora de llegada al salir). */
export function EtaCard({ order, className = "" }: { order: EtaOrder; className?: string }) {
  const now = useNow();
  const eta = etaInfo(order, now);
  if (!eta) return null;
  const prep = eta.phase === "prep";
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-4 text-white shadow-lg ${eta.late ? "bg-gradient-to-r from-amber-600 to-orange-500" : "bg-gradient-to-r from-indigo-600 to-sky-500"} ${className}`}>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/20">
        <Clock className="h-8 w-8" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide opacity-90">{prep ? "Tiempo estimado de entrega" : "Llegada estimada"}</p>
        <p className="text-4xl font-extrabold leading-tight">{prep ? `≈ ${eta.minutes} min` : eta.time}</p>
        <p className="text-sm font-semibold">{eta.text}</p>
        {order.address_text && (
          <p className="mt-1 flex items-start gap-1 text-sm opacity-95">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">Hasta: {order.address_text}</span>
          </p>
        )}
        {order.eta_source && SOURCE_NOTE[order.eta_source] && <p className="mt-0.5 text-[11px] opacity-80">{SOURCE_NOTE[order.eta_source]}</p>}
      </div>
    </div>
  );
}

/** Insignia flotante sobre el mapa con la estimación, siempre a la vista. */
export function MapEta({ order }: { order: EtaOrder }) {
  const now = useNow();
  const eta = etaInfo(order, now);
  if (!eta) return null;
  const prep = eta.phase === "prep";
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-2xl bg-indigo-700 px-3.5 py-2 text-white shadow-xl ring-2 ring-white">
      <Clock className="h-6 w-6" />
      <div className="leading-tight">
        <p className="text-[10px] font-bold uppercase tracking-wide opacity-90">{prep ? "Tiempo estimado" : "Llegada estimada"}</p>
        <p className="text-xl font-extrabold">{prep ? `≈ ${eta.minutes} min` : eta.time}</p>
        {!prep && eta.left > 0 && <p className="text-[11px] font-semibold opacity-90">faltan {eta.left} min</p>}
      </div>
    </div>
  );
}

/** Versión corta para listas de pedidos. */
export function EtaInline({ order }: { order: EtaOrder }) {
  const now = useNow();
  const eta = etaInfo(order, now);
  if (!eta) return null;
  return (
    <span className={`chip ${eta.late ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"}`}>
      <Clock className="h-3.5 w-3.5" />
      {eta.phase === "prep" ? `≈ ${eta.minutes} min de camino` : `Llega ${eta.time}`}
      {eta.phase === "ruta" && eta.left > 0 && <span className="opacity-80">· {eta.left} min</span>}
    </span>
  );
}
