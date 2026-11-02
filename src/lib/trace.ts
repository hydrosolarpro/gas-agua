// Trazabilidad de un pedido: los tiempos de cada etapa y cuánto tardó cada una.

export type TraceInput = {
  created_at: string;
  accepted_at: string | null;
  picked_at: string | null;
  eta_minutes: number | null;
  arrived_at: string | null;
  payment_reported_at: string | null;
  payment_validated_at: string | null;
  delivered_at: string | null;
};

const TZ = "America/Lima";

/** Minutos entre dos instantes (null si falta alguno). */
export function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

export function fmtMin(m: number | null): string {
  if (m === null) return "—";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function clock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ });
}

/** Tiempos calculados de un pedido entregado (o en curso, con lo que haya hasta ahora). */
export function traceTimes(t: TraceInput) {
  const route = minutesBetween(t.picked_at, t.arrived_at ?? t.delivered_at);
  return {
    aceptar: minutesBetween(t.created_at, t.accepted_at),
    preparar: minutesBetween(t.accepted_at, t.picked_at),
    ruta: route,
    /** Llegada real menos la estimada: positivo = tardó más de lo prometido. */
    vsEstimado: route !== null && t.eta_minutes !== null && t.arrived_at ? route - t.eta_minutes : null,
    validar: minutesBetween(t.payment_reported_at, t.payment_validated_at),
    total: minutesBetween(t.created_at, t.delivered_at),
  };
}

export function etaVerdict(delta: number | null): string {
  if (delta === null) return "—";
  if (delta <= -1) return `${Math.abs(delta)} min antes`;
  if (delta >= 1) return `${delta} min después`;
  return "a tiempo";
}
