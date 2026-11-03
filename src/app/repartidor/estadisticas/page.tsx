"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Download, FileText, Wallet } from "lucide-react";
import { BusinessHeader } from "@/components/BusinessBadge";
import { PeriodFilter } from "@/components/PeriodFilter";
import { Empty, ErrorText, FullLoader, Spinner } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { orderPay } from "@/lib/finance";
import { payLabel } from "@/lib/pay";
import { fmtDateTime, fmtDay, limaDate } from "@/lib/plan";
import { useSession } from "@/lib/hooks";
import { rangeBounds, type Range } from "@/lib/stats";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";

type Row = { code: string; customer: string; address: string; total: number; delivered_at: string; pay: number | null; km: number | null };
type Day = { day: string; deliveries: number; total: number; pay: number };
type Report = { range: Range; rows: Row[]; days: Day[]; total: number; pay: number; pending: number };

const COLS = "code, customer_name, address_text, total, delivered_at, created_at, order_driver_pay(driver_id, pay_type, pay_value, distance_km, amount)";

export default function EstadisticasRepartidor() {
  const { loading, profile, business } = useSession(["repartidor"]);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"entregas" | "dias">("entregas");
  const [scheme, setScheme] = useState("");

  async function load(r: Range) {
    if (!profile || !business) return;
    setBusy(true);
    setError("");
    try {
      const db = supabaseBrowser();
      const { since, until } = rangeBounds(r);
      const rows: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db
          .from("orders")
          .select(COLS)
          .eq("business_id", business.id)
          .eq("driver_id", profile.id)
          .eq("status", "entregado")
          .gte("delivered_at", since)
          .lt("delivered_at", until)
          .order("delivered_at", { ascending: false })
          .range(from, from + 999)
          .returns<(Pick<Order, "code" | "customer_name" | "address_text" | "total" | "created_at" | "order_driver_pay"> & { delivered_at: string | null })[]>();
        if (error) throw new Error(error.message);
        for (const o of data ?? []) {
          const p = orderPay(o);
          rows.push({
            code: o.code,
            customer: o.customer_name || "Cliente",
            address: o.address_text,
            total: Number(o.total),
            delivered_at: o.delivered_at ?? o.created_at,
            pay: p?.amount == null ? null : Number(p.amount),
            km: p?.distance_km == null ? null : Number(p.distance_km),
          });
        }
        if (!data || data.length < 1000) break;
      }
      const map = new Map<string, Day>();
      for (const x of rows) {
        const day = limaDate(x.delivered_at);
        const d = map.get(day) ?? { day, deliveries: 0, total: 0, pay: 0 };
        d.deliveries += 1;
        d.total += x.total;
        d.pay += x.pay ?? 0;
        map.set(day, d);
      }
      setReport({
        range: r,
        rows,
        days: [...map.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
        total: rows.reduce((s, x) => s + x.total, 0),
        pay: rows.reduce((s, x) => s + (x.pay ?? 0), 0),
        pending: rows.filter((x) => x.pay === null).length,
      });
    } catch (e) {
      setError((e as Error).message || "No se pudieron cargar tus estadísticas");
    }
    setBusy(false);
  }

  useEffect(() => {
    if (!profile || !business) return;
    supabaseBrowser()
      .from("business_members")
      .select("pay_type, pay_value")
      .eq("business_id", business.id)
      .eq("user_id", profile.id)
      .maybeSingle<{ pay_type: string | null; pay_value: number | null }>()
      .then(({ data }) => setScheme(payLabel(data?.pay_type, data?.pay_value)));
  }, [profile, business]);

  async function pdf() {
    if (!report || !profile || !business) return;
    setPdfBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      doc.setFont("helvetica", "bold").setFontSize(18).text("Mis estadísticas y pagos", 40, 46);
      doc.setFont("helvetica", "normal").setFontSize(11);
      doc.text(`${profile.full_name} · ${business.name}`, 40, 66);
      doc.text(`Período: ${report.range.label}`, 40, 82);
      doc.text(`Forma de pago: ${scheme}`, 40, 98);
      doc.setTextColor(120).text(`Generado el ${fmtDateTime(new Date().toISOString())}`, 40, 114);
      doc.setTextColor(0);
      const sol = (n: number) => `S/ ${n.toFixed(2)}`;
      autoTable(doc, {
        startY: 128,
        head: [["Resumen", ""]],
        body: [
          ["Pedidos entregados", String(report.rows.length)],
          ["Total de los pedidos", sol(report.total)],
          ["Mi pago total", sol(report.pay)],
        ],
        theme: "grid",
        headStyles: { fillColor: [8, 145, 178] },
        styles: { fontSize: 10 },
        tableWidth: 320,
        margin: { left: 40 },
      });
      const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
      autoTable(doc, {
        startY: y + 20,
        head: [["Pedido", "Entregado", "Cliente", "Distancia", "Total", "Mi pago"]],
        body: report.rows.length ? report.rows.map((r) => [`#${r.code}`, fmtDateTime(r.delivered_at), r.customer, r.km ? `${r.km} km` : "—", sol(r.total), r.pay === null ? "—" : sol(r.pay)]) : [["Sin entregas en este período", "", "", "", "", ""]],
        theme: "striped",
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 8.5, cellPadding: 4 },
        margin: { left: 40, right: 40 },
      });
      doc.save(`mis-pagos-${report.range.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "periodo"}.pdf`);
    } catch {
      setError("No se pudo generar el PDF");
    }
    setPdfBusy(false);
  }

  if (loading || !profile) return <FullLoader />;
  if (!business) return <FullLoader text="Buscando tu negocio…" />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-3 bg-white px-3 py-2 shadow-sm">
        <Link href="/repartidor" className="rounded-full bg-slate-100 p-2.5" aria-label="Volver a mis entregas">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-extrabold">Mis estadísticas y pagos</h1>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-3 md:p-5">
        <BusinessHeader business={business} />
        <p className="flex items-center gap-2 rounded-2xl bg-agua-50 px-3 py-2.5 text-sm font-semibold text-agua-800">
          <Wallet className="h-5 w-5 shrink-0" /> Tu forma de pago: {scheme || "…"}
        </p>
        <PeriodFilter firstDate={business.created_at} loading={busy} onApply={load} actionLabel="Ver mis estadísticas" />
        <ErrorText>{error}</ErrorText>
        {!report && !busy && <Empty icon={<FileText className="h-10 w-10 text-slate-300" />} title="Elige un período" text="Y pulsa «Ver mis estadísticas»." />}
        {report && (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700">Período: {report.range.label}</p>
              <button onClick={pdf} disabled={pdfBusy} className="btn-outline !px-3 !py-2 text-sm">
                {pdfBusy ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />} PDF
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center sm:gap-2">
              <div className="card min-w-0 p-2 sm:p-3"><p className="text-[11px] font-semibold text-slate-500 sm:text-xs">Entregados</p><p className="text-lg font-extrabold text-emerald-600 sm:text-2xl">{report.rows.length}</p></div>
              <div className="card min-w-0 p-2 sm:p-3"><p className="text-[11px] font-semibold text-slate-500 sm:text-xs">Total pedidos</p><p className="text-sm font-extrabold text-ink min-[360px]:text-base sm:text-xl">{money(report.total)}</p></div>
              <div className="card min-w-0 border-2 !border-agua-300 bg-agua-50 p-2 sm:p-3"><p className="text-[11px] font-semibold text-agua-800 sm:text-xs">Mi pago</p><p className="text-sm font-extrabold text-agua-700 min-[360px]:text-base sm:text-xl">{money(report.pay)}</p></div>
            </div>
            {report.pending > 0 && <p className="rounded-2xl bg-amber-50 p-3 text-sm font-medium text-amber-800">{report.pending} pedido(s) aún sin pago definido: el dueño debe definir tu forma de pago.</p>}
            <div className="flex gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
              {([["entregas", `Entregas (${report.rows.length})`], ["dias", "Por día"]] as const).map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex-1 rounded-xl px-2 py-2 text-sm font-bold transition ${tab === id ? "bg-white text-agua-700 shadow-sm" : "text-slate-500"}`}>
                  {label}
                </button>
              ))}
            </div>
            {tab === "entregas" && report.rows.length === 0 && <Empty icon={<FileText className="h-10 w-10 text-slate-300" />} title="Sin entregas en este período" />}
            {tab === "entregas" &&
              report.rows.map((r) => (
                <article key={r.code + r.delivered_at} className="card flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">#{r.code} · {r.customer}</p>
                    <p className="truncate text-sm text-slate-500">{r.address}</p>
                    <p className="text-xs text-slate-500">{dateTime(r.delivered_at)}{r.km ? ` · ${r.km} km` : ""} · pedido {money(r.total)}</p>
                  </div>
                  <p className="shrink-0 text-right text-lg font-extrabold text-agua-700">{r.pay === null ? "—" : money(r.pay)}<span className="block text-[11px] font-semibold text-slate-500">mi pago</span></p>
                </article>
              ))}
            {tab === "dias" &&
              report.days.map((d) => (
                <article key={d.day} className="card flex items-center justify-between gap-3 p-3">
                  <div>
                    <p className="font-bold">{fmtDay(d.day)}</p>
                    <p className="text-sm text-slate-500">{d.deliveries} {d.deliveries === 1 ? "entrega" : "entregas"} · {money(d.total)}</p>
                  </div>
                  <p className="text-lg font-extrabold text-agua-700">{money(d.pay)}</p>
                </article>
              ))}
          </>
        )}
      </main>
    </div>
  );
}
