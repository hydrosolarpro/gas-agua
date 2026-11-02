"use client";

import { CategoryIcon } from "@/components/icons";

import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { MethodBadge, PayBadge, StatusBadge } from "@/components/ui";
import { dateTime, money, time } from "@/lib/format";
import type { Order } from "@/lib/types";

const STEPS = [
  { key: "recibido", label: "Recibido" },
  { key: "aceptado", label: "Aceptado" },
  { key: "en_camino", label: "En camino" },
  { key: "pago", label: "Pago" },
  { key: "validado", label: "Validado" },
  { key: "entregado", label: "Entregado" },
] as const;

/** Último paso alcanzado: Recibido → Aceptado → En camino → Pago → Validado → Entregado. */
function reached(order: Order): number {
  if (order.status === "entregado") return 5;
  if (order.payment_status === "validado") return 4;
  if (order.payment_status === "reportado") return 3;
  if (order.status === "en_camino") return 2;
  if (order.status === "aceptado") return 1;
  return 0;
}

function stepTime(order: Order, key: (typeof STEPS)[number]["key"]) {
  const iso =
    key === "recibido" ? order.created_at
    : key === "aceptado" ? order.accepted_at
    : key === "en_camino" ? order.picked_at
    : key === "pago" ? order.payment_reported_at
    : key === "validado" ? order.payment_validated_at
    : order.delivered_at;
  return time(iso);
}

export function OrderTimeline({ order }: { order: Order }) {
  if (order.status === "cancelado") {
    return <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-600">Pedido cancelado{order.cancel_reason ? `: ${order.cancel_reason}` : ""}.</p>;
  }
  const current = reached(order);
  const rejected = order.payment_status === "rechazado" && order.status !== "entregado";
  return (
    <>
      <ol className="grid grid-cols-6 gap-0.5">
        {STEPS.map((s, i) => {
          const done = i <= current;
          return (
            <li key={s.key} className="flex flex-col items-center text-center">
              <div className="flex w-full items-center">
                <span className={`h-1 flex-1 rounded ${i === 0 ? "opacity-0" : done ? "bg-agua-500" : "bg-slate-200"}`} />
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    done ? "bg-agua-600 text-white" : "bg-slate-200 text-slate-500"
                  } ${i === current + 1 ? "marker-pulse" : ""}`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`h-1 flex-1 rounded ${i === STEPS.length - 1 ? "opacity-0" : i < current ? "bg-agua-500" : "bg-slate-200"}`} />
              </div>
              <span className={`mt-1.5 text-[10px] font-semibold leading-tight ${done ? "text-slate-800" : "text-slate-400"}`}>{s.label}</span>
              <span className="text-[9px] text-slate-400">{done ? stepTime(order, s.key) : ""}</span>
            </li>
          );
        })}
      </ol>
      {rejected && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">El negocio no pudo confirmar tu pago. Revisa tu comprobante o paga al repartidor.</p>}
    </>
  );
}

export function OrderItems({ order }: { order: Order }) {
  return (
    <div className="space-y-1.5">
      {order.order_items?.map((it) => (
        <div key={it.id} className="flex justify-between gap-2 text-sm">
          <span>
            <CategoryIcon category={it.category} className="mr-1.5 inline h-4 w-4 -mt-0.5 text-slate-500" />{it.quantity} × {it.name}
          </span>
          <span className="font-semibold">{money(it.subtotal)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-dashed pt-2 font-extrabold">
        <span>Total</span>
        <span>{money(order.total)}</span>
      </div>
    </div>
  );
}

export function OrderRow({ order, href, showCustomer }: { order: Order; href: string; showCustomer?: boolean }) {
  const summary = order.order_items?.map((i) => `${i.quantity} ${i.name}`).join(", ");
  return (
    <Link href={href} className="card flex items-center gap-3 p-4 transition hover:shadow-md">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold">#{order.code}</span>
          <StatusBadge status={order.status} />
          {order.payment_status !== "pendiente" && <PayBadge status={order.payment_status} />}
        </div>
        {showCustomer && <p className="mt-1 truncate text-sm font-semibold">{order.customer_name || "Cliente"}</p>}
        <p className="truncate text-sm text-slate-500">{summary || order.address_text}</p>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
          <MethodBadge method={order.payment_method} />
          <span>{dateTime(order.created_at)}</span>
        </div>
      </div>
      <div className="text-right">
        <p className="font-extrabold">{money(order.total)}</p>
        <ChevronRight className="ml-auto mt-1 h-5 w-5 text-slate-400" />
      </div>
    </Link>
  );
}

export const ORDER_SELECT = "*, order_items(*)";
