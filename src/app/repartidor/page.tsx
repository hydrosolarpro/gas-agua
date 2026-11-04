"use client";

import { Bell, Bike, Coffee, Hand, Store } from "@/components/icons";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, ChevronRight, UserRound, Wallet } from "lucide-react";
import { BusinessLogo, HoursList, OpenChip } from "@/components/BusinessBadge";
import { WelcomeClock } from "@/components/ClientWelcome";
import { orderPay } from "@/lib/finance";
import { limaDate } from "@/lib/plan";
import { ORDER_SELECT, OrderRow } from "@/components/orders";
import { Empty, ErrorText, FullLoader } from "@/components/ui";
import { errorMessage, money } from "@/lib/format";
import { useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Order } from "@/lib/types";

type Tab = "mias" | "nuevos";

export default function RepartidorPage() {
  const { loading, profile, business } = useSession(["repartidor"]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("mias");
  const [today, setToday] = useState<{ n: number; total: number; pay: number; pending: number } | null>(null);

  const load = useCallback(async () => {
    if (!business) return;
    const { data } = await supabaseBrowser()
      .from("orders")
      .select(ORDER_SELECT)
      .eq("business_id", business.id)
      .in("status", ["pendiente", "aceptado", "en_camino"])
      .order("created_at")
      .returns<Order[]>();
    setOrders(data ?? []);
  }, [business]);

  // Entregas de hoy con su total y lo que me corresponde cobrar (según la forma de pago que definió el dueño).
  const loadToday = useCallback(async () => {
    if (!business || !profile) return;
    const day = limaDate();
    const since = `${day}T00:00:00-05:00`;
    const q = (cols: string) =>
      supabaseBrowser()
        .from("orders")
        .select(cols)
        .eq("business_id", business.id)
        .eq("driver_id", profile.id)
        .eq("status", "entregado")
        .gte("delivered_at", since)
        .returns<Pick<Order, "total" | "order_driver_pay">[]>();
    const full = await q("total, order_driver_pay(driver_id, pay_type, pay_value, distance_km, amount)");
    const { data } = full.error ? await q("total") : full;
    const list = data ?? [];
    const pays = list.map((o) => orderPay(o)?.amount);
    setToday({
      n: list.length,
      total: list.reduce((a, o) => a + Number(o.total), 0),
      pay: pays.reduce<number>((a, v) => a + Number(v ?? 0), 0),
      pending: pays.filter((v) => v === null || v === undefined).length,
    });
  }, [business, profile]);

  useEffect(() => {
    if (!business) return;
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    loadToday(); // eslint-disable-line react-hooks/set-state-in-effect
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`repartidor-${business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${business.id}` }, () => {
        load();
        loadToday();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [business, load, loadToday]);

  async function take(id: string) {
    setBusy(id);
    setError("");
    const { error } = await supabaseBrowser().rpc("assign_order", { p_order_id: id });
    if (error) setError(errorMessage(error));
    await load();
    setBusy(null);
  }

  if (loading || !profile) return <FullLoader />;
  if (!business)
    return (
      <div className="p-4">
        <Empty icon={<Store className="h-12 w-12 text-slate-300" />} title="Aún no estás asignado a un negocio" text="Pide al dueño que te agregue como repartidor con tu celular." />
      </div>
    );
  if (orders === null) return <FullLoader />;

  const mine = orders.filter((o) => o.driver_id === profile.id);
  const free = orders.filter((o) => o.status === "pendiente");

  const TABS: { id: Tab; label: string }[] = [
    { id: "mias", label: `Mis entregas (${mine.length})` },
    { id: "nuevos", label: `Nuevos (${free.length})` },
  ];
  const pane = (t: Tab) => (tab === t ? "block" : "hidden") + " md:block";

  // En celular una lista a la vez; en pantalla grande, las dos lado a lado.
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between bg-white px-4 py-2 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <BusinessLogo business={business} size="md" />
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold leading-tight text-slate-900">{business.name}</p>
            <OpenChip hours={business.opening_hours} />
          </div>
        </div>
        <Link href="/cuenta" className="shrink-0 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-[background-color,transform] duration-150 ease-out-strong hover:bg-slate-200 active:scale-95" aria-label="Mi cuenta">
          <UserRound className="h-5 w-5" />
        </Link>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 overflow-y-auto p-3 md:p-5">
        <WelcomeClock name={profile.full_name.split(" ")[0] || "repartidor"} subtitle="Tus entregas de hoy" />
        <ErrorText>{error}</ErrorText>
        <Link href="/repartidor/estadisticas" className="flex shrink-0 flex-col gap-3 rounded-3xl bg-gradient-to-r from-agua-600 to-agua-500 p-3.5 text-white shadow-lg active:scale-[0.99] sm:flex-row sm:items-center">
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20"><Wallet className="h-7 w-7" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold uppercase tracking-wide opacity-90">Hoy · {today ? today.n : "…"} {today?.n === 1 ? "entregado" : "entregados"}</span>
              <span className="block text-2xl font-extrabold leading-tight">{today ? money(today.pay) : "…"} <span className="text-sm font-semibold opacity-90">mi pago</span></span>
              <span className="block text-sm font-semibold opacity-90">
                Total de pedidos {today ? money(today.total) : "…"}
                {today && today.pending > 0 ? ` · ${today.pending} sin pago definido` : ""}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-white/20 px-3 py-2.5 text-sm font-bold"><BarChart3 className="h-5 w-5" /> Mis estadísticas y pagos <ChevronRight className="h-4 w-4" /></span>
        </Link>
        {business.opening_hours && (
          <details className="shrink-0 rounded-2xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
            <summary className="cursor-pointer font-bold text-slate-700">Horario de atención del negocio</summary>
            <div className="mt-2"><HoursList hours={business.opening_hours} /></div>
          </details>
        )}
        <div className="flex shrink-0 gap-1 rounded-2xl bg-slate-100 p-1 md:hidden" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-xl px-2 py-2 text-sm font-bold transition ${tab === t.id ? "bg-white text-agua-700 shadow-sm" : "text-slate-500"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid min-h-[16rem] flex-1 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          <div className={`min-h-0 overflow-y-auto ${pane("mias")}`}>
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-bold"><Bike className="h-5 w-5 text-agua-600" /> Mis entregas ({mine.length})</h2>
          {mine.length === 0 && <Empty icon={<Coffee className="h-12 w-12 text-slate-300" />} title="Sin entregas asignadas" text="Toma un pedido nuevo de la lista de abajo." />}
          {mine.map((o) => (
            <OrderRow key={o.id} order={o} href={`/repartidor/pedido/${o.id}`} showCustomer />
          ))}
        </section>

          </div>
          <div className={`min-h-0 overflow-y-auto ${pane("nuevos")}`}>
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-bold"><Bell className="h-5 w-5 text-gas-600" /> Pedidos nuevos ({free.length})</h2>
          {free.length === 0 && <p className="text-sm text-slate-500">No hay pedidos por tomar. Te avisaremos aquí al instante.</p>}
          {free.map((o) => (
            <div key={o.id} className="card space-y-3 p-4">
              <OrderRow order={o} href={`/repartidor/pedido/${o.id}`} showCustomer />
              <button onClick={() => take(o.id)} disabled={busy === o.id} className="cta-gas">
                <Hand className="h-5 w-5" /> Tomar este pedido
              </button>
            </div>
          ))}
        </section>
          </div>
        </div>
      </main>
    </div>
  );
}
