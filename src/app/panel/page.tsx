"use client";

import { Coffee, MethodMark } from "@/components/icons";

import Link from "next/link";
import { SupportCard } from "@/components/SupportCard";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Copy, Wallet } from "lucide-react";
import Map, { LIMA, type MapMarker } from "@/components/map/Map";
import { OrderRow } from "@/components/orders";
import { Empty, FullLoader } from "@/components/ui";
import { useBusinessOrders, useDrivers } from "@/components/useBusinessOrders";
import { ACTIVE_STATUSES, METHOD, money } from "@/lib/format";
import { orderFinance, orderPay, sumBy } from "@/lib/finance";
import { payLabel } from "@/lib/pay";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { DriverLocation, PaymentMethod } from "@/lib/types";
import { usePanel } from "@/components/panel-context";
import { WelcomeClock } from "@/components/ClientWelcome";

type Tab = "pedidos" | "mapa" | "ingresos" | "soporte";

function Kpi({ label, value, tone, sub, className = "" }: { label: string; value: string; tone: string; sub?: string; className?: string }) {
  return (
    <div className={`card min-w-[7rem] shrink-0 px-3 py-2.5 sm:min-w-0 md:p-4 ${className}`}>
      <p className="truncate text-[11px] font-semibold text-slate-500 md:text-xs">{label}</p>
      <p className={`mt-0.5 truncate text-lg font-extrabold md:text-2xl ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Resumen() {
  const { business, profile } = usePanel();
  const params = useSearchParams();
  const { orders } = useBusinessOrders(business.id, 7);
  const { drivers } = useDrivers(business.id);
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("pedidos");

  const link = `${typeof window === "undefined" ? "" : location.origin}/n/${business.slug}`;

  // Ubicación en vivo de todo el equipo
  useEffect(() => {
    const ids = [...drivers.map((d) => d.user_id), business.owner_id];
    const supabase = supabaseBrowser();
    supabase.from("driver_locations").select("*").in("driver_id", ids).returns<DriverLocation[]>().then(({ data }) => setLocations(data ?? []));
    const channel = supabase
      .channel(`flota-${business.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" }, (p) => {
        const row = p.new as DriverLocation;
        if (!ids.includes(row.driver_id)) return;
        setLocations((prev) => [...prev.filter((l) => l.driver_id !== row.driver_id), row]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [drivers, business.id, business.owner_id]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const list = (orders ?? []).filter((o) => new Date(o.created_at).toDateString() === today);
    const delivered = list.filter((o) => o.status === "entregado");
    const sum = (arr: typeof list) => arr.reduce((s, o) => s + Number(o.total), 0);
    const validated = delivered.filter((o) => o.payment_status === "validado");
    const pending = list.filter((o) => o.payment_status === "reportado" && (o.status === "en_camino" || o.status === "entregado"));
    const byMethod = (["yape", "plin", "efectivo"] as PaymentMethod[]).map((m) => ({
      m,
      amount: sum(validated.filter((o) => o.payment_method === m)),
    }));
    const fin = delivered.map((o) => orderFinance(o));
    const withCost = fin.filter((f) => f && f.gross_profit !== null);
    const payByDriver = new globalThis.Map<string, { orders: number; total: number; amount: number; pending: number }>();
    for (const o of delivered) {
      if (!o.driver_id) continue;
      const row = payByDriver.get(o.driver_id) ?? { orders: 0, total: 0, amount: 0, pending: 0 };
      const amount = orderPay(o)?.amount;
      row.orders += 1;
      row.total += Number(o.total);
      if (amount === null || amount === undefined) row.pending += 1;
      else row.amount += Number(amount);
      payByDriver.set(o.driver_id, row);
    }
    return {
      gross: sumBy(withCost, (f) => f?.gross_profit),
      net: sumBy(withCost, (f) => f?.net_profit),
      hasProfit: withCost.length > 0,
      payByDriver,
      total: list.length,
      active: list.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
      delivered: delivered.length,
      validated: sum(validated),
      toValidate: sum(pending),
      toValidateCount: pending.length,
      byMethod,
    };
  }, [orders]);

  if (!orders) return <FullLoader />;

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const needsValidation = orders.filter((o) => o.payment_status === "reportado" && (o.status === "en_camino" || o.status === "entregado"));
  const markers: MapMarker[] = [
    ...activeOrders.map((o, i) => ({ id: o.id, kind: "pedido" as const, position: { lat: o.lat, lng: o.lng }, label: String(i + 1) })),
    ...locations.map((l) => ({
      id: l.driver_id,
      kind: "repartidor" as const,
      position: { lat: l.lat, lng: l.lng },
      label: drivers.find((d) => d.user_id === l.driver_id)?.profiles.full_name ?? "Tú",
    })),
  ];
  if (business.lat && business.lng) markers.push({ id: "negocio", kind: "negocio", position: { lat: business.lat, lng: business.lng }, label: business.name });
  const maxMethod = Math.max(1, ...stats.byMethod.map((x) => x.amount));

  const TABS: { id: Tab; label: string }[] = [
    { id: "pedidos", label: `Pedidos (${activeOrders.length})` },
    { id: "mapa", label: "Mapa" },
    { id: "ingresos", label: "Ingresos y pagos" },
    { id: "soporte", label: "Soporte" },
  ];
  const show = (t: Tab) => (tab === t ? "flex" : "hidden") + " lg:flex";

  // El Resumen cabe en la pantalla: en escritorio todo a la vista; en celular, una sección a la vez.
  return (
    <main className="mx-auto flex h-full max-w-7xl flex-col gap-3 p-3 md:p-5">
      <WelcomeClock name={profile.full_name.split(" ")[0] || "dueño"} subtitle={`Resumen de hoy · ${business.name}`} />
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <h2 className="sr-only">{business.name}</h2>
        {needsValidation.length > 0 && (
          <Link href="/panel/pedidos?filtro=validar" className="btn-gas !px-4 !py-2 text-sm">
            {needsValidation.length} pago(s) por validar
          </Link>
        )}
      </div>

      {params.get("nuevo") && (
        <section className="shrink-0 rounded-3xl bg-gradient-to-br from-agua-600 to-agua-500 p-4 text-white shadow-lg">
          <p className="text-lg font-extrabold">¡Tu negocio está listo!</p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl bg-white/20 px-4 py-2.5 text-left text-sm font-semibold"
          >
            <span className="truncate">{link}</span>
            <span className="flex shrink-0 items-center gap-1">
              <Copy className="h-4 w-4" /> {copied ? "¡Copiado!" : "Copiar enlace para clientes"}
            </span>
          </button>
          <p className="mt-2 text-xs opacity-90">
            Siguiente: ajusta tus precios en <Link href="/panel/productos" className="font-bold underline">Mis productos</Link> y agrega repartidores en <Link href="/panel/repartidores" className="font-bold underline">Mi equipo</Link>.
          </p>
        </section>
      )}

      <section className="flex shrink-0 gap-2 overflow-x-auto sm:grid sm:grid-cols-4 md:gap-3 xl:grid-cols-7">
        <Kpi label="Pedidos hoy" value={String(stats.total)} tone="text-ink" />
        <Kpi label="En curso" value={String(stats.active)} tone="text-indigo-600" />
        <Kpi label="Entregados" value={String(stats.delivered)} tone="text-emerald-600" />
        <Kpi label="Ingresos validados" value={money(stats.validated)} tone="text-agua-700" />
        <Kpi label="Por validar" value={money(stats.toValidate)} tone="text-orange-600" sub={`${stats.toValidateCount} ${stats.toValidateCount === 1 ? "pago" : "pagos"}`} />
        <Kpi label="Ganancia bruta hoy" value={stats.hasProfit ? money(stats.gross) : "—"} tone="text-emerald-700" sub={stats.hasProfit ? "ventas − costo" : "registra tus costos"} />
        <Kpi label="Ganancia neta hoy" value={stats.hasProfit ? money(stats.net) : "—"} tone="text-emerald-700" sub={stats.hasProfit ? "− pago a repartidores" : "en Mis productos"} />
      </section>

      <div className="flex shrink-0 gap-1 rounded-2xl bg-slate-100 p-1 lg:hidden" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition ${tab === t.id ? "bg-white text-agua-700 shadow-sm" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-3 lg:grid-cols-5">
        <div className={`card min-h-0 flex-col overflow-hidden lg:col-span-3 ${show("mapa")}`}>
          <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
            <h2 className="font-bold">Mapa en vivo</h2>
            <span className="text-xs text-slate-500">{locations.length} repartidor(es) · {activeOrders.length} pedido(s)</span>
          </div>
          <Map center={LIMA} zoom={12} className="min-h-[14rem] flex-1" markers={markers} fitKey={`${markers.length}`} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:col-span-2">
          <div className={`card shrink-0 flex-col p-4 ${show("ingresos")}`}>
            <h2 className="font-bold">Ingresos validados hoy</h2>
            <div className="mt-3 space-y-2.5">
              {stats.byMethod.map(({ m, amount }) => (
                <div key={m}>
                  <div className="mb-1 flex justify-between text-sm font-semibold">
                    <span className="inline-flex items-center gap-2"><MethodMark method={m} className="h-5 w-5" />{METHOD[m].label}</span>
                    <span>{money(amount)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${(amount / maxMethod) * 100}%`, background: METHOD[m].color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`card max-h-52 shrink-0 flex-col overflow-y-auto p-4 ${show("ingresos")}`}>
            <h2 className="flex items-center gap-2 font-bold"><Wallet className="h-5 w-5 text-agua-700" /> A pagar a repartidores hoy</h2>
            {stats.payByDriver.size === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Aún no hay pedidos entregados hoy.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {[...stats.payByDriver.entries()].map(([id, r]) => {
                  const d = drivers.find((x) => x.user_id === id);
                  return (
                    <li key={id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{d?.profiles.full_name ?? "Tú"}</p>
                        <p className="text-xs text-slate-500">
                          {r.orders} {r.orders === 1 ? "entrega" : "entregas"} · {money(r.total)} · {payLabel(d?.pay_type, d?.pay_value)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-extrabold text-agua-700">{money(r.amount)}</p>
                        {r.pending > 0 && <p className="text-[11px] font-semibold text-amber-700">{r.pending} sin pago definido</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={`card min-h-0 flex-1 flex-col overflow-hidden ${show("pedidos")}`}>
            <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
              <h2 className="font-bold">Pedidos en curso</h2>
              <Link href="/panel/pedidos" className="text-sm font-bold text-agua-700">Ver todos →</Link>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
              {activeOrders.length === 0 && <Empty icon={<Coffee className="h-10 w-10 text-slate-300" />} title="Sin pedidos en curso" text="Cuando un cliente pida, aparecerá aquí al instante." />}
              {activeOrders.slice(0, 8).map((o) => (
                <OrderRow key={o.id} order={o} href="/panel/pedidos" showCustomer />
              ))}
            </div>
          </div>

          <div className={`min-h-0 flex-col lg:hidden ${tab === "soporte" ? "flex" : "hidden"}`}>
            <SupportCard />
          </div>
        </div>
      </div>
    </main>
  );
}

export default function PanelPage() {
  return (
    <Suspense>
      <Resumen />
    </Suspense>
  );
}
