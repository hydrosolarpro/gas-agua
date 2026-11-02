"use client";

import { Check, Circle } from "lucide-react";
import { clock, etaVerdict, fmtMin, traceTimes, type TraceInput } from "@/lib/trace";

/** Trazabilidad del pedido para el dueño: hora de cada etapa y cuánto tardó. */
export function Traza({ order, driverName, defaultOpen = false }: { order: TraceInput & { status: string }; driverName?: string | null; defaultOpen?: boolean }) {
  const t = traceTimes(order);
  const steps: { label: string; at: string | null; note?: string }[] = [
    { label: "Pedido recibido", at: order.created_at },
    { label: driverName ? `Aceptado · repartidor ${driverName}` : "Aceptado", at: order.accepted_at, note: t.aceptar !== null ? `${fmtMin(t.aceptar)} después de recibirlo` : undefined },
    {
      label: "Salió a entregar",
      at: order.picked_at,
      note: [t.preparar !== null ? `${fmtMin(t.preparar)} de preparación` : null, order.eta_minutes ? `estimó ${fmtMin(order.eta_minutes)} de camino` : null].filter(Boolean).join(" · ") || undefined,
    },
    { label: "Llegó al punto de entrega", at: order.arrived_at, note: t.ruta !== null && order.arrived_at ? `${fmtMin(t.ruta)} de camino · ${etaVerdict(t.vsEstimado)} de lo estimado` : undefined },
    { label: "Pago informado", at: order.payment_reported_at },
    { label: "Pago validado", at: order.payment_validated_at, note: t.validar !== null ? `${fmtMin(t.validar)} en validarlo` : undefined },
    { label: "Entregado", at: order.delivered_at, note: t.total !== null ? `Tiempo total: ${fmtMin(t.total)}` : undefined },
  ];
  return (
    <details open={defaultOpen || order.status === "entregado"} className="rounded-2xl border border-slate-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 font-bold">
        Trazabilidad del pedido
        {t.total !== null && <span className="ml-2 text-sm font-semibold text-emerald-700">· {fmtMin(t.total)} en total</span>}
      </summary>
      <ol className="space-y-3 px-4 pb-4">
        {steps.map((s) => (
          <li key={s.label} className="flex gap-3">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.at ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
              {s.at ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${s.at ? "text-slate-900" : "text-slate-400"}`}>{s.label}</p>
              <p className="text-sm text-slate-600">{s.at ? clock(s.at) : "Aún no"}</p>
              {s.at && s.note && <p className="text-xs font-semibold text-agua-700">{s.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

