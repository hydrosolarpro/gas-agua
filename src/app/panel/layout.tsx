"use client";

import { Store } from "@/components/icons";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, Bike, ClipboardList, CreditCard, LayoutDashboard, Package, Settings, UserRound, Users } from "lucide-react";
import { FullLoader, Logo } from "@/components/ui";
import { useSession } from "@/lib/hooks";
import { PanelCtx } from "@/components/panel-context";
import { OwnerAlerts } from "@/components/alerts";
import { PlanGate } from "@/components/PlanGate";
import { SupportCard } from "@/components/SupportCard";

const NAV = [
  { href: "/panel", label: "Resumen", icon: LayoutDashboard },
  { href: "/panel/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/panel/clientes", label: "Clientes", icon: Users },
  { href: "/panel/productos", label: "Productos", icon: Package },
  { href: "/panel/repartidores", label: "Equipo", icon: Bike },
  { href: "/panel/negocio", label: "Negocio", icon: Settings },
  { href: "/panel/estadisticas", label: "Estadísticas", icon: BarChart3 },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loading, profile, business, reload } = useSession(["dueno"]);

  if (loading || !profile || !business) return <FullLoader text="Abriendo tu panel…" />;

  return (
    <PanelCtx.Provider value={{ business, profile, reload }}>
      <OwnerAlerts businessId={business.id} />
      <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
        <aside className="hidden h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-4 md:flex lg:w-60">
          <Logo size="sm" />
          <p className="mt-3 truncate rounded-2xl bg-agua-50 px-3 py-2 text-sm font-semibold text-agua-700"><Store className="mr-1.5 inline h-4 w-4 -mt-0.5" />{business.name}</p>
          <nav className="mt-4 flex flex-1 flex-col gap-0.5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/panel" ? pathname === href : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 font-semibold transition ${active ? "bg-agua-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}>
                  <Icon className="h-5 w-5" /> {label}
                </Link>
              );
            })}
          </nav>
          <SupportCard compact />
          <Link href="/panel/suscripcion" className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${pathname.startsWith("/panel/suscripcion") ? "bg-agua-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            <CreditCard className="h-5 w-5" /> Mi plan y pagos
          </Link>
          <Link href="/cuenta" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            <UserRound className="h-5 w-5" /> {profile.full_name.split(" ")[0] || "Mi cuenta"}
          </Link>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between bg-white px-4 py-2 shadow-sm md:hidden">
            <Logo size="sm" />
            <Link href="/cuenta" className="rounded-full bg-slate-100 p-2" aria-label="Mi cuenta">
              <UserRound className="h-5 w-5" />
            </Link>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <PlanGate business={business}>{children}</PlanGate>
          </div>
        <nav className="grid shrink-0 grid-cols-7 border-t border-slate-200 bg-white md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/panel" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold ${active ? "text-agua-700" : "text-slate-500"}`}>
                <Icon className="h-5 w-5" /> {label === "Estadísticas" ? "Estadíst." : label}
              </Link>
            );
          })}
        </nav>
        </div>
      </div>
    </PanelCtx.Provider>
  );
}
