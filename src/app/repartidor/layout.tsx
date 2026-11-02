import type { ReactNode } from "react";
import { DriverAlerts } from "@/components/alerts";

export default function RepartidorLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DriverAlerts />
      {children}
    </>
  );
}
