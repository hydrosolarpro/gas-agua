"use client";

import { Bike, Store } from "@/components/icons";
import { BusinessLogo, OpenChip } from "@/components/BusinessBadge";
import { BusinessInfoCard, WelcomeClock } from "@/components/ClientWelcome";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserRound } from "lucide-react";
import { ORDER_SELECT, OrderRow } from "@/components/orders";
import { Empty, FullLoader } from "@/components/ui";
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
    const [{ data: o0, error: oErr }, { data: b }, { data: m }, { data: inv }] = await Promise.all([
      supabase.from("orders").select(ORDER_SELECT).eq("customer_id", profile.id).is("customer_hidden_at", null).order("created_at", { ascending: false }).limit(30).returns<Order[]>(),
      supabase.from("businesses").select("*").eq("active", true).order("created_at").limit(50).returns<Business[]>(),
      supabase.from("business_customers").select("business_id").eq("customer_id", profile.id).returns<{ business_id: string }[]>(),
      supabase
        .from("business_members")
        .select("business_id, businesses(name)")
        .eq("user_id", profile.id)
        .eq("accepted", false)
        .returns<{ business_id: string; businesses: { name: string } | null }[]>(),
    ]);
    let o = o0;
    // Si la columna de pedidos borrados aún no existe en la base de datos, se muestran todos.
    if (oErr) ({ data: o } = await supabase.from("orders").select(ORDER_SELECT).eq("customer_id", profile.id).order("created_at", { ascending: false }).limit(30).returns<Order[]>());
    setOrders(o ?? []);
    setBusinesses(b ?? []);
    setMine((m ?? []).map((x) => x.business_id));
    setDriverInvites((inv ?? []).map((x) => ({ business_id: x.business_id, name: x.businesses?.name ?? "un negocio" })));
  }, [profile]);

  const [deleting, setDeleting] = useState(false);
  async function deleteOrders(ids: string[], ask: string) {
    if (ids.length === 0 || !confirm(ask)) return;
    setDeleting(true);
    const res = await fetch("/api/orders/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderIds: ids }) });
    setDeleting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "No se pudo borrar");
    }
    load();
  }

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
  // Cada cliente ve SOLO los negocios a los que pertenece (por invitación de ese dueño o porque ya le hizo pedidos):
  // los clientes de un dueño nunca se mezclan con los de otro.
  const visible = businesses.filter((b) => mine.includes(b.id));
  const favorite = visible.find((b) => b.id === profile.last_business_id);
  const others = visible.filter((b) => b.id !== profile.last_business_id);
  const firstName = profile.full_name.split(" ")[0] || "vecino";
  const mainBusiness = favorite ?? visible[0];

  const TABS: { id: Tab; label: string }[] = [
    { id: "pedir", label: "Pedir" },
    { id: "pedidos", label: `Mis pedidos${active.length ? ` (${active.length})` : ""}` },
    { id: "cuenta", label: "Cuenta" },
  ];
  const pane = (t: Tab) => (tab === t ? "block space-y-3" : "hidden");

  // Tres secciones cortas en vez de una página larga: cada una cabe en la pantalla.
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-end bg-white px-4 py-2 shadow-sm">
        <Link href="/cuenta" className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-[background-color,transform] duration-150 ease-out-strong hover:bg-slate-200 active:scale-95" aria-label="Mi cuenta">
          <UserRound className="h-5 w-5" />
        </Link>
      </header>
      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-3 md:p-5">
        <WelcomeClock name={firstName} />

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

        <div className="min-h-[14rem] flex-1">
          <div className={pane("pedir")}>
        {mainBusiness && <BusinessInfoCard business={mainBusiness} customerName={firstName} />}
        {favorite && (
          <Link href={`/n/${favorite.slug}`} className="block rounded-3xl bg-gradient-to-br from-gas-600 to-gas-500 p-5 text-white shadow-lg shadow-gas-500/25">
            <p className="text-sm opacity-90">Pedir de nuevo a</p>
            <p className="text-xl font-extrabold">{favorite.name}</p>
            <p className="mt-3 inline-flex rounded-full bg-white/20 px-4 py-2 text-sm font-bold">Pedir gas o agua →</p>
          </Link>
        )}

        <section className="space-y-3">
          {others.length === 0 && !favorite && (
            <Empty icon={<Store className="h-12 w-12 text-slate-300" />} title="Aún no tienes un negocio" text="Pide a tu distribuidor el enlace de invitación o el enlace de su tienda en AguaGasExpress. Así tu cuenta queda con tu negocio." />
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">Mis pedidos anteriores</h2>
              <button
                onClick={() => deleteOrders(past.map((o) => o.id), `¿Borrar los ${past.length} pedidos anteriores de tu lista? Se eliminan también tus comprobantes de pago. No se puede deshacer.`)}
                disabled={deleting}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl px-3 text-sm font-bold text-rose-600 transition-[background-color,transform] duration-150 hover:bg-rose-50 active:scale-95"
              >
                <Trash2 className="h-4 w-4" /> Borrar todos
              </button>
            </div>
            {past.map((o) => (
              <div key={o.id} className="flex items-stretch gap-2">
                <div className="min-w-0 flex-1">
                  <OrderRow order={o} href={`/cliente/pedido/${o.id}`} />
                </div>
                <button
                  onClick={() => deleteOrders([o.id], `¿Borrar el pedido #${o.code} de tu lista? Se eliminan también tus comprobantes de pago. No se puede deshacer.`)}
                  disabled={deleting}
                  className="flex w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition-[background-color,transform] duration-150 hover:bg-rose-100 active:scale-95"
                  aria-label={`Borrar el pedido ${o.code}`}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
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
