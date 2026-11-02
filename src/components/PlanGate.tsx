"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BellRing, Lock } from "lucide-react";
import { Sheet } from "@/components/ui";
import { useSubscription } from "@/components/useSubscription";
import { fmtDay, limaDate, type PlanState } from "@/lib/plan";
import type { Business } from "@/lib/types";

const QUE = (p: PlanState) => (p.phase === "demo" ? "tu DEMO gratis" : "tu plan");

function message(p: PlanState) {
  if (p.level === "vencido") return { title: `${p.phase === "vencido" ? "Tu acceso terminó" : "Venció"}`, text: `Terminó el ${fmtDay(p.until)}. Renueva para volver a recibir pedidos.` };
  if (p.level === "ultimo") return { title: `Hoy termina ${QUE(p)}`, text: `Hoy ${fmtDay(p.until)} es el último día. Renueva hoy para no perder pedidos.` };
  if (p.level === "manana") return { title: `Mañana termina ${QUE(p)}`, text: `Te queda 1 día (hasta el ${fmtDay(p.until)}). Renueva para seguir sin interrupciones.` };
  return { title: `Te quedan ${p.daysLeft} días de ${p.phase === "demo" ? "DEMO" : "tu plan"}`, text: `${p.phase === "demo" ? "Tu demo" : "Tu plan"} termina el ${fmtDay(p.until)}. Renueva a tiempo para no perder pedidos.` };
}

/** Avisos de demo/plan por vencer (3 días antes, día 14 y día 15) y bloqueo cuando ya venció. */
export function PlanGate({ business, children }: { business: Business; children: ReactNode }) {
  const pathname = usePathname();
  const { plan } = useSubscription(business);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    if (!plan || plan.phase === "vencido" || ![3, 1, 0].includes(plan.daysLeft)) return;
    const key = `aviso_plan_${business.id}`;
    const today = limaDate();
    try {
      if (localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
    } catch {}
    setModal(true); // eslint-disable-line react-hooks/set-state-in-effect
  }, [plan, business.id]);

  if (!plan) return <>{children}</>;

  const onPlanPage = pathname.startsWith("/panel/suscripcion");
  if (plan.phase === "vencido" && !onPlanPage) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <span className="rounded-full bg-rose-100 p-4 text-rose-700">
          <Lock className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-extrabold">{plan.demoEnd === plan.until ? "Terminó tu DEMO gratis" : "Terminó tu plan"}</h1>
        <p className="text-slate-600">
          Venció el {fmtDay(plan.until)}. Tus datos están a salvo, pero tus clientes no pueden pedirte hasta que renueves por 30 días.
        </p>
        <Link href="/panel/suscripcion?renovar=1" className="btn-gas w-full">
          Renovar ahora
        </Link>
        {plan.pending && <p className="text-sm font-semibold text-orange-700">Tu aviso de pago está por validar.</p>}
      </main>
    );
  }

  const show = plan.level !== "ok" && !onPlanPage;
  const msg = message(plan);
  const urgent = plan.level === "ultimo" || plan.level === "manana" || plan.level === "vencido";
  return (
    <>
      {show && (
        <Link
          href="/panel/suscripcion?renovar=1"
          className={`flex items-center gap-3 px-4 py-3 text-sm ${urgent ? "bg-rose-600 text-white" : "bg-orange-100 text-orange-900"}`}
        >
          <BellRing className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <b>{msg.title}.</b> {plan.pending ? "Tu pago está por validar." : msg.text}
          </span>
          <span className="shrink-0 font-bold underline">{plan.pending ? "Ver" : "Renovar"}</span>
        </Link>
      )}
      {children}
      <Sheet open={modal} onClose={() => setModal(false)} title={msg.title}>
        <div className="space-y-4">
          <p className="text-slate-600">{msg.text}</p>
          <Link href="/panel/suscripcion?renovar=1" onClick={() => setModal(false)} className="btn-gas w-full">
            Renovar ahora
          </Link>
          <button onClick={() => setModal(false)} className="btn-outline w-full">
            Recordarme después
          </button>
        </div>
      </Sheet>
    </>
  );
}
