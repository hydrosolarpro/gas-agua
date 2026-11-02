"use client";

import { useState } from "react";
import { CircleCheck, CircleX, Wallet } from "@/components/icons";
import { monthLabel, useAdmin } from "@/components/admin-context";
import { ProofView } from "@/components/proof";
import { Empty, ErrorText, FullLoader, Spinner } from "@/components/ui";
import { dateTime, errorMessage, money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SubscriptionPayment } from "@/lib/types";

type Filter = "pendiente" | "validado" | "rechazado" | "todos";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "pendiente", label: "Por validar" },
  { id: "validado", label: "Validados" },
  { id: "rechazado", label: "Rechazados" },
  { id: "todos", label: "Todos" },
];

const STATUS_TONE: Record<SubscriptionPayment["status"], string> = {
  pendiente: "bg-orange-100 text-orange-800",
  validado: "bg-emerald-100 text-emerald-800",
  rechazado: "bg-rose-100 text-rose-800",
};

export default function AdminPagos() {
  const { owners, payments, reload } = useAdmin();
  const [filter, setFilter] = useState<Filter>("pendiente");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!owners) return <FullLoader />;

  const list = payments.filter((p) => filter === "todos" || p.status === filter);
  const sum = list.reduce((s, p) => s + Number(p.amount), 0);
  const total = payments.filter((p) => p.status === "validado").reduce((s, p) => s + Number(p.amount), 0);
  const nameOf = (id: string) => owners.find((o) => o.id === id)?.name ?? "Negocio eliminado";

  async function review(id: string, valid: boolean) {
    setBusy(id + valid);
    setError("");
    const { error: e } = await supabaseBrowser().rpc("review_subscription_payment", { p_id: id, p_valid: valid });
    if (e) setError(errorMessage(e));
    await reload();
    setBusy(null);
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Pagos de los dueños</h1>
        <div className="text-right">
          <p className="text-xs font-semibold text-slate-500">Total cobrado (validado)</p>
          <p className="text-2xl font-extrabold text-emerald-700">{money(total)}</p>
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${filter === f.id ? "bg-agua-600 text-white shadow" : "bg-white text-slate-600"}`}
          >
            {f.label}{" "}
            <span className="opacity-70">{payments.filter((p) => f.id === "todos" || p.status === f.id).length}</span>
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>

      {list.length === 0 && <Empty icon={<Wallet className="h-12 w-12 text-slate-300" />} title="No hay pagos en esta lista" />}
      <div className="space-y-3">
        {list.map((p) => (
          <article key={p.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{nameOf(p.business_id)}</p>
                <span className={`chip ${STATUS_TONE[p.status]}`}>{p.status === "pendiente" ? "Por validar" : p.status === "validado" ? "Validado" : "Rechazado"}</span>
              </div>
              <p className="text-sm capitalize text-slate-500">
                {monthLabel(p.period)} · {p.method}
                {p.operation_code ? ` · Op. ${p.operation_code}` : ""}
              </p>
              <p className="text-xs text-slate-400">{dateTime(p.reported_at)}</p>
            </div>
            <ProofView path={p.proof_path} caption={`${nameOf(p.business_id)} · ${money(p.amount)}`} />
            <p className="text-lg font-extrabold">{money(p.amount)}</p>
            {p.status === "pendiente" && (
              <div className="flex gap-2">
                <button onClick={() => review(p.id, true)} disabled={busy !== null} className="btn-success px-4 py-2 text-sm">
                  {busy === p.id + true ? <Spinner className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />} Validar
                </button>
                <button onClick={() => review(p.id, false)} disabled={busy !== null} className="btn-outline px-4 py-2 text-sm text-rose-600">
                  <CircleX className="h-4 w-4" /> Rechazar
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {list.length > 0 && filter !== "todos" && (
        <p className="text-right text-sm font-semibold text-slate-600">Suma de esta lista: {money(sum)}</p>
      )}
    </main>
  );
}
