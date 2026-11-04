export type PayType = "porcentaje" | "fijo" | "distancia";

export const PAY_TYPES: { id: PayType; title: string; unit: string; hint: string; example: (v: number) => string }[] = [
  {
    id: "porcentaje",
    title: "% del monto",
    unit: "%",
    hint: "Gana un porcentaje del total de cada pedido entregado.",
    example: (v) => `En un pedido de S/ 50 gana S/ ${((50 * v) / 100).toFixed(2)}`,
  },
  {
    id: "fijo",
    title: "Fijo por pedido",
    unit: "S/",
    hint: "Gana lo mismo por cada pedido entregado, sea grande o pequeño.",
    example: (v) => `Cada pedido le paga S/ ${v.toFixed(2)}`,
  },
  {
    id: "distancia",
    title: "Por distancia",
    unit: "S/ por km",
    hint: "Gana según los kilómetros del local al cliente (se mide en línea recta × 1.3). Requiere tu ubicación en «Datos de mi Negocio».",
    example: (v) => `Un pedido a 3 km le paga S/ ${(3 * v).toFixed(2)}`,
  },
];

export const MAX_PAY: Record<PayType, number> = { porcentaje: 100, fijo: 1000, distancia: 1000 };

export function isPayType(v: unknown): v is PayType {
  return v === "porcentaje" || v === "fijo" || v === "distancia";
}

/** Valida tipo y valor de pago; devuelve el valor redondeado o un mensaje de error. */
export function checkPay(type: unknown, value: unknown): { ok: true; type: PayType; value: number } | { ok: false; error: string } {
  if (!isPayType(type)) return { ok: false, error: "Elige cómo le vas a pagar" };
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "Escribe cuánto le vas a pagar" };
  if (n > MAX_PAY[type]) return { ok: false, error: type === "porcentaje" ? "El porcentaje no puede pasar de 100" : "Ese monto es demasiado alto" };
  return { ok: true, type, value: Math.round(n * 100) / 100 };
}

/** «todos los productos» o «solo Balón de gas 10 kg, Bidón…», según los productos elegidos (null o vacío = todos). */
export function payScope(ids: string[] | null | undefined, names: Record<string, string>): string {
  if (!ids || ids.length === 0) return "todos los productos";
  const list = ids.map((id) => names[id]).filter(Boolean);
  return list.length ? `solo ${list.join(", ")}` : "productos elegidos";
}

/** Texto corto: «10 % del monto», «S/ 3.50 por pedido», «S/ 2.00 por km». */
export function payLabel(type: string | null | undefined, value: number | string | null | undefined): string {
  if (!isPayType(type) || value === null || value === undefined) return "Sin forma de pago definida";
  const v = Number(value);
  if (type === "porcentaje") return `${v} % del monto`;
  if (type === "fijo") return `S/ ${v.toFixed(2)} por pedido`;
  return `S/ ${v.toFixed(2)} por km`;
}
