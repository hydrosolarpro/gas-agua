import { fmtDateTime, fmtDay } from "@/lib/plan";
import { clock, etaVerdict, fmtMin, traceTimes, type TraceInput } from "@/lib/trace";

export type CancelledRow = {
  code: string;
  cancelled_at: string;
  customer: string;
  phone: string;
  total: number;
  reason: string;
  by: string;
  items: string;
};
export type CustomerStat = {
  name: string;
  phone: string;
  joined: string;
  source: string;
  orders: number;
  cancelled: number;
  spent: number;
};
export type DeliveryRow = TraceInput & { code: string; customer: string; driver: string; total: number; gross?: number | null; net?: number | null; pay?: number | null; km?: number | null };
/** Pago acumulado de un repartidor en el período. */
export type PayRow = { driver: string; scheme: string; deliveries: number; total: number; amount: number; pending: number };
/** Ganancias de un día (suma de los pedidos entregados ese día). */
export type DayRow = { day: string; deliveries: number; sales: number; gross: number | null; net: number | null; pay: number };
export type Summary = { avgDeliveryMin: number | null; orders: number; delivered: number; cancelled: number; cancelledAmount: number; validated: number; newCustomers: number; activeCustomers: number; gross?: number | null; net?: number | null; driverPay?: number };

const sol = (n: number) => `S/ ${n.toFixed(2)}`;

/** Genera y descarga el PDF con el período elegido, los pedidos cancelados y los clientes. */
export async function downloadStatsPdf(opts: {
  business: string;
  rangeLabel: string;
  summary: Summary;
  cancelled: CancelledRow[];
  customers: CustomerStat[];
  deliveries: DeliveryRow[];
  payRows?: PayRow[];
  dayRows?: DayRow[];
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold").setFontSize(18).text("Estadísticas del negocio", 40, 46);
  doc.setFont("helvetica", "normal").setFontSize(11);
  doc.text(opts.business, 40, 66);
  doc.text(`Período: ${opts.rangeLabel}`, 40, 82);
  doc.setTextColor(120).text(`Generado el ${fmtDateTime(new Date().toISOString())} · AguaGasExpress`, w - 40, 66, { align: "right" });
  doc.setTextColor(0);

  const s = opts.summary;
  autoTable(doc, {
    startY: 98,
    head: [["Resumen del período", "Cantidad"]],
    body: [
      ["Pedidos recibidos", String(s.orders)],
      ["Pedidos entregados", String(s.delivered)],
      ["Tiempo medio de entrega (recibido a entregado)", s.avgDeliveryMin === null ? "—" : fmtMin(s.avgDeliveryMin)],
      ["Pedidos cancelados", `${s.cancelled} (${sol(s.cancelledAmount)} en pedidos no concretados)`],
      ["Ventas con pago validado", sol(s.validated)],
      ["Clientes nuevos", String(s.newCustomers)],
      ["Clientes con pedidos", String(s.activeCustomers)],
      ...(s.gross !== undefined ? [["Ganancia bruta (ventas − costo)", s.gross === null ? "— (registra tus costos)" : sol(s.gross)], ["Ganancia neta (− pago a repartidores)", s.net === null || s.net === undefined ? "—" : sol(s.net)], ["Total a pagar a repartidores", sol(s.driverPay ?? 0)]] : []),
    ],
    theme: "grid",
    headStyles: { fillColor: [8, 145, 178] },
    styles: { fontSize: 10 },
    tableWidth: 420,
    margin: { left: 40 },
  });

  const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont("helvetica", "bold").setFontSize(13).text(`Pedidos cancelados (${opts.cancelled.length})`, 40, afterSummary + 28);
  autoTable(doc, {
    startY: afterSummary + 36,
    head: [["Pedido", "Cancelado el", "Cliente", "Celular", "Productos", "Total", "Cancelado por", "Motivo"]],
    body: opts.cancelled.length
      ? opts.cancelled.map((c) => [`#${c.code}`, fmtDateTime(c.cancelled_at), c.customer, c.phone, c.items, sol(c.total), c.by, c.reason || "—"])
      : [["Sin pedidos cancelados en este período", "", "", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: [225, 29, 72] },
    styles: { fontSize: 8.5, cellPadding: 4 },
    margin: { left: 40, right: 40 },
  });

  const afterCancelled0 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont("helvetica", "bold").setFontSize(13).text(`Entregas realizadas y sus tiempos (${opts.deliveries.length})`, 40, afterCancelled0 + 28);
  autoTable(doc, {
    startY: afterCancelled0 + 36,
    head: [["Pedido", "Cliente", "Repartidor", "Recibido", "Aceptado", "Salió", "Llegó", "Entregado", "Camino", "Vs. estimado", "Total", ...(opts.dayRows ? ["Gan. bruta", "Gan. neta", "Pago rep."] : [])]],
    body: opts.deliveries.length
      ? opts.deliveries.map((d) => {
          const t = traceTimes(d);
          return [`#${d.code}`, d.customer, d.driver, clock(d.created_at), clock(d.accepted_at), clock(d.picked_at), clock(d.arrived_at), clock(d.delivered_at), fmtMin(t.ruta), etaVerdict(t.vsEstimado), fmtMin(t.total), ...(opts.dayRows ? [d.gross == null ? "—" : sol(d.gross), d.net == null ? "—" : sol(d.net), d.pay == null ? "—" : sol(d.pay)] : [])];
        })
      : [["Sin entregas en este período", ...Array(opts.dayRows ? 13 : 10).fill("")]],
    theme: "striped",
    headStyles: { fillColor: [16, 185, 129] },
    styles: { fontSize: 7.5, cellPadding: 3 },
    margin: { left: 40, right: 40 },
  });

  if (opts.payRows) {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    doc.setFont("helvetica", "bold").setFontSize(13).text(`Pago a repartidores (${opts.payRows.length})`, 40, y + 28);
    autoTable(doc, {
      startY: y + 36,
      head: [["Repartidor", "Forma de pago", "Entregas", "Total de pedidos", "A pagar", "Sin pago definido"]],
      body: opts.payRows.length ? opts.payRows.map((r) => [r.driver, r.scheme, String(r.deliveries), sol(r.total), sol(r.amount), r.pending ? String(r.pending) : "—"]) : [["Sin entregas en este período", "", "", "", "", ""]],
      theme: "striped",
      headStyles: { fillColor: [8, 145, 178] },
      styles: { fontSize: 8.5, cellPadding: 4 },
      margin: { left: 40, right: 40 },
    });
  }
  if (opts.dayRows) {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    doc.setFont("helvetica", "bold").setFontSize(13).text("Ganancias por día", 40, y + 28);
    autoTable(doc, {
      startY: y + 36,
      head: [["Día", "Entregas", "Ventas", "Ganancia bruta", "Pago a repartidores", "Ganancia neta"]],
      body: opts.dayRows.length ? opts.dayRows.map((r) => [fmtDay(r.day), String(r.deliveries), sol(r.sales), r.gross === null ? "—" : sol(r.gross), sol(r.pay), r.net === null ? "—" : sol(r.net)]) : [["Sin entregas en este período", "", "", "", "", ""]],
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 8.5, cellPadding: 4 },
      margin: { left: 40, right: 40 },
    });
  }

  const afterCancelled = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFont("helvetica", "bold").setFontSize(13).text(`Clientes (${opts.customers.length})`, 40, afterCancelled + 28);
  autoTable(doc, {
    startY: afterCancelled + 36,
    head: [["Cliente", "Celular", "Se registró", "Origen", "Pedidos", "Cancelados", "Comprado (entregado)"]],
    body: opts.customers.length
      ? opts.customers.map((c) => [c.name, c.phone, fmtDay(c.joined.slice(0, 10)), c.source, String(c.orders), String(c.cancelled), sol(c.spent)])
      : [["Sin clientes en este período", "", "", "", "", "", ""]],
    theme: "striped",
    headStyles: { fillColor: [8, 145, 178] },
    styles: { fontSize: 8.5, cellPadding: 4 },
    margin: { left: 40, right: 40 },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(130).text(`Página ${i} de ${pages}`, w - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }
  const safe = opts.rangeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  doc.save(`estadisticas-${safe || "periodo"}.pdf`);
}
