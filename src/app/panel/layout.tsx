"use client";


import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, Bike, ClipboardList, CreditCard, LayoutDashboard, Package, Settings, UserRound, Users } from "lucide-react";
import { FullLoader, Logo } from "@/components/ui";
import { useSession } from "@/lib/hooks";
import { PanelCtx } from "@/components/panel-context";
import { OwnerAlerts } from "@/components/alerts";
import { PlanGate } from "@/components/PlanGate";
import { BusinessLogo } from "@/components/BusinessBadge";
import { SupportCard } from "@/components/SupportCard";

const NAV = [
  { href: "/panel", label: "Resumen", short: "Resumen", icon: LayoutDashboard },
  { href: "/panel/pedidos", label: "Mis Pedidos", short: "Pedidos", icon: ClipboardList },
  { href: "/panel/clientes", label: "Mis Clientes", short: "Clientes", icon: Users },
  { href: "/panel/productos", label: "Mis productos", short: "Productos", icon: Package },
  { href: "/panel/repartidores", label: "Mi equipo", short: "Equipo", icon: Bike },
  { href: "/panel/negocio", label: "Datos de mi Negocio", short: "Negocio", icon: Settings },
  { href: "/panel/estadisticas", label: "Mis Estadísticas", short: "Estadíst.", icon: BarChart3 },
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
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-agua-50 p-2"><BusinessLogo business={business} size="md" /><p className="min-w-0 break-words text-sm font-extrabold leading-tight text-agua-800">{business.name}</p></div>
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
            <span className="flex min-w-0 items-center gap-2"><BusinessLogo business={business} size="sm" /><span className="truncate text-base font-extrabold text-slate-900">{business.name}</span></span>
            <Link href="/cuenta" className="rounded-full bg-slate-100 p-2" aria-label="Mi cuenta">
              <UserRound className="h-5 w-5" />
            </Link>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <PlanGate business={business}>{children}</PlanGate>
          </div>
        <nav className="grid shrink-0 grid-cols-7 border-t border-slate-200 bg-white md:hidden">
          {NAV.map(({ href, short, icon: Icon }) => {
            const active = href === "/panel" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold ${active ? "text-agua-700" : "text-slate-500"}`}>
                <Icon className="h-5 w-5" /> {short}
              </Link>
            );
          })}
        </nav>
        </div>
      </div>
    </PanelCtx.Provider>
  );
}
