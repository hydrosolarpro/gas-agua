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
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold transition ${isActive(href) ? "bg-agua-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Icon className="h-5 w-5" /> {label}
              </Link>
            ))}
          </nav>
          <Link href="/cuenta" className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            <UserRound className="h-5 w-5" /> {profile.full_name.split(" ")[0] || "Mi cuenta"}
          </Link>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 bg-white px-4 py-2 shadow-sm md:hidden">
            <Logo size="sm" />
            <div className="flex items-center gap-2">
              <button onClick={() => setInviteOpen(true)} className="btn-gas px-4 py-2 text-sm">
                <UserPlus className="h-4 w-4" /> Invitar
              </button>
              <Link href="/cuenta" className="rounded-full bg-slate-100 p-2" aria-label="Mi cuenta">
                <UserRound className="h-5 w-5" />
              </Link>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        <nav className="grid shrink-0 grid-cols-4 border-t border-slate-200 bg-white md:hidden">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${isActive(href) ? "text-agua-700" : "text-slate-500"}`}
            >
              <Icon className="h-5 w-5" /> {label}
            </Link>
          ))}
        </nav>
        </div>
      </div>
      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </AdminCtx.Provider>
  );
}
