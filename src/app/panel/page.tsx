"use client";

import { Coffee, MethodMark } from "@/components/icons";

import Link from "next/link";
import { SupportCard } from "@/components/SupportCard";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import Map, { LIMA, type MapMarker } from "@/components/map/Map";
import { OrderRow } from "@/components/orders";
import { Empty, FullLoader } from "@/components/ui";
import { useBusinessOrders, useDrivers } from "@/components/useBusinessOrders";
import { ACTIVE_STATUSES, METHOD, money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { DriverLocation, PaymentMethod } from "@/lib/types";
import { usePanel } from "@/components/panel-context";

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
  const { business } = usePanel();
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
    return {
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
    { id: "ingresos", label: "Ingresos" },
    { id: "soporte", label: "Soporte" },
  ];
  const show = (t: Tab) => (tab === t ? "flex" : "hidden") + " lg:flex";

  // El Resumen cabe en la pantalla: en escritorio todo a la vista; en celular, una sección a la vez.
  return (
    <main className="mx-auto flex h-full max-w-7xl flex-col gap-3 p-3 md:p-5">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-slate-500">Resumen de hoy</p>
          <h1 className="text-xl font-extrabold leading-tight md:text-2xl">{business.name}</h1>
        </div>
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
            Siguiente: ajusta tus precios en <Link href="/panel/productos" className="font-bold underline">Productos</Link> y agrega repartidores en <Link href="/panel/repartidores" className="font-bold underline">Equipo</Link>.
          </p>
        </section>
      )}

      <section className="flex shrink-0 gap-2 overflow-x-auto sm:grid sm:grid-cols-5 md:gap-3">
        <Kpi label="Pedidos hoy" value={String(stats.total)} tone="text-ink" />
        <Kpi label="En curso" value={String(stats.active)} tone="text-indigo-600" />
        <Kpi label="Entregados" value={String(stats.delivered)} tone="text-emerald-600" />
        <Kpi label="Ingresos validados" value={money(stats.validated)} tone="text-agua-700" />
        <Kpi label="Por validar" value={money(stats.toValidate)} tone="text-orange-600" sub={`${stats.toValidateCount} ${stats.toValidateCount === 1 ? "pago" : "pagos"}`} />
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
