"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { BusinessLogo, HoursList, OpenChip } from "@/components/BusinessBadge";
import { waLink } from "@/lib/format";
import type { Business } from "@/lib/types";

const TZ = "America/Lima";

/** Mensaje de bienvenida con el nombre del cliente, la fecha de hoy y la hora en tiempo real (hora de Perú). */
export function WelcomeClock({ name, subtitle = "¿Qué necesitas hoy?" }: { name: string; subtitle?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const rawDate = now ? new Intl.DateTimeFormat("es-PE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now) : "";
  const date = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);
  const time = now ? new Intl.DateTimeFormat("es-PE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(now) : "";
  return (
    <section className="flex shrink-0 items-center justify-between gap-3 rounded-3xl bg-gradient-to-br from-agua-600 to-agua-500 p-4 text-white shadow-lg">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold leading-tight md:text-2xl">¡Bienvenido, {name}!</h1>
        <p className="mt-0.5 text-sm font-semibold opacity-95">{date || " "}</p>
        <p className="text-xs opacity-90">{subtitle}</p>
      </div>
      <p className="shrink-0 rounded-2xl bg-white/20 px-3 py-2 text-lg font-extrabold tabular-nums md:text-2xl" aria-live="off">
        {time || "--:--:--"}
      </p>
    </section>
  );
}

/** Datos del negocio del cliente: logo, nombre, si está abierto, horario y botón de WhatsApp con el negocio. */
export function BusinessInfoCard({ business, customerName }: { business: Business; customerName: string }) {
  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center gap-3">
        <BusinessLogo business={business} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-xl font-extrabold leading-tight">{business.name}</p>
        </div>
      </div>
      {business.phone && (
        <a
          href={waLink(business.phone, `Hola ${business.name}, soy ${customerName}, cliente de AguaGasExpress.`)}
          target="_blank"
          rel="noopener noreferrer"
          className="cta cta-success"
        >
          <MessageCircle className="h-6 w-6" /> Escribir por WhatsApp al negocio
        </a>
      )}
      {business.opening_hours ? (
        <details className="rounded-2xl bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-bold text-slate-700">Ver horario de atención completo</summary>
          <div className="mt-2 space-y-2">
            <OpenChip hours={business.opening_hours} />
            <HoursList hours={business.opening_hours} />
          </div>
        </details>
      ) : (
        <p className="text-sm text-slate-500">El negocio aún no publicó su horario de atención.</p>
      )}
    </section>
  );
}
