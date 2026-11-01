"use client";

import { Banknote } from "@/components/icons";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { METHOD, PAY_STATUS, STATUS } from "@/lib/format";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/types";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const box = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-16 w-16" }[size];
  const text = { sm: "text-lg", md: "text-xl", lg: "text-3xl" }[size];
  return (
    <span className="inline-flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" className={`${box} rounded-2xl shadow-md`} />
      <span className={`${text} font-extrabold tracking-tight`}>
        <span className="text-agua-600">Agua</span>
        <span className="text-gas-500">Gas</span>
        <span className="text-ink">Express</span>
      </span>
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

export function FullLoader({ text = "Cargando…" }: { text?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner className="h-8 w-8 text-agua-600" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return <span className={`chip ${s.tone}`}>{s.label}</span>;
}

export function PayBadge({ status }: { status: PaymentStatus }) {
  const s = PAY_STATUS[status];
  return <span className={`chip ${s.tone}`}>{s.label}</span>;
}

export function MethodBadge({ method }: { method: PaymentMethod }) {
  const m = METHOD[method];
  return (
    <span className="chip text-white" style={{ background: m.color }}>
      {method === "efectivo" && <Banknote className="h-3.5 w-3.5" />}{m.label}
    </span>
  );
}

export function TopBar({ title, back, right }: { title: ReactNode; back?: string | true; right?: ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur">
      {back &&
        (back === true ? (
          <button onClick={() => router.back()} className="rounded-full p-2 hover:bg-slate-100" aria-label="Volver">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link href={back} className="rounded-full p-2 hover:bg-slate-100" aria-label="Volver">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ))}
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
      {right}
    </header>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{children}</p>;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <div className="text-5xl">{icon}</div>
      <p className="mt-1 text-lg font-bold">{title}</p>
      {text && <p className="max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Hoja inferior tipo app móvil. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" onClick={onClose}>
      <div
        className="sheet-panel max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />
        <h2 className="mb-4 text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
