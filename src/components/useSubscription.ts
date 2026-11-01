"use client";

import { useCallback, useEffect, useState } from "react";
import { currentPeriod, ownerStatus, type OwnerStatus } from "@/components/admin-context";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Business, PlatformSettings, SubscriptionPayment } from "@/lib/types";

/** Plan del dueño: monto, datos de cobro del administrador, pagos y situación del mes. */
export function useSubscription(business: Business) {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [payments, setPayments] = useState<SubscriptionPayment[] | null>(null);

  const load = useCallback(async () => {
    const db = supabaseBrowser();
    const [s, p] = await Promise.all([
      db.from("platform_settings").select("*").eq("id", 1).single<PlatformSettings>(),
      db
        .from("subscription_payments")
        .select("*")
        .eq("business_id", business.id)
        .order("period", { ascending: false })
        .order("reported_at", { ascending: false })
        .returns<SubscriptionPayment[]>(),
    ]);
    setSettings(s.data ?? null);
    setPayments(p.data ?? []);
  }, [business.id]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  const fee = Number(business.fee_override ?? settings?.monthly_fee ?? 0);
  const period = currentPeriod();
  const status: OwnerStatus | null = payments ? ownerStatus(business.id, payments, period) : null;
  return { settings, payments, fee, period, status, reload: load };
}
