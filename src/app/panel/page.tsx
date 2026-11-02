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

function Kpi({ label, value, tone, sub, className = "" }: { label: string; value: string; tone: string; sub?: string; className?: string }) {
  return (
    <div className={`card p-4 ${className}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p>
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

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-slate-500">Resumen de hoy</p>
          <h1 className="text-2xl font-extrabold">{business.name}</h1>
        </div>
      </div>

      {params.get("nuevo") && (
        <section className="rounded-3xl bg-gradient-to-br from-agua-600 to-agua-500 p-5 text-white shadow-lg">
          <p className="text-xl font-extrabold">¡Tu negocio está listo!</p>
          <p className="mt-1 text-sm opacity-90">Comparte este enlace por WhatsApp para que tus clientes te pidan gas y agua:</p>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl bg-white/20 px-4 py-3 text-left font-semibold"
          >
            <span className="truncate">{link}</span>
            <span className="flex shrink-0 items-center gap-1 text-sm">
              <Copy className="h-4 w-4" /> {copied ? "¡Copiado!" : "Copiar"}
            </span>
          </button>
          <p className="mt-3 text-sm opacity-90">
            Siguiente: ajusta tus precios en <Link href="/panel/productos" className="font-bold underline">Productos</Link> y agrega repartidores en <Link href="/panel/repartidores" className="font-bold underline">Equipo</Link>.
          </p>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Pedidos hoy" value={String(stats.total)} tone="text-ink" />
        <Kpi label="En curso" value={String(stats.active)} tone="text-indigo-600" />
        <Kpi label="Entregados" value={String(stats.delivered)} tone="text-emerald-600" />
        <Kpi label="Ingresos validados" value={money(stats.validated)} tone="text-agua-700" />
        <Kpi className="col-span-2 lg:col-span-1" label="Por validar" value={money(stats.toValidate)} tone="text-orange-600" sub={`${stats.toValidateCount} ${stats.toValidateCount === 1 ? "pago" : "pagos"}`} />
      </section>

      {needsValidation.length > 0 && (
        <section className="rounded-3xl border-2 border-orange-200 bg-orange-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-bold text-orange-900">{needsValidation.length} pago(s) esperan tu validación</p>
            <Link href="/panel/pedidos?filtro=validar" className="btn-gas px-4 py-2 text-sm">Validar ahora</Link>
          </div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-5">
        <div className="card overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between p-4">
            <h2 className="font-bold">Mapa en vivo</h2>
            <span className="text-xs text-slate-500">{locations.length} repartidor(es) · {activeOrders.length} pedido(s)</span>
          </div>
          <Map center={LIMA} zoom={12} className="h-96" markers={markers} fitKey={`${markers.length}`} />
        </div>

        <div className="card p-5 lg:col-span-2">
          <h2 className="font-bold">Ingresos validados hoy</h2>
          <div className="mt-4 space-y-4">
            {stats.byMethod.map(({ m, amount }) => (
              <div key={m}>
                <div className="mb-1 flex justify-between text-sm font-semibold">
                  <span className="inline-flex items-center gap-2"><MethodMark method={m} className="h-5 w-5" />{METHOD[m].label}</span>
                  <span>{money(amount)}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(amount / maxMethod) * 100}%`, background: METHOD[m].color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Pedidos en curso</h2>
          <Link href="/panel/pedidos" className="text-sm font-bold text-agua-700">Ver todos →</Link>
        </div>
        {activeOrders.length === 0 && <Empty icon={<Coffee className="h-12 w-12 text-slate-300" />} title="Sin pedidos en curso" text="Cuando un cliente pida, aparecerá aquí al instante." />}
        <div className="grid gap-3 md:grid-cols-2">
          {activeOrders.slice(0, 6).map((o) => (
            <OrderRow key={o.id} order={o} href="/panel/pedidos" showCustomer />
          ))}
        </div>
      </section>

      <SupportCard />
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
