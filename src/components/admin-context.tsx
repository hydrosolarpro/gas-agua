"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Business, PlatformSettings, SubscriptionPayment } from "@/lib/types";

export type OwnerRow = Business & {
  owner: { full_name: string; phone: string | null } | null;
  orders_total: number;
  orders_delivered: number;
  sales_validated: number;
  created_at: string;
};

export type Invitation = { id: string; note: string | null; expires_at: string; used_at: string | null; revoked: boolean; created_at: string };

export type AdminData = {
  owners: OwnerRow[] | null;
  payments: SubscriptionPayment[];
  settings: PlatformSettings | null;
  invitations: Invitation[];
  reload: () => Promise<void>;
  openInvite: () => void;
};

export const AdminCtx = createContext<AdminData | null>(null);

export function useAdmin() {
  const v = useContext(AdminCtx);
  if (!v) throw new Error("useAdmin fuera del panel del administrador");
  return v;
}

/** Primer día del mes actual, formato de la base de datos (YYYY-MM-01). */
export function currentPeriod(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
}

/** Monto mensual que paga un dueño: el propio si el administrador lo fijó, si no el general. */
export function feeFor(owner: Pick<OwnerRow, "fee_override">, settings: PlatformSettings | null) {
  return Number(owner.fee_override ?? settings?.monthly_fee ?? 0);
}

export type OwnerStatus = "al_dia" | "por_validar" | "pendiente";

/** Situación del dueño en el mes actual según sus pagos. */
export function ownerStatus(businessId: string, payments: SubscriptionPayment[], period = currentPeriod()): OwnerStatus {
  const mine = payments.filter((p) => p.business_id === businessId && p.period === period);
  if (mine.some((p) => p.status === "validado")) return "al_dia";
  if (mine.some((p) => p.status === "pendiente")) return "por_validar";
  return "pendiente";
}

export const STATUS_LABEL: Record<OwnerStatus, { label: string; tone: string }> = {
  al_dia: { label: "Al día", tone: "bg-emerald-100 text-emerald-800" },
  por_validar: { label: "Por validar", tone: "bg-orange-100 text-orange-800" },
  pendiente: { label: "Sin pagar", tone: "bg-rose-100 text-rose-800" },
};

export function useAdminData(): Omit<AdminData, "openInvite"> {
  const [owners, setOwners] = useState<OwnerRow[] | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const reload = useCallback(async () => {
    const db = supabaseBrowser();
    const [b, p, s, i, st] = await Promise.all([
      db
        .from("businesses")
        .select("*, owner:profiles!businesses_owner_id_fkey(full_name, phone)")
        .order("created_at", { ascending: false })
        .returns<(Business & { owner: OwnerRow["owner"]; created_at: string })[]>(),
      db.from("subscription_payments").select("*").order("reported_at", { ascending: false }).returns<SubscriptionPayment[]>(),
      db.from("platform_settings").select("*").eq("id", 1).single<PlatformSettings>(),
      db
        .from("invitations")
        .select("id, note, expires_at, used_at, revoked, created_at")
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<Invitation[]>(),
      db.rpc("admin_owner_stats"),
    ]);
    const stats = new Map<string, { orders_total: number; orders_delivered: number; sales_validated: number }>();
    for (const r of (st.data ?? []) as { business_id: string; orders_total: number; orders_delivered: number; sales_validated: number }[]) {
      stats.set(r.business_id, {
        orders_total: Number(r.orders_total),
        orders_delivered: Number(r.orders_delivered),
        sales_validated: Number(r.sales_validated),
      });
    }
    setOwners(
      (b.data ?? []).map((x) => ({
        ...x,
        orders_total: stats.get(x.id)?.orders_total ?? 0,
        orders_delivered: stats.get(x.id)?.orders_delivered ?? 0,
        sales_validated: stats.get(x.id)?.sales_validated ?? 0,
      })),
    );
    setPayments(p.data ?? []);
    setSettings(s.data ?? null);
    setInvitations(i.data ?? []);
  }, []);

  useEffect(() => {
    reload(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [reload]);

  return { owners, payments, settings, invitations, reload };
}
