"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { usePanel } from "@/components/panel-context";
import { Empty, ErrorText, Spinner } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { limaDate } from "@/lib/plan";
import { RANGE_MODES, rangeBounds, resolveRange, type Range, type RangeMode } from "@/lib/stats";
import { downloadStatsPdf, type CancelledRow, type CustomerStat, type Summary } from "@/lib/stats-pdf";
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

type Report = { range: Range; summary: Summary; cancelled: CancelledRow[]; customers: CustomerStat[] };

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
  const today = limaDate();
  const [mode, setMode] = useState<RangeMode>("mes");
  const [a, setA] = useState(today.slice(0, 7));
  const [b, setB] = useState(today.slice(0, 7));
  const [report, setReport] = useState<Report | null>(null);
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
      const [orders, cancelledOrders, links] = await Promise.all([
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
      ]);

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
        orders: orders.length,
        delivered: orders.filter((o) => o.status === "entregado").length,
        cancelled: cancelled.length,
        cancelledAmount: cancelled.reduce((s, c) => s + c.total, 0),
        validated: orders.filter((o) => o.payment_status === "validado").reduce((s, o) => s + Number(o.total), 0),
        newCustomers: links.filter((l) => joinedIn(l.created_at)).length,
        activeCustomers: perCustomer.size,
      };
      setReport({ range: r, summary, cancelled, customers });
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
      await downloadStatsPdf({ business: business.name, rangeLabel: report.range.label, summary: report.summary, cancelled: report.cancelled, customers: report.customers });
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
    <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <h1 className="text-2xl font-extrabold">Estadísticas del negocio</h1>
      <p className="text-sm text-slate-600">
        Aquí quedan guardados todos tus pedidos cancelados y los datos de tus clientes. Elige un período para verlos y descargarlos en PDF.
      </p>

      <section className="card space-y-4 p-5">
        <div className="-mx-1 flex flex-wrap gap-2">
          {RANGE_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => pick(m.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === m.id ? "bg-agua-600 text-white shadow" : "bg-slate-100 text-slate-600"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {field(a, setA, two ? "Desde" : mode === "dia" ? "Fecha" : mode === "mes" ? "Mes" : "Año")}
          {two && field(b, setB, "Hasta")}
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap gap-3">
          <button onClick={load} disabled={loading} className="btn-primary flex-1">
            {loading && <Spinner className="h-5 w-5" />} Ver estadísticas
          </button>
          <button onClick={pdf} disabled={!report || pdfBusy} className="btn-outline flex-1">
            {pdfBusy ? <Spinner className="h-5 w-5" /> : <Download className="h-5 w-5" />} Descargar PDF
          </button>
        </div>
      </section>

      {report && (
        <>
          <p className="font-semibold text-slate-700">Período: {report.range.label}</p>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Pedidos recibidos", String(report.summary.orders), "text-ink"],
              ["Entregados", String(report.summary.delivered), "text-emerald-600"],
              ["Cancelados", String(report.summary.cancelled), "text-rose-600"],
              ["Ventas validadas", money(report.summary.validated), "text-agua-700"],
              ["Dinero no concretado", money(report.summary.cancelledAmount), "text-rose-600"],
              ["Clientes nuevos", String(report.summary.newCustomers), "text-ink"],
              ["Clientes con pedidos", String(report.summary.activeCustomers), "text-ink"],
            ].map(([label, value, tone]) => (
              <div key={label} className="card p-4">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className={`mt-1 text-xl font-extrabold ${tone}`}>{value}</p>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-bold">Pedidos cancelados ({report.cancelled.length})</h2>
            {report.cancelled.length === 0 && <Empty icon={<FileText className="h-12 w-12 text-slate-300" />} title="Sin pedidos cancelados en este período" />}
            {report.cancelled.map((c) => (
              <article key={c.code + c.cancelled_at} className="card space-y-1 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-bold">
                    #{c.code} · {c.customer}
                  </p>
                  <p className="font-extrabold text-rose-600">{money(c.total)}</p>
                </div>
                <p className="text-sm text-slate-600">
                  {c.phone} · {c.items}
                </p>
                <p className="text-sm text-slate-500">
                  Cancelado el {dateTime(c.cancelled_at)} por <b>{c.by}</b>
                  {c.reason ? ` · “${c.reason}”` : ""}
                </p>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="font-bold">Clientes ({report.customers.length})</h2>
            {report.customers.length === 0 && <Empty icon={<FileText className="h-12 w-12 text-slate-300" />} title="Sin clientes en este período" />}
            {report.customers.map((c) => (
              <article key={c.phone + c.joined} className="card flex flex-wrap items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate font-bold">{c.name}</p>
                  <p className="text-sm text-slate-500">
                    {c.phone} · {c.source} · desde {dateTime(c.joined)}
                  </p>
                </div>
                <p className="text-right text-sm">
                  <b>{c.orders}</b> {c.orders === 1 ? "pedido" : "pedidos"}
                  {c.cancelled > 0 && <span className="text-rose-600"> · {c.cancelled} cancel.</span>}
                  <span className="block font-extrabold text-agua-700">{money(c.spent)}</span>
                </p>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
