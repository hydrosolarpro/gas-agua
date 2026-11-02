"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import type { Order } from "@/lib/types";

const TZ = "America/Lima";

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

export function etaInfo(order: Pick<Order, "status" | "eta_at">, now: number) {
  if (order.status !== "en_camino" || !order.eta_at) return null;
  const at = new Date(order.eta_at);
  const left = Math.ceil((at.getTime() - now) / 60_000);
  const time = etaClock(order.eta_at);
  const text = left > 1 ? `faltan unos ${left} min` : left === 1 ? "falta alrededor de 1 min" : left >= -5 ? "debería estar llegando" : "se está demorando un poco";
  return { time, left, text, late: left < -5 };
}

/** Tarjeta grande con la hora estimada de llegada y la cuenta regresiva. */
export function EtaCard({ order, className = "" }: { order: Pick<Order, "status" | "eta_at">; className?: string }) {
  const now = useNow();
  const eta = etaInfo(order, now);
  if (!eta) return null;
  return (
    <div className={`flex items-center gap-3 rounded-2xl p-4 ${eta.late ? "bg-amber-50 text-amber-900" : "bg-indigo-50 text-indigo-900"} ${className}`}>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${eta.late ? "bg-amber-100" : "bg-indigo-100"}`}>
        <Clock className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Llegada estimada</p>
        <p className="text-2xl font-extrabold leading-tight">{eta.time}</p>
        <p className="text-sm font-semibold opacity-90">{eta.text}</p>
      </div>
    </div>
  );
}

/** Versión corta para listas de pedidos. */
export function EtaInline({ order }: { order: Pick<Order, "status" | "eta_at"> }) {
  const now = useNow();
  const eta = etaInfo(order, now);
  if (!eta) return null;
  return (
    <span className={`chip ${eta.late ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"}`}>
      <Clock className="h-3.5 w-3.5" /> Llega {eta.time}
      {eta.left > 0 && <span className="opacity-80">· {eta.left} min</span>}
    </span>
  );
}
