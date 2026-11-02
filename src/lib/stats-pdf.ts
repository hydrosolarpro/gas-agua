import { fmtDateTime, fmtDay } from "@/lib/plan";

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
export type Summary = { orders: number; delivered: number; cancelled: number; cancelledAmount: number; validated: number; newCustomers: number; activeCustomers: number };

const sol = (n: number) => `S/ ${n.toFixed(2)}`;

/** Genera y descarga el PDF con el período elegido, los pedidos cancelados y los clientes. */
export async function downloadStatsPdf(opts: {
  business: string;
  rangeLabel: string;
  summary: Summary;
  cancelled: CancelledRow[];
  customers: CustomerStat[];
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
      ["Pedidos cancelados", `${s.cancelled} (${sol(s.cancelledAmount)} en pedidos no concretados)`],
      ["Ventas con pago validado", sol(s.validated)],
      ["Clientes nuevos", String(s.newCustomers)],
      ["Clientes con pedidos", String(s.activeCustomers)],
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
