import type { Order, OrderDriverPay, OrderFinance } from "@/lib/types";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Costo y ganancias del pedido (solo existen para el dueño y para pedidos entregados). */
export const orderFinance = (o: Pick<Order, "order_finance">): OrderFinance | null => one(o.order_finance);

/** Pago al repartidor por ese pedido. */
export const orderPay = (o: Pick<Order, "order_driver_pay">): OrderDriverPay | null => one(o.order_driver_pay);

/** Columnas privadas que se piden junto con los pedidos (PostgREST las incrusta por la clave order_id). */
export const FINANCE_COLS = "order_finance(cost_total, gross_profit, net_profit), order_driver_pay(driver_id, pay_type, pay_value, distance_km, amount)";

export const sumBy = <T,>(list: T[], f: (x: T) => number | null | undefined) => list.reduce((s, x) => s + Number(f(x) ?? 0), 0);
