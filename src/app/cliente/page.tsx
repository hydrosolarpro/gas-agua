"use client";

import { Bike, Store } from "@/components/icons";
import { BusinessLogo, OpenChip } from "@/components/BusinessBadge";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { ORDER_SELECT, OrderRow } from "@/components/orders";
import { Empty, FullLoader, Logo } from "@/components/ui";
import { BajaButton } from "@/components/BajaButton";
import { ACTIVE_STATUSES } from "@/lib/format";
import { rememberRole, useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Business, Order } from "@/lib/types";

type Tab = "pedir" | "pedidos" | "cuenta";

export default function ClientePage() {
  const { loading, profile } = useSession(["cliente"]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [driverInvites, setDriverInvites] = useState<{ business_id: string; name: string }[]>([]);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pedir");

  const load = useCallback(async () => {
    if (!profile) return;
    const supabase = supabaseBrowser();
    const [{ data: o }, { data: b }, { data: m }, { data: inv }] = await Promise.all([
      supabase.from("orders").select(ORDER_SELECT).eq("customer_id", profile.id).order("created_at", { ascending: false }).limit(30).returns<Order[]>(),
      supabase.from("businesses").select("*").eq("active", true).order("created_at").limit(50).returns<Business[]>(),
      supabase.from("business_customers").select("business_id").eq("customer_id", profile.id).returns<{ business_id: string }[]>(),
      supabase
        .from("business_members")
        .select("business_id, businesses(name)")
        .eq("user_id", profile.id)
        .eq("accepted", false)
        .returns<{ business_id: string; businesses: { name: string } | null }[]>(),
    ]);
    setOrders(o ?? []);
    setBusinesses(b ?? []);
    setMine((m ?? []).map((x) => x.business_id));
    setDriverInvites((inv ?? []).map((x) => ({ business_id: x.business_id, name: x.businesses?.name ?? "un negocio" })));
  }, [profile]);

  async function answerInvite(businessId: string, accept: boolean) {
    await supabaseBrowser().rpc(accept ? "accept_driver_invitation" : "decline_driver_invitation", { p_business_id: businessId });
    if (accept) {
      rememberRole("repartidor");
      router.push("/repartidor");
      return;
    }
    load();
  }

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
  // Si el cliente ya pertenece a uno o más negocios (por invitación o por pedidos), ve solo esos; si no, ve los disponibles.
  const visible = mine.length > 0 ? businesses.filter((b) => mine.includes(b.id)) : businesses;
  const favorite = visible.find((b) => b.id === profile.last_business_id);
  const others = visible.filter((b) => b.id !== profile.last_business_id);

  const TABS: { id: Tab; label: string }[] = [
    { id: "pedir", label: "Pedir" },
    { id: "pedidos", label: `Mis pedidos${active.length ? ` (${active.length})` : ""}` },
    { id: "cuenta", label: "Cuenta" },
  ];
  const pane = (t: Tab) => (tab === t ? "block space-y-3" : "hidden");

  // Tres secciones cortas en vez de una página larga: cada una cabe en la pantalla.
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between bg-white px-4 py-2 shadow-sm">
        <Logo size="sm" />
        <Link href="/cuenta" className="rounded-full bg-slate-100 p-2" aria-label="Mi cuenta">
          <UserRound className="h-5 w-5" />
        </Link>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 p-3 md:p-5">
        <section className="shrink-0">
          <p className="text-sm text-slate-500">Hola, {profile.full_name.split(" ")[0] || "vecino"}</p>
          <h1 className="text-xl font-extrabold md:text-2xl">¿Qué necesitas hoy?</h1>
        </section>

        {driverInvites.map((i) => (
          <section key={i.business_id} className="card space-y-3 border-2 border-agua-200 p-4">
            <p className="font-bold">
              <Bike className="mr-1.5 inline h-5 w-5 text-agua-600" />
              {i.name} te invitó como repartidor
            </p>
            <p className="text-sm text-slate-600">Si aceptas, podrás recibir y entregar sus pedidos. Tu cuenta de cliente sigue igual.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => answerInvite(i.business_id, true)} className="btn-primary px-3 py-2.5 text-sm">
                Aceptar
              </button>
              <button onClick={() => answerInvite(i.business_id, false)} className="btn-outline px-3 py-2.5 text-sm">
                Ahora no
              </button>
            </div>
          </section>
        ))}


        <div className="flex shrink-0 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={pane("pedir")}>
        {favorite && (
          <Link href={`/n/${favorite.slug}`} className="block rounded-3xl bg-gradient-to-br from-gas-600 to-gas-500 p-5 text-white shadow-lg shadow-gas-500/25">
            <p className="text-sm opacity-90">Pedir de nuevo a</p>
            <p className="text-xl font-extrabold">{favorite.name}</p>
            <p className="mt-3 inline-flex rounded-full bg-white/20 px-4 py-2 text-sm font-bold">Pedir gas o agua →</p>
          </Link>
        )}

        <section className="space-y-3">
          <h2 className="font-bold">{mine.length > 0 ? "Mis negocios" : "Negocios disponibles"}</h2>
          {others.length === 0 && !favorite && (
            <Empty icon={<Store className="h-12 w-12 text-slate-300" />} title="Aún no hay negocios" text="Pide a tu distribuidor de confianza el enlace de su tienda en AguaGasExpress." />
          )}
          {others.map((b) => (
            <Link key={b.id} href={`/n/${b.slug}`} className="card flex items-center gap-3 p-4 hover:shadow-md">
              <BusinessLogo business={b} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{b.name}</p>
                <OpenChip hours={b.opening_hours} />
                <p className="text-xs text-slate-500">
                  {[b.yape_number && "Yape", b.plin_number && "Plin", "Efectivo"].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-sm font-bold text-agua-700">Pedir →</span>
            </Link>
          ))}
        </section>

          </div>
          <div className={pane("pedidos")}>
        {active.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-bold"><Bike className="h-5 w-5 text-agua-600" /> En curso</h2>
            {active.map((o) => (
              <OrderRow key={o.id} order={o} href={`/cliente/pedido/${o.id}`} />
            ))}
          </section>
        )}

        {past.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-bold">Mis pedidos anteriores</h2>
            {past.map((o) => (
              <OrderRow key={o.id} order={o} href={`/cliente/pedido/${o.id}`} />
            ))}
          </section>
        )}

            {active.length === 0 && past.length === 0 && (
              <Empty icon={<Store className="h-12 w-12 text-slate-300" />} title="Aún no tienes pedidos" text="Cuando pidas, los verás aquí." />
            )}
          </div>
          <div className={pane("cuenta")}>
            <Link href="/cuenta" className="card flex items-center justify-between p-4">
              <span className="font-bold">Mi cuenta y mi PIN</span>
              <span className="text-sm font-bold text-agua-700">Ver →</span>
            </Link>
        {profile.role === "cliente" && !profile.is_admin && (
          <section className="space-y-2 pb-4 pt-2">
            <p className="text-center text-sm text-slate-500">¿Ya no quieres usar AguaGasExpress?</p>
            <BajaButton />
          </section>
        )}
          </div>
        </div>
      </main>
    </div>
  );
}
