"use client";

import { Bell, Bike, Coffee, Hand, Store } from "@/components/icons";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { ORDER_SELECT, OrderRow } from "@/components/orders";
import { Empty, ErrorText, FullLoader, Logo } from "@/components/ui";
import { errorMessage } from "@/lib/format";
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

  useEffect(() => {
    if (!business) return;
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`repartidor-${business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${business.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [business, load]);

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
        <div>
          <Logo size="sm" />
          <p className="mt-0.5 text-xs text-slate-500"><Store className="mr-1 inline h-3.5 w-3.5 -mt-0.5" />{business.name}</p>
        </div>
        <Link href="/cuenta" className="rounded-full bg-slate-100 p-2" aria-label="Mi cuenta">
          <UserRound className="h-5 w-5" />
        </Link>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 p-3 md:p-5">
        <ErrorText>{error}</ErrorText>
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
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
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
              <button onClick={() => take(o.id)} disabled={busy === o.id} className="btn-gas w-full">
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
