"use client";

import { createContext, useContext } from "react";
import type { Business, Profile } from "@/lib/types";

export const PanelCtx = createContext<{ business: Business; profile: Profile; reload: () => Promise<void> } | null>(null);

export function usePanel() {
  const v = useContext(PanelCtx);
  if (!v) throw new Error("usePanel fuera del panel");
  return v;
}
