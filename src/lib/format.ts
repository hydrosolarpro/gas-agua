import type { Category, OrderStatus, PaymentMethod, PaymentStatus } from "./types";

const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
export const money = (n: number | null | undefined) => soles.format(Number(n ?? 0));

export const time = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) : "—";

export const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

export const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  pendiente: { label: "Nuevo", tone: "bg-amber-100 text-amber-800" },
  aceptado: { label: "Aceptado", tone: "bg-sky-100 text-sky-800" },
  en_camino: { label: "En camino", tone: "bg-indigo-100 text-indigo-800" },
  entregado: { label: "Entregado", tone: "bg-emerald-100 text-emerald-800" },
  cancelado: { label: "Cancelado", tone: "bg-slate-200 text-slate-600" },
};

export const PAY_STATUS: Record<PaymentStatus, { label: string; tone: string }> = {
  pendiente: { label: "Cobro pendiente", tone: "bg-slate-100 text-slate-700" },
  reportado: { label: "Por validar", tone: "bg-orange-100 text-orange-800" },
  validado: { label: "Pago validado", tone: "bg-emerald-100 text-emerald-800" },
  rechazado: { label: "Pago rechazado", tone: "bg-rose-100 text-rose-800" },
};

export const METHOD: Record<PaymentMethod, { label: string; color: string }> = {
  yape: { label: "Yape", color: "#742284" },
  plin: { label: "Plin", color: "#00b2c3" },
  efectivo: { label: "Efectivo", color: "#16a34a" },
  otro: { label: "Otro", color: "#64748b" },
};

export const CATEGORY: Record<Category, { label: string }> = {
  gas: { label: "Gas" },
  agua: { label: "Agua" },
  otro: { label: "Otros" },
};

export const ACTIVE_STATUSES: OrderStatus[] = ["pendiente", "aceptado", "en_camino"];

export function waLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const full = digits.length === 9 ? `51${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function telLink(phone: string | null | undefined) {
  return `tel:${(phone ?? "").replace(/\D/g, "")}`;
}

export function errorMessage(e: unknown) {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (msg.includes("duplicate key") && msg.includes("phone")) return "Ese celular ya está registrado";
  if (msg.includes("profiles_phone_check")) return "El celular debe tener 9 dígitos y empezar con 9";
  return msg || "Ocurrió un error";
}
