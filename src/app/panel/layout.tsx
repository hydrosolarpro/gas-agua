"use client";

import { Store } from "@/components/icons";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bike, ClipboardList, CreditCard, LayoutDashboard, Package, Settings, UserRound } from "lucide-react";
import { FullLoader, Logo } from "@/components/ui";
import { useSession } from "@/lib/hooks";
import { PanelCtx } from "@/components/panel-context";

const NAV = [
  { href: "/panel", label: "Resumen", icon: LayoutDashboard },
  { href: "/panel/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/panel/productos", label: "Productos", icon: Package },
  { href: "/panel/repartidores", label: "Equipo", icon: Bike },
  { href: "/panel/negocio", label: "Negocio", icon: Settings },
  { href: "/panel/suscripcion", label: "Plan", icon: CreditCard },
];

export default function PanelLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loading, profile, business, reload } = useSession(["dueno"]);

  if (loading || !profile || !business) return <FullLoader text="Abriendo tu panel…" />;

  return (
    <PanelCtx.Provider value={{ business, profile, reload }}>
      <div className="min-h-dvh md:flex">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5 md:flex">
          <Logo size="sm" />
          <p className="mt-3 truncate rounded-2xl bg-agua-50 px-3 py-2 text-sm font-semibold text-agua-700"><Store className="mr-1.5 inline h-4 w-4 -mt-0.5" />{business.name}</p>
          <nav className="mt-6 flex flex-1 flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/panel" ? pathname === href : pathname.startsWith(href);
              return (
                <Link key={href} href={href} className={`flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold transition ${active ? "bg-agua-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}>
                  <Icon className="h-5 w-5" /> {label}
                </Link>
              );
            })}
          </nav>
          <Link href="/cuenta" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            <UserRound className="h-5 w-5" /> {profile.full_name.split(" ")[0] || "Mi cuenta"}
          </Link>
        </aside>

        <div className="min-w-0 flex-1 pb-24 md:pb-8">
          <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm md:hidden">
            <Logo size="sm" />
            <Link href="/cuenta" className="rounded-full bg-slate-100 p-2" aria-label="Mi cuenta">
              <UserRound className="h-5 w-5" />
            </Link>
          </header>
          {children}
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/panel" ? pathname === href : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${active ? "text-agua-700" : "text-slate-500"}`}>
                <Icon className="h-5 w-5" /> {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </PanelCtx.Provider>
  );
}
