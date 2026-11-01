"use client";

import { Bike, Store } from "@/components/icons";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { ORDER_SELECT, OrderRow } from "@/components/orders";
import { Empty, FullLoader, Logo } from "@/components/ui";
import { ACTIVE_STATUSES } from "@/lib/format";
import { useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Business, Order } from "@/lib/types";

export default function ClientePage() {
  const { loading, profile } = useSession(["cliente", "dueno", "repartidor"]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const supabase = supabaseBrowser();
    const [{ data: o }, { data: b }] = await Promise.all([
      supabase.from("orders").select(ORDER_SELECT).eq("customer_id", profile.id).order("created_at", { ascending: false }).limit(30).returns<Order[]>(),
      supabase.from("businesses").select("*").eq("active", true).order("created_at").limit(50).returns<Business[]>(),
    ]);
    setOrders(o ?? []);
    setBusinesses(b ?? []);
  }, [profile]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    if (!profile) return;
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`cliente-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, profile]);

  if (loading || !profile || orders === null) return <FullLoader />;

  const active = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const past = orders.filter((o) => !ACTIVE_STATUSES.includes(o.status));
  const favorite = businesses.find((b) => b.id === profile.last_business_id);
  const others = businesses.filter((b) => b.id !== profile.last_business_id);

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <Logo size="sm" />
        <Link href="/cuenta" className="rounded-full bg-slate-100 p-2" aria-label="Mi cuenta">
          <UserRound className="h-5 w-5" />
        </Link>
      </header>
      <main className="mx-auto max-w-lg space-y-6 p-4">
        <section>
          <p className="text-slate-500">Hola, {profile.full_name.split(" ")[0] || "vecino"}</p>
          <h1 className="text-2xl font-extrabold">¿Qué necesitas hoy?</h1>
        </section>

        {active.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-bold"><Bike className="h-5 w-5 text-agua-600" /> En curso</h2>
            {active.map((o) => (
              <OrderRow key={o.id} order={o} href={`/cliente/pedido/${o.id}`} />
            ))}
          </section>
        )}

        {favorite && (
          <Link href={`/n/${favorite.slug}`} className="block rounded-3xl bg-gradient-to-br from-gas-600 to-gas-500 p-5 text-white shadow-lg shadow-gas-500/25">
            <p className="text-sm opacity-90">Pedir de nuevo a</p>
            <p className="text-xl font-extrabold">{favorite.name}</p>
            <p className="mt-3 inline-flex rounded-full bg-white/20 px-4 py-2 text-sm font-bold">Pedir gas o agua →</p>
          </Link>
        )}

        <section className="space-y-3">
          <h2 className="font-bold">Negocios disponibles</h2>
          {others.length === 0 && !favorite && (
            <Empty icon={<Store className="h-12 w-12 text-slate-300" />} title="Aún no hay negocios" text="Pide a tu distribuidor de confianza el enlace de su tienda en AguaGasExpress." />
          )}
          {others.map((b) => (
            <Link key={b.id} href={`/n/${b.slug}`} className="card flex items-center gap-3 p-4 hover:shadow-md">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-agua-50"><Store className="h-6 w-6 text-agua-600" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{b.name}</p>
                <p className="text-xs text-slate-500">
                  {[b.yape_number && "Yape", b.plin_number && "Plin", "Efectivo"].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-sm font-bold text-agua-700">Pedir →</span>
            </Link>
          ))}
        </section>

        {past.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold">Mis pedidos anteriores</h2>
            {past.map((o) => (
              <OrderRow key={o.id} order={o} href={`/cliente/pedido/${o.id}`} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
