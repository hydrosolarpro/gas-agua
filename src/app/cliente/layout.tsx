import type { ReactNode } from "react";
import { ArrivalWatcher } from "@/components/ArrivalWatcher";
import { ClientAlerts } from "@/components/alerts";

export default function ClienteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ClientAlerts />
      <ArrivalWatcher />
      {children}
    </>
  );
}
