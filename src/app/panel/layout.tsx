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
                <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`nav-item ${active ? "nav-item-active" : ""}`}>
                  <Icon className="h-5 w-5 shrink-0" /> {label}
                </Link>
              );
            })}
          </nav>
          <SupportCard compact />
          <Link href="/panel/suscripcion" aria-current={pathname.startsWith("/panel/suscripcion") ? "page" : undefined} className={`nav-item text-sm ${pathname.startsWith("/panel/suscripcion") ? "nav-item-active" : ""}`}>
            <CreditCard className="h-5 w-5 shrink-0" /> Mi plan y pagos
          </Link>
          <Link href="/cuenta" className="nav-item text-sm">
            <UserRound className="h-5 w-5 shrink-0" /> {profile.full_name.split(" ")[0] || "Mi cuenta"}
          </Link>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between bg-white px-4 py-2 shadow-sm md:hidden">
            <span className="flex min-w-0 items-center gap-2"><BusinessLogo business={business} size="sm" /><span className="truncate text-base font-extrabold text-slate-900">{business.name}</span></span>
            <Link href="/cuenta" className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-[background-color,transform] duration-150 ease-out-strong hover:bg-slate-200 active:scale-95" aria-label="Mi cuenta">
              <UserRound className="h-5 w-5" />
            </Link>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <PlanGate business={business}>{children}</PlanGate>
          </div>
        <nav aria-label="Menú principal" className="grid shrink-0 grid-cols-7 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map(({ href, short, icon: Icon }) => {
            const active = href === "/panel" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`tab-item ${active ? "tab-item-active" : ""}`}>
                <span className={`tab-pill ${active ? "tab-pill-active" : ""}`}><Icon className="h-5 w-5" /></span>
                <span className="max-w-full truncate">{short}</span>
              </Link>
            );
          })}
        </nav>
        </div>
      </div>
    </PanelCtx.Provider>
  );
}
