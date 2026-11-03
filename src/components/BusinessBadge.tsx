"use client";

import { useEffect, useState } from "react";
import { Clock, Store } from "lucide-react";
import { openStatus, DAY_KEYS, DAY_NAMES, clock12, cleanHours, type OpeningHours } from "@/lib/hours";

type Brand = { name: string; logo_url?: string | null; opening_hours?: OpeningHours | null };

const SIZES = { sm: "h-9 w-9 text-sm", md: "h-12 w-12 text-lg", lg: "h-20 w-20 text-3xl" } as const;

/** Logo del negocio; si aún no subió uno, muestra la inicial en un círculo de color. */
export function BusinessLogo({ business, size = "md", className = "" }: { business: Brand; size?: keyof typeof SIZES; className?: string }) {
  // Se recuerda qué URL falló: si el dueño sube otro logo, se vuelve a intentar sin necesidad de un efecto.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === business.logo_url;
  const box = `${SIZES[size]} shrink-0 rounded-2xl ${className}`;
  if (business.logo_url && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={business.logo_url} alt={`Logo de ${business.name}`} onError={() => setFailedUrl(business.logo_url ?? null)} className={`${box} border border-slate-200 bg-white object-cover shadow-sm`} />;
  }
  return (
    <span className={`${box} flex items-center justify-center bg-gradient-to-br from-agua-500 to-agua-700 font-extrabold text-white shadow-sm`} aria-hidden>
      {business.name.trim().charAt(0).toUpperCase() || <Store className="h-1/2 w-1/2" />}
    </span>
  );
}

/** Logo + nombre + «Abierto / Cerrado», para la cabecera de clientes y repartidores. */
export function BusinessHeader({ business, className = "" }: { business: Brand; className?: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-3xl bg-white p-3 shadow-sm ring-1 ring-slate-200 ${className}`}>
      <BusinessLogo business={business} size="md" />
      <div className="min-w-0">
        <p className="truncate text-base font-extrabold text-slate-900">{business.name}</p>
        <OpenChip hours={business.opening_hours} />
      </div>
    </div>
  );
}

/** Insignia «Abierto ahora / Cerrado» que se actualiza sola cada minuto. */
export function OpenChip({ hours }: { hours: OpeningHours | null | undefined }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const st = openStatus(hours, now);
  if (!st.known) return null;
  return (
    <p className={`mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold ${st.open ? "text-emerald-700" : "text-rose-600"}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${st.open ? "bg-emerald-500" : "bg-rose-500"}`} />
      {st.text}
    </p>
  );
}

/** Lista completa de días y horas (para la tienda y para repartidores). */
export function HoursList({ hours }: { hours: OpeningHours | null | undefined }) {
  const h = cleanHours(hours);
  if (!h) return null;
  return (
    <div className="card">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700"><Clock className="h-4 w-4" /> Horario de atención</p>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {DAY_KEYS.map((k) => (
          <li key={k} className="flex justify-between gap-3">
            <span className="text-slate-600">{DAY_NAMES[k]}</span>
            <span className={h[k] ? "font-semibold text-slate-900" : "text-slate-400"}>{h[k] ? `${clock12(h[k]!.abre)} – ${clock12(h[k]!.cierra)}` : "Cerrado"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
