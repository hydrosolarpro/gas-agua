export const DAY_KEYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type DayHours = { abre: string; cierra: string };
export type OpeningHours = Partial<Record<DayKey, DayHours>>;

export const DAY_NAMES: Record<DayKey, string> = {
  lun: "Lunes",
  mar: "Martes",
  mie: "Miércoles",
  jue: "Jueves",
  vie: "Viernes",
  sab: "Sábado",
  dom: "Domingo",
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Deja solo días con horas válidas (abre < cierra). Devuelve null si no queda ninguno. */
export function cleanHours(h: OpeningHours | null | undefined): OpeningHours | null {
  const out: OpeningHours = {};
  for (const k of DAY_KEYS) {
    const d = h?.[k];
    if (d && HHMM.test(d.abre) && HHMM.test(d.cierra) && d.abre < d.cierra) out[k] = { abre: d.abre, cierra: d.cierra };
  }
  return Object.keys(out).length ? out : null;
}

/** "14:30" → "2:30 p. m." */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suf = h >= 12 ? "p. m." : "a. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suf}`;
}

/** Día y hora actuales en Lima (el negocio opera en hora peruana, sin importar el dispositivo). */
function limaNow(now: Date): { idx: number; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hh = (parts.find((p) => p.type === "hour")?.value ?? "00").replace("24", "00");
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const idx = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  return { idx: idx < 0 ? 0 : idx, hhmm: `${hh}:${mm}` };
}

export type OpenStatus = { known: boolean; open: boolean; text: string };

/** Estado «Abierto / Cerrado» ahora mismo, con una frase corta para mostrar. */
export function openStatus(hours: OpeningHours | null | undefined, now = new Date()): OpenStatus {
  const h = cleanHours(hours);
  if (!h) return { known: false, open: true, text: "" };
  const { idx, hhmm } = limaNow(now);
  const today = h[DAY_KEYS[idx]];
  if (today && hhmm >= today.abre && hhmm < today.cierra) return { known: true, open: true, text: `Abierto hasta las ${clock12(today.cierra)}` };
  if (today && hhmm < today.abre) return { known: true, open: false, text: `Cerrado ahora · abre hoy ${clock12(today.abre)}` };
  for (let i = 1; i <= 7; i++) {
    const k = DAY_KEYS[(idx + i) % 7];
    const d = h[k];
    if (d) return { known: true, open: false, text: `Cerrado ahora · abre ${i === 1 ? "mañana" : DAY_NAMES[k].toLowerCase()} ${clock12(d.abre)}` };
  }
  return { known: true, open: false, text: "Cerrado" };
}

/**
 * Inicio de la «jornada» del negocio: el último cierre de su horario ya pasado (hora de Lima). Al llegar la hora de cierre
 * la jornada se reinicia y empieza una nueva; sin horario definido, la jornada empieza a la medianoche.
 */
export function businessDayStart(hours: OpeningHours | null | undefined, now = new Date()): Date {
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(d);
  const h = cleanHours(hours);
  if (h) {
    for (let back = 0; back <= 7; back++) {
      const day = new Date(now.getTime() - back * 86_400_000);
      const d = h[DAY_KEYS[limaNow(day).idx]];
      if (!d) continue;
      const close = new Date(`${ymd(day)}T${d.cierra}:00-05:00`);
      if (close.getTime() <= now.getTime()) return close;
    }
  }
  return new Date(`${ymd(now)}T00:00:00-05:00`);
}
