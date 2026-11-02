import type { SubscriptionPayment } from "@/lib/types";

/** Demo gratis: 15 días contando el día en que se crea el negocio y el último. */
export const DEMO_DAYS = 15;
/** Cada pago validado cubre 30 días continuos (inicio y fin incluidos). */
export const PLAN_DAYS = 30;
const TZ = "America/Lima";

const parts = (ymd: string) => ymd.split("-").map(Number) as [number, number, number];

/** Fecha (AAAA-MM-DD) en hora de Perú. */
export function limaDate(d: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(typeof d === "string" ? new Date(d) : d);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Días de `a` a `b` (b − a). */
export function diffDays(a: string, b: string): number {
  const [ya, ma, da] = parts(a);
  const [yb, mb, db] = parts(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

export function fmtDay(ymd: string): string {
  const [y, m, d] = parts(ymd);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Fecha y hora de un instante, en hora de Perú. */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-PE", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ });
}

/** Valor para un <input type="datetime-local"> con la hora actual de Perú. */
export function nowForInput(): string {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date());
  return f.replace(" ", "T");
}

/** Convierte lo escrito en un datetime-local (hora de Perú) a un instante ISO. */
export function inputToIso(value: string): string {
  return new Date(`${value}:00-05:00`).toISOString();
}

export type PlanPhase = "demo" | "pagado" | "vencido";
export type PlanLevel = "ok" | "aviso" | "manana" | "ultimo" | "vencido";

export type PlanState = {
  phase: PlanPhase;
  /** Inicio y fin del tramo en curso (demo o plan pagado). */
  from: string;
  to: string;
  demoStart: string;
  demoEnd: string;
  /** Último día cubierto contando renovaciones ya validadas. */
  until: string;
  /** Días que quedan (0 = hoy es el último día; negativo = vencido). */
  daysLeft: number;
  level: PlanLevel;
  pending: boolean;
};

/** Situación de un negocio hoy: demo, plan pagado o vencido, y cuánto falta. */
export function planFor(createdAt: string, payments: Pick<SubscriptionPayment, "status" | "valid_from" | "valid_to">[], today = limaDate()): PlanState {
  const demoStart = limaDate(createdAt);
  const demoEnd = addDays(demoStart, DEMO_DAYS - 1);
  const paid = payments.filter((p) => p.status === "validado" && p.valid_from && p.valid_to);
  const until = paid.reduce((m, p) => (p.valid_to! > m ? p.valid_to! : m), demoEnd);
  const current = paid.find((p) => p.valid_from! <= today && today <= p.valid_to!);
  const phase: PlanPhase = today > until ? "vencido" : current ? "pagado" : "demo";
  const daysLeft = diffDays(today, until);
  const level: PlanLevel = daysLeft < 0 ? "vencido" : daysLeft === 0 ? "ultimo" : daysLeft === 1 ? "manana" : daysLeft <= 3 ? "aviso" : "ok";
  return {
    phase,
    from: phase === "pagado" && current ? current.valid_from! : demoStart,
    to: phase === "pagado" && current ? current.valid_to! : demoEnd,
    demoStart,
    demoEnd,
    until,
    daysLeft,
    level,
    pending: payments.some((p) => p.status === "pendiente"),
  };
}

export function daysLabel(daysLeft: number): string {
  if (daysLeft < 0) return "Vencido";
  if (daysLeft === 0) return "Vence hoy";
  if (daysLeft === 1) return "Vence mañana";
  return `${daysLeft} días`;
}
