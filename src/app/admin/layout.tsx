"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LayoutDashboard, Landmark, UserPlus, UserRound, Wallet } from "lucide-react";
import { Store } from "@/components/icons";
import { AdminCtx, useAdminData } from "@/components/admin-context";
import { AdminAlerts } from "@/components/alerts";
import { InviteSheet } from "@/components/admin-sheets";
import { FullLoader, Logo } from "@/components/ui";
import { useSession } from "@/lib/hooks";

const NAV = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/duenos", label: "Dueños", icon: Store },
  { href: "/admin/pagos", label: "Pagos", icon: Wallet },
  { href: "/admin/cobros", label: "Mis datos", icon: Landmark },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loading, profile } = useSession(["admin"]);
  const data = useAdminData();
  const [inviteOpen, setInviteOpen] = useState(false);

  if (loading || !profile) return <FullLoader text="Abriendo el panel…" />;

  const isActive = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  return (
    <AdminCtx.Provider value={{ ...data, openInvite: () => setInviteOpen(true) }}>
      <AdminAlerts />
      <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
        <aside className="hidden h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-4 md:flex lg:w-60">
          <Logo size="sm" />
          <p className="mt-3 rounded-2xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Administrador</p>
          <button onClick={() => setInviteOpen(true)} className="btn-gas mt-4 w-full py-3 text-sm">
            <UserPlus className="h-5 w-5" /> Invitar dueño
          </button>
          <nav className="mt-5 flex flex-1 flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`nav-item ${isActive(href) ? "nav-item-active" : ""}`}
              >
                <Icon className="h-5 w-5 shrink-0" /> {label}
              </Link>
            ))}
          </nav>
          <Link href="/cuenta" className="nav-item text-sm">
            <UserRound className="h-5 w-5 shrink-0" /> {profile.full_name.split(" ")[0] || "Mi cuenta"}
          </Link>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 bg-white px-4 py-2 shadow-sm md:hidden">
            <Logo size="sm" />
            <div className="flex items-center gap-2">
              <button onClick={() => setInviteOpen(true)} className="btn-gas px-4 py-2 text-sm">
                <UserPlus className="h-4 w-4" /> Invitar
              </button>
              <Link href="/cuenta" className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition-[background-color,transform] duration-150 ease-out-strong hover:bg-slate-200 active:scale-95" aria-label="Mi cuenta">
                <UserRound className="h-5 w-5" />
              </Link>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        <nav aria-label="Menú principal" className="grid shrink-0 grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={`tab-item ${isActive(href) ? "tab-item-active" : ""}`}
            >
              <span className={`tab-pill ${isActive(href) ? "tab-pill-active" : ""}`}><Icon className="h-5 w-5" /></span>
              <span className="max-w-full truncate">{label}</span>
            </Link>
          ))}
        </nav>
        </div>
      </div>
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </AdminCtx.Provider>
  );
}
