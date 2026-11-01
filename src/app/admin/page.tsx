"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAdmin, currentPeriod, feeFor, monthLabel, ownerStatus, type OwnerRow } from "@/components/admin-context";
import { RegisterPaymentSheet } from "@/components/admin-sheets";
import { Empty, ErrorText, FullLoader, Spinner } from "@/components/ui";
import { Store, CircleCheck } from "@/components/icons";
import { dateTime, errorMessage, money, waLink } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

function Kpi({ label, value, sub, tone = "text-ink" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function AdminResumen() {
  const { owners, payments, settings, reload, openInvite } = useAdmin();
  const [paying, setPaying] = useState<OwnerRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!owners) return <FullLoader />;

  const period = currentPeriod();
  const validated = payments.filter((p) => p.status === "validado");
  const total = validated.reduce((s, p) => s + Number(p.amount), 0);
  const thisMonth = validated.filter((p) => p.period === period).reduce((s, p) => s + Number(p.amount), 0);
  const expected = owners.reduce((s, o) => s + feeFor(o, settings), 0);
  const pending = payments.filter((p) => p.status === "pendiente");
  const pendingSum = pending.reduce((s, p) => s + Number(p.amount), 0);
  const unpaid = owners.filter((o) => ownerStatus(o.id, payments, period) === "pendiente");
  const ownerOf = (id: string) => owners.find((o) => o.id === id);

  async function review(id: string, valid: boolean) {
    setBusy(id + valid);
    setError("");
    const { error: e } = await supabaseBrowser().rpc("review_subscription_payment", { p_id: id, p_valid: valid });
    if (e) setError(errorMessage(e));
    await reload();
    setBusy(null);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <p className="text-slate-500 capitalize">{monthLabel(period)}</p>
        <h1 className="text-2xl font-extrabold">Resumen de la plataforma</h1>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Dueños activos" value={String(owners.length)} sub={`${unpaid.length} sin pagar este mes`} />
        <Kpi label="Cobrado este mes" value={money(thisMonth)} sub={`de ${money(expected)} esperados`} tone="text-agua-700" />
        <Kpi label="Total cobrado" value={money(total)} sub={`${validated.length} pagos validados`} tone="text-emerald-700" />
        <Kpi label="Por validar" value={money(pendingSum)} sub={`${pending.length} ${pending.length === 1 ? "pago" : "pagos"}`} tone="text-orange-600" />
      </section>

      <ErrorText>{error}</ErrorText>

      <section className="space-y-3">
        <h2 className="font-bold">Pagos por validar</h2>
        {pending.length === 0 && <p className="text-sm text-slate-500">No hay pagos esperando tu revisión.</p>}
        {pending.map((p) => (
          <div key={p.id} className="card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{ownerOf(p.business_id)?.name ?? "Negocio"}</p>
              <p className="text-sm text-slate-500">
                {monthLabel(p.period)} · {p.method}
                {p.operation_code ? ` · Op. ${p.operation_code}` : ""} · {dateTime(p.reported_at)}
              </p>
            </div>
            <p className="text-lg font-extrabold">{money(p.amount)}</p>
            <div className="flex gap-2">
              <button onClick={() => review(p.id, true)} disabled={busy !== null} className="btn-success px-4 py-2 text-sm">
                {busy === p.id + true ? <Spinner className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />} Validar
              </button>
              <button onClick={() => review(p.id, false)} disabled={busy !== null} className="btn-outline px-4 py-2 text-sm text-rose-600">
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">Sin pagar este mes</h2>
        {owners.length === 0 && (
          <Empty
            icon={<Store className="h-12 w-12 text-slate-300" />}
            title="Aún no tienes dueños"
            text="Invita al primero: recibirá un enlace para crear su negocio en un minuto."
            action={<button onClick={openInvite} className="btn-gas">Invitar dueño</button>}
          />
        )}
        {owners.length > 0 && unpaid.length === 0 && <p className="text-sm text-slate-500">Todos los dueños están al día.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {unpaid.map((o) => (
            <div key={o.id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{o.name}</p>
                <p className="truncate text-sm text-slate-500">
                  {o.owner?.full_name} · {o.owner?.phone}
                </p>
                <p className="mt-1 text-sm font-semibold text-rose-700">Debe {money(feeFor(o, settings))}</p>
              </div>
              {o.owner?.phone && (
                <a
                  href={waLink(o.owner.phone, `Hola ${o.owner.full_name}, te recordamos el pago de AguaGasExpress de ${monthLabel(period)} (${money(feeFor(o, settings))}). ¡Gracias!`)}
                  target="_blank"
                  className="rounded-full bg-emerald-50 p-2.5 text-emerald-700"
                  aria-label="Recordar por WhatsApp"
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
              )}
              <button onClick={() => setPaying(o)} className="btn-primary px-4 py-2 text-sm">
                Registrar pago
              </button>
            </div>
          ))}
        </div>
      </section>

      <RegisterPaymentSheet owner={paying} onClose={() => setPaying(null)} />
    </main>
  );
}
