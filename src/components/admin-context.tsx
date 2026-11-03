"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { daysLabel, limaDate, planFor, type PlanState } from "@/lib/plan";
import type { Business, PlatformSettings, SubscriptionPayment } from "@/lib/types";

export type OwnerRow = Business & {
  owner: { full_name: string; phone: string | null; deactivated_at?: string | null; deactivated_phone?: string | null } | null;
  orders_total: number;
  orders_delivered: number;
  sales_validated: number;
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

/** Monto mensual que paga un dueño: el propio si el administrador lo fijó, si no el general. */
export function feeFor(owner: Pick<OwnerRow, "fee_override">, settings: PlatformSettings | null) {
  return Number(owner.fee_override ?? settings?.monthly_fee ?? 0);
}

/** Demo, plan pagado o vencido de un negocio, según sus pagos validados. */
export function ownerPlan(owner: Pick<Business, "id" | "created_at">, payments: SubscriptionPayment[]): PlanState {
  return planFor(owner.created_at, payments.filter((p) => p.business_id === owner.id));
}

/** Etiqueta y color para mostrar la situación del dueño. */
export function planChip(plan: PlanState): { label: string; tone: string } {
  if (plan.phase === "vencido") return { label: "Vencido", tone: "bg-rose-100 text-rose-800" };
  const base = plan.phase === "demo" ? "Demo" : "Plan pagado";
  const tone = plan.level === "ok" ? (plan.phase === "demo" ? "bg-sky-100 text-sky-800" : "bg-emerald-100 text-emerald-800") : "bg-orange-100 text-orange-800";
  return { label: `${base} · ${daysLabel(plan.daysLeft)}`, tone };
}

/** ¿El pago se hizo en el mes actual (hora de Perú)? */
export const paidThisMonth = (p: SubscriptionPayment) => limaDate(p.paid_at).slice(0, 7) === limaDate().slice(0, 7);

export function useAdminData(): Omit<AdminData, "openInvite"> {
  const [owners, setOwners] = useState<OwnerRow[] | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const reload = useCallback(async () => {
    const db = supabaseBrowser();
    const [b, p, s, i, st] = await Promise.all([
      (async () => {
        const q = (cols: string) =>
          db.from("businesses").select(cols).order("created_at", { ascending: false }).returns<(Business & { owner: OwnerRow["owner"]; created_at: string })[]>();
        // Si las columnas de baja aún no existen en la base, se sigue mostrando la lista sin ellas.
        const full = await q("*, owner:profiles!businesses_owner_id_fkey(full_name, phone, deactivated_at, deactivated_phone)");
        return full.error ? q("*, owner:profiles!businesses_owner_id_fkey(full_name, phone)") : full;
      })(),
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
