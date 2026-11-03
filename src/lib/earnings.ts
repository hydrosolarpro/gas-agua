import type { DayRow, PayRow } from "@/lib/stats-pdf";

/** Un pedido entregado, ya reducido a lo necesario para sumar ganancias y pagos. */
export type Earn = {
  day: string;
  total: number;
  driverKey: string;
  driverName: string;
  scheme: string;
  gross: number | null;
  net: number | null;
  pay: number | null;
};

/** Ganancias por día: bruta y neta solo suman pedidos con costo conocido. */
export function dayRows(list: Earn[]): DayRow[] {
  const map = new Map<string, DayRow>();
  for (const e of list) {
    const r = map.get(e.day) ?? { day: e.day, deliveries: 0, sales: 0, gross: null, net: null, pay: 0 };
    r.deliveries += 1;
    r.sales += e.total;
    r.pay += e.pay ?? 0;
    if (e.gross !== null) r.gross = (r.gross ?? 0) + e.gross;
    if (e.net !== null) r.net = (r.net ?? 0) + e.net;
    map.set(e.day, r);
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** Cuánto se le debe a cada repartidor en el período. */
export function payRows(list: Earn[]): PayRow[] {
  const map = new Map<string, PayRow>();
  for (const e of list) {
    const r = map.get(e.driverKey) ?? { driver: e.driverName, scheme: e.scheme, deliveries: 0, total: 0, amount: 0, pending: 0 };
    r.deliveries += 1;
    r.total += e.total;
    if (e.pay === null) r.pending += 1;
    else r.amount += e.pay;
    map.set(e.driverKey, r);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
