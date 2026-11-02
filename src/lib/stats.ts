import { addDays } from "@/lib/plan";

export type RangeMode = "dia" | "rango_dias" | "mes" | "rango_meses" | "anio" | "rango_anios";

export const RANGE_MODES: { id: RangeMode; label: string }[] = [
  { id: "dia", label: "Un día" },
  { id: "rango_dias", label: "Rango de días" },
  { id: "mes", label: "Un mes" },
  { id: "rango_meses", label: "Rango de meses" },
  { id: "anio", label: "Un año" },
  { id: "rango_anios", label: "Rango de años" },
];

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;
const dmy = (ymd: string) => ymd.split("-").reverse().join("/");
const lastDay = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export type Range = { from: string; to: string; label: string };

/** Convierte lo elegido en el filtro en fechas de inicio y fin (inclusive). Devuelve texto de error si falta algo o está al revés. */
export function resolveRange(mode: RangeMode, a: string, b: string): Range | string {
  const need = (v: string) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v);
  const second = mode === "rango_dias" || mode === "rango_meses" || mode === "rango_anios";
  if (!need(a) || (second && !need(b))) return "Completa las fechas del filtro";
  let r: Range;
  if (mode === "dia") r = { from: a, to: a, label: dmy(a) };
  else if (mode === "rango_dias") r = { from: a, to: b, label: `Del ${dmy(a)} al ${dmy(b)}` };
  else if (mode === "mes") r = { from: `${a}-01`, to: lastDay(a), label: monthName(a) };
  else if (mode === "rango_meses") r = { from: `${a}-01`, to: lastDay(b), label: `De ${monthName(a)} a ${monthName(b)}` };
  else if (mode === "anio") r = { from: `${a}-01-01`, to: `${a}-12-31`, label: `Año ${a}` };
  else r = { from: `${a}-01-01`, to: `${b}-12-31`, label: `Del año ${a} al ${b}` };
  if (r.from > r.to) return "La fecha de inicio no puede ser posterior a la de fin";
  return r;
}

/** Instantes (hora de Perú) que delimitan el rango: [desde, hasta). */
export function rangeBounds(r: Range) {
  return { since: `${r.from}T00:00:00-05:00`, until: `${addDays(r.to, 1)}T00:00:00-05:00` };
}
