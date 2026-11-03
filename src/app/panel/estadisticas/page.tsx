"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import type { Order } from "@/lib/types";
import { usePanel } from "@/components/panel-context";
import { useDrivers } from "@/components/useBusinessOrders";
import { Empty, ErrorText, Spinner } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { dayRows as buildDays, payRows as buildPays, round2, type Earn } from "@/lib/earnings";
import { FINANCE_COLS, orderFinance, orderPay } from "@/lib/finance";
import { payLabel } from "@/lib/pay";
import { fmtDay, limaDate } from "@/lib/plan";
import { RANGE_MODES, rangeBounds, resolveRange, type Range, type RangeMode } from "@/lib/stats";
import { downloadStatsPdf, type CancelledRow, type CustomerStat, type DayRow, type DeliveryRow, type PayRow, type Summary } from "@/lib/stats-pdf";
import { clock, etaVerdict, fmtMin, minutesBetween, traceTimes } from "@/lib/trace";
import { supabaseBrowser } from "@/lib/supabase/client";

type OrderRow = {
  id: string;
  code: string;
  status: string;
  total: number;
  payment_status: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  created_at: string;
};
type CancelledOrder = OrderRow & {
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  order_items: { name: string; quantity: number }[];
};
type Link = { customer_id: string; source: "invitacion" | "pedido"; created_at: string; profile: { full_name: string; phone: string | null } | null };

type DeliveredOrder = {
  code: string;
  customer_name: string;
  total: number;
  created_at: string;
  accepted_at: string | null;
  picked_at: string | null;
  eta_minutes: number | null;
  arrived_at: string | null;
  payment_reported_at: string | null;
  payment_validated_at: string | null;
  delivered_at: string | null;
  driver_id: string | null;
  driver: { full_name: string } | null;
} & Pick<Order, "order_finance" | "order_driver_pay">;

type Report = { range: Range; summary: Summary; cancelled: CancelledRow[]; customers: CustomerStat[]; deliveries: DeliveryRow[]; days: DayRow[]; pays: PayRow[] };

/** Trae todas las filas de una consulta paginando de a 1000 (límite del servidor). */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export default function Estadisticas() {
  const { business } = usePanel();
  const { drivers } = useDrivers(business.id);
  const today = limaDate();
  const [mode, setMode] = useState<RangeMode>("mes");
  const [a, setA] = useState(today.slice(0, 7));
  const [b, setB] = useState(today.slice(0, 7));
  const [report, setReport] = useState<Report | null>(null);
  const [rtab, setRtab] = useState<"entregas" | "ganancias" | "pagos" | "cancelados" | "clientes">("entregas");
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState("");

  const year = Number(today.slice(0, 4));
  const firstYear = Number(limaDate(business.created_at).slice(0, 4));
  const years = Array.from({ length: year - firstYear + 1 }, (_, i) => String(year - i));

  function pick(next: RangeMode) {
    setMode(next);
    setReport(null);
    const day = today;
    const month = today.slice(0, 7);
    const y = today.slice(0, 4);
    const v = next === "dia" || next === "rango_dias" ? day : next === "mes" || next === "rango_meses" ? month : y;
    setA(v);
    setB(v);
  }

  async function load() {
    const r = resolveRange(mode, a, b);
    if (typeof r === "string") return setError(r);
    setError("");
    setLoading(true);
    try {
      const db = supabaseBrowser();
      const { since, until } = rangeBounds(r);
      const [orders, cancelledOrders, links, deliveredOrders] = await Promise.all([
        all<OrderRow>((f, t) =>
          db
            .from("orders")
            .select("id, code, status, total, payment_status, customer_id, customer_name, customer_phone, created_at")
            .eq("business_id", business.id)
            .gte("created_at", since)
            .lt("created_at", until)
            .order("created_at", { ascending: false })
            .range(f, t)
            .returns<OrderRow[]>(),
        ),
        all<CancelledOrder>((f, t) =>
          db
            .from("orders")
            .select("id, code, status, total, payment_status, customer_id, customer_name, customer_phone, created_at, cancelled_at, cancelled_by, cancel_reason, order_items(name, quantity)")
            .eq("business_id", business.id)
            .eq("status", "cancelado")
            .gte("cancelled_at", since)
            .lt("cancelled_at", until)
            .order("cancelled_at", { ascending: false })
            .range(f, t)
            .returns<CancelledOrder[]>(),
        ),
        all<Link>((f, t) =>
          db
            .from("business_customers")
            .select("customer_id, source, created_at, profile:profiles!business_customers_customer_id_fkey(full_name, phone)")
            .eq("business_id", business.id)
            .order("created_at", { ascending: false })
            .range(f, t)
            .returns<Link[]>(),
        ),
        all<DeliveredOrder>((f, t) => {
          const q = (cols: string) =>
            db
              .from("orders")
              .select(cols)
              .eq("business_id", business.id)
              .eq("status", "entregado")
              .gte("delivered_at", since)
              .lt("delivered_at", until)
              .order("delivered_at", { ascending: false })
              .range(f, t)
              .returns<DeliveredOrder[]>();
          const base = "code, customer_name, total, created_at, accepted_at, picked_at, eta_minutes, arrived_at, payment_reported_at, payment_validated_at, delivered_at, driver_id, driver:profiles!orders_driver_id_fkey(full_name)";
          // Si las tablas de ganancias aún no existen, se muestran las entregas sin ellas.
          return q(`${base}, ${FINANCE_COLS}`).then((r) => (r.error ? q(base) : r));
        }),
      ]);

      const earns: Earn[] = deliveredOrders.map((o) => {
        const f = orderFinance(o);
        const p = orderPay(o);
        const d = drivers.find((x) => x.user_id === o.driver_id);
        return {
          day: limaDate(o.delivered_at ?? o.created_at),
          total: Number(o.total),
          driverKey: o.driver_id ?? "-",
          driverName: o.driver?.full_name ?? "—",
          scheme: payLabel(d?.pay_type, d?.pay_value),
          gross: f?.gross_profit == null ? null : Number(f.gross_profit),
          net: f?.net_profit == null ? null : Number(f.net_profit),
          pay: p?.amount == null ? null : Number(p.amount),
        };
      });
      const days = buildDays(earns);
      const pays = buildPays(earns);
      const withCost = earns.filter((e) => e.gross !== null);

      const deliveries: DeliveryRow[] = deliveredOrders.map((o, i) => ({
        gross: earns[i].gross,
        net: earns[i].net,
        pay: earns[i].pay,
        km: orderPay(o)?.distance_km == null ? null : Number(orderPay(o)!.distance_km),
        code: o.code,
        customer: o.customer_name || "Cliente",
        driver: o.driver?.full_name ?? "—",
        total: Number(o.total),
        created_at: o.created_at,
        accepted_at: o.accepted_at,
        picked_at: o.picked_at,
        eta_minutes: o.eta_minutes,
        arrived_at: o.arrived_at,
        payment_reported_at: o.payment_reported_at,
        payment_validated_at: o.payment_validated_at,
        delivered_at: o.delivered_at,
      }));
      const totals = deliveries.map((d) => minutesBetween(d.created_at, d.delivered_at)).filter((m): m is number => m !== null);
      const avgDeliveryMin = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null;

      const cancelled: CancelledRow[] = cancelledOrders.map((o) => ({
        code: o.code,
        cancelled_at: o.cancelled_at ?? o.created_at,
        customer: o.customer_name || "Cliente",
        phone: o.customer_phone ?? "—",
        total: Number(o.total),
        reason: o.cancel_reason ?? "",
        by: !o.cancelled_by ? "No registrado" : o.cancelled_by === o.customer_id ? "Cliente" : "Negocio",
        items: (o.order_items ?? []).map((i) => `${i.quantity}× ${i.name}`).join(", ") || "—",
      }));

      const perCustomer = new Map<string, { orders: number; cancelled: number; spent: number }>();
      for (const o of orders) {
        const c = perCustomer.get(o.customer_id) ?? { orders: 0, cancelled: 0, spent: 0 };
        c.orders++;
        if (o.status === "cancelado") c.cancelled++;
        if (o.status === "entregado") c.spent += Number(o.total);
        perCustomer.set(o.customer_id, c);
      }
      const joinedIn = (iso: string) => {
        const t = new Date(iso).getTime();
        return t >= new Date(since).getTime() && t < new Date(until).getTime();
      };
      const customers: CustomerStat[] = links
        .filter((l) => joinedIn(l.created_at) || perCustomer.has(l.customer_id))
        .map((l) => {
          const c = perCustomer.get(l.customer_id);
          return {
            name: l.profile?.full_name || "Cliente",
            phone: l.profile?.phone ?? "—",
            joined: l.created_at,
            source: l.source === "invitacion" ? "Invitado" : "Hizo un pedido",
            orders: c?.orders ?? 0,
            cancelled: c?.cancelled ?? 0,
            spent: c?.spent ?? 0,
          };
        })
        .sort((x, y) => y.spent - x.spent || y.orders - x.orders);

      const summary: Summary = {
        avgDeliveryMin,
        orders: orders.length,
        delivered: orders.filter((o) => o.status === "entregado").length,
        cancelled: cancelled.length,
        cancelledAmount: cancelled.reduce((s, c) => s + c.total, 0),
        validated: orders.filter((o) => o.payment_status === "validado").reduce((s, o) => s + Number(o.total), 0),
        newCustomers: links.filter((l) => joinedIn(l.created_at)).length,
        activeCustomers: perCustomer.size,
        gross: withCost.length ? round2(withCost.reduce((a, e) => a + (e.gross ?? 0), 0)) : null,
        net: withCost.length ? round2(withCost.reduce((a, e) => a + (e.net ?? 0), 0)) : null,
        driverPay: round2(earns.reduce((a, e) => a + (e.pay ?? 0), 0)),
      };
      setReport({ range: r, summary, cancelled, customers, deliveries, days, pays });
    } catch (e) {
      setError((e as Error).message || "No se pudieron cargar las estadísticas");
    }
    setLoading(false);
  }

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pdf() {
    if (!report) return;
    setPdfBusy(true);
    try {
      await downloadStatsPdf({ business: business.name, rangeLabel: report.range.label, summary: report.summary, cancelled: report.cancelled, customers: report.customers, deliveries: report.deliveries, payRows: report.pays, dayRows: report.days });
    } catch {
      setError("No se pudo generar el PDF");
    }
    setPdfBusy(false);
  }

  const two = mode === "rango_dias" || mode === "rango_meses" || mode === "rango_anios";
  const inputType = mode === "dia" || mode === "rango_dias" ? "date" : mode === "mes" || mode === "rango_meses" ? "month" : "year";
  const field = (value: string, set: (v: string) => void, label: string) =>
    inputType === "year" ? (
      <div className="min-w-0 flex-1">
        <label className="label">{label}</label>
        <select className="input" value={value} onChange={(e) => set(e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    ) : (
      <div className="min-w-0 flex-1">
        <label className="label">{label}</label>
        <input className="input" type={inputType} value={value} max={inputType === "date" ? today : today.slice(0, 7)} onChange={(e) => set(e.target.value)} />
      </div>
    );

  return (
    <main className="mx-auto flex h-full max-w-6xl flex-col gap-3 p-3 md:p-5 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
      <div className="shrink-0 lg:col-span-2">
        <h1 className="text-xl font-extrabold md:text-2xl">Mis Estadísticas</h1>
      </div>

      <section className="card shrink-0 space-y-3 p-3 md:p-4 lg:self-start">
        <select className="input !py-2.5 lg:hidden" value={mode} onChange={(e) => pick(e.target.value as RangeMode)} aria-label="Tipo de período">
          {RANGE_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <div className="hidden flex-wrap gap-1.5 lg:flex">
          {RANGE_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => pick(m.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${mode === m.id ? "bg-agua-600 text-white shadow" : "bg-slate-100 text-slate-600"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          {field(a, setA, two ? "Desde" : mode === "dia" ? "Fecha" : mode === "mes" ? "Mes" : "Año")}
          {two && field(b, setB, "Hasta")}
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          <button onClick={load} disabled={loading} className="btn-primary !py-2.5 text-sm">
            {loading && <Spinner className="h-4 w-4" />} Ver estadísticas
          </button>
          <button onClick={pdf} disabled={!report || pdfBusy} className="btn-outline !py-2.5 text-sm">
            {pdfBusy ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />} Descargar PDF
          </button>
        </div>
        <p className="hidden text-xs text-slate-500 lg:block">
          Aquí quedan guardados todos tus pedidos cancelados y los datos de tus clientes. Elige un período para verlos y descargarlos en PDF.
        </p>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-3">
        {!report && <Empty icon={<FileText className="h-10 w-10 text-slate-300" />} title="Elige un período" text="Y pulsa «Ver estadísticas»." />}
        {report && (
          <>
            <p className="shrink-0 text-sm font-semibold text-slate-700">Período: {report.range.label}</p>
            <div className="flex shrink-0 gap-2 overflow-x-auto pb-1">
              {[
                ["Pedidos", String(report.summary.orders), "text-ink"],
                ["Entregados", String(report.summary.delivered), "text-emerald-600"],
                ["Tiempo medio", fmtMin(report.summary.avgDeliveryMin), "text-indigo-600"],
                ["Cancelados", String(report.summary.cancelled), "text-rose-600"],
                ["Ventas validadas", money(report.summary.validated), "text-agua-700"],
                ["Ganancia bruta", report.summary.gross == null ? "—" : money(report.summary.gross), "text-emerald-700"],
                ["Ganancia neta", report.summary.net == null ? "—" : money(report.summary.net), "text-emerald-700"],
                ["A pagar a repartidores", money(report.summary.driverPay ?? 0), "text-agua-700"],
                ["No concretado", money(report.summary.cancelledAmount), "text-rose-600"],
                ["Clientes nuevos", String(report.summary.newCustomers), "text-ink"],
                ["Con pedidos", String(report.summary.activeCustomers), "text-ink"],
              ].map(([label, value, tone]) => (
                <div key={label} className="card min-w-[7.5rem] shrink-0 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-500">{label}</p>
                  <p className={`text-lg font-extrabold leading-tight ${tone}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="flex shrink-0 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
              {[
                { id: "entregas" as const, label: `Entregas (${report.deliveries.length})` },
                { id: "ganancias" as const, label: "Ganancias" },
                { id: "pagos" as const, label: "Pagos" },
                { id: "cancelados" as const, label: `Cancelados (${report.cancelled.length})` },
                { id: "clientes" as const, label: `Clientes (${report.customers.length})` },
              ].map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={rtab === t.id}
                  onClick={() => setRtab(t.id)}
                  className={`flex-1 rounded-xl px-2 py-2 text-sm font-bold transition ${rtab === t.id ? "bg-white text-agua-700 shadow-sm" : "text-slate-500"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {rtab === "entregas" && report.deliveries.length === 0 && <Empty icon={<FileText className="h-10 w-10 text-slate-300" />} title="Sin entregas en este período" />}
              {rtab === "entregas" &&
                report.deliveries.map((d) => {
                  const t = traceTimes(d);
                  return (
                    <article key={d.code + d.delivered_at} className="card space-y-2 p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate font-bold">
                          #{d.code} · {d.customer}
                        </p>
                        <p className="shrink-0 font-extrabold text-emerald-700">{fmtMin(t.total)}</p>
                      </div>
                      <p className="truncate text-sm text-slate-500">Repartidor: {d.driver} · {money(d.total)}</p>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl bg-emerald-50 p-1.5"><p className="text-slate-500">Ganancia bruta</p><p className="font-extrabold text-emerald-700">{d.gross == null ? "—" : money(d.gross)}</p></div>
                        <div className="rounded-xl bg-emerald-50 p-1.5"><p className="text-slate-500">Ganancia neta</p><p className="font-extrabold text-emerald-700">{d.net == null ? "—" : money(d.net)}</p></div>
                        <div className="rounded-xl bg-agua-50 p-1.5"><p className="text-slate-500">Pago repartidor{d.km ? ` · ${d.km} km` : ""}</p><p className="font-extrabold text-agua-700">{d.pay == null ? "—" : money(d.pay)}</p></div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-slate-50 p-2.5 text-xs sm:grid-cols-3">
                        {[
                          ["Recibido", clock(d.created_at)],
                          ["Aceptado", clock(d.accepted_at)],
                          ["Salió", clock(d.picked_at)],
                          ["Llegó", clock(d.arrived_at)],
                          ["Pago validado", clock(d.payment_validated_at)],
                          ["Entregado", clock(d.delivered_at)],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-slate-500">{k}</dt>
                            <dd className="font-semibold">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="text-xs font-semibold text-agua-700">
                        Camino: {fmtMin(t.ruta)}
                        {d.eta_minutes ? ` (estimado ${fmtMin(d.eta_minutes)} · ${etaVerdict(t.vsEstimado)})` : ""}
                      </p>
                    </article>
                  );
                })}
              {rtab === "ganancias" && report.days.length === 0 && <Empty icon={<FileText className="h-10 w-10 text-slate-300" />} title="Sin entregas en este período" />}
              {rtab === "ganancias" && report.days.length > 0 && report.summary.gross === null && (
                <p className="rounded-2xl bg-amber-50 p-3 text-sm font-medium text-amber-800">Registra el costo de tus productos en «Mis productos» para ver tu ganancia bruta y neta.</p>
              )}
              {rtab === "ganancias" &&
                report.days.map((r) => (
                  <article key={r.day} className="card space-y-2 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-bold">{fmtDay(r.day)}</p>
                      <p className="text-sm text-slate-500">{r.deliveries} {r.deliveries === 1 ? "entrega" : "entregas"} · {money(r.sales)}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-emerald-50 p-1.5"><p className="text-slate-500">Ganancia bruta</p><p className="font-extrabold text-emerald-700">{r.gross === null ? "—" : money(r.gross)}</p></div>
                      <div className="rounded-xl bg-agua-50 p-1.5"><p className="text-slate-500"><span className="sm:hidden">Pago rep.</span><span className="hidden sm:inline">Pago a repartidores</span></p><p className="font-extrabold text-agua-700">{money(r.pay)}</p></div>
                      <div className="rounded-xl bg-emerald-50 p-1.5"><p className="text-slate-500">Ganancia neta</p><p className="font-extrabold text-emerald-700">{r.net === null ? "—" : money(r.net)}</p></div>
                    </div>
                  </article>
                ))}
              {rtab === "pagos" && report.pays.length === 0 && <Empty icon={<FileText className="h-10 w-10 text-slate-300" />} title="Sin entregas en este período" />}
              {rtab === "pagos" &&
                report.pays.map((r) => (
                  <article key={r.driver + r.scheme} className="card flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{r.driver}</p>
                      <p className="text-sm text-slate-500">{r.deliveries} {r.deliveries === 1 ? "entrega" : "entregas"} · {money(r.total)} · {r.scheme}</p>
                      {r.pending > 0 && <p className="text-xs font-semibold text-amber-700">{r.pending} pedido(s) sin pago definido: define su pago en «Mi equipo»</p>}
                    </div>
                    <p className="shrink-0 text-right text-xl font-extrabold text-agua-700">{money(r.amount)}<span className="block text-[11px] font-semibold text-slate-500">a pagar</span></p>
                  </article>
                ))}
              {rtab === "cancelados" && report.cancelled.length === 0 && <Empty icon={<FileText className="h-10 w-10 text-slate-300" />} title="Sin pedidos cancelados en este período" />}
              {rtab === "cancelados" &&
                report.cancelled.map((c) => (
                  <article key={c.code + c.cancelled_at} className="card space-y-0.5 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate font-bold">
                        #{c.code} · {c.customer}
                      </p>
                      <p className="font-extrabold text-rose-600">{money(c.total)}</p>
                    </div>
                    <p className="truncate text-sm text-slate-600">
                      {c.phone} · {c.items}
                    </p>
                    <p className="text-sm text-slate-500">
                      Cancelado el {dateTime(c.cancelled_at)} por <b>{c.by}</b>
                      {c.reason ? ` · “${c.reason}”` : ""}
                    </p>
                  </article>
                ))}
              {rtab === "clientes" && report.customers.length === 0 && <Empty icon={<FileText className="h-10 w-10 text-slate-300" />} title="Sin clientes en este período" />}
              {rtab === "clientes" &&
                report.customers.map((c) => (
                  <article key={c.phone + c.joined} className="card flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{c.name}</p>
                      <p className="truncate text-sm text-slate-500">
                        {c.phone} · {c.source} · desde {dateTime(c.joined)}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm">
                      <b>{c.orders}</b> {c.orders === 1 ? "pedido" : "pedidos"}
                      {c.cancelled > 0 && <span className="text-rose-600"> · {c.cancelled} cancel.</span>}
                      <span className="block font-extrabold text-agua-700">{money(c.spent)}</span>
                    </p>
                  </article>
                ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
