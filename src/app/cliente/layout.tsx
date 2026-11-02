import type { ReactNode } from "react";
import { ArrivalWatcher } from "@/components/ArrivalWatcher";

export default function ClienteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ArrivalWatcher />
      {children}
    </>
  );
}
