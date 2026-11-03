"use client";

import { useState } from "react";
import { MessageCircle, Search as SearchIcon, Trash2, UserPlus } from "lucide-react";
import { Store, Phone } from "@/components/icons";
import { feeFor, ownerPlan, planChip, useAdmin, type OwnerRow } from "@/components/admin-context";
import { fmtDay } from "@/lib/plan";
import { DeleteOwnerSheet, FeeSheet, RegisterPaymentSheet } from "@/components/admin-sheets";
import { Empty, ErrorText, FullLoader } from "@/components/ui";
import { dateTime, errorMessage, money, waLink } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AdminDuenos() {
  const { owners, payments, settings, invitations, reload, openInvite } = useAdmin();
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState<OwnerRow | null>(null);
  const [fee, setFee] = useState<OwnerRow | null>(null);
  const [removing, setRemoving] = useState<OwnerRow | null>(null);
  const [error, setError] = useState("");

  if (!owners) return <FullLoader />;

  const term = q.trim().toLowerCase();
  const list = owners.filter(
    (o) => !term || [o.name, o.owner?.full_name, o.owner?.phone].some((v) => (v ?? "").toLowerCase().includes(term)),
  );
  const open = invitations.filter((i) => !i.used_at && !i.revoked && new Date(i.expires_at) > new Date());

  async function revoke(id: string) {
    const { error: e } = await supabaseBrowser().rpc("admin_revoke_invitation", { p_id: id });
    if (e) setError(errorMessage(e));
    await reload();
  }

  return (
    <main className="mx-auto max-w-6xl space-y-3 p-3 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Dueños de negocio</h1>
        <button onClick={openInvite} className="btn-gas px-4 py-2.5 text-sm">
          <UserPlus className="h-4 w-4" /> Invitar dueño
        </button>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input className="input pl-12" placeholder="Buscar por negocio, nombre o celular" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorText>{error}</ErrorText>

      {owners.length === 0 && (
        <Empty
          icon={<Store className="h-12 w-12 text-slate-300" />}
          title="Aún no hay dueños registrados"
          text="Crea una invitación y compártela por WhatsApp."
          action={<button onClick={openInvite} className="btn-gas">Invitar dueño</button>}
        />
      )}
      {owners.length > 0 && list.length === 0 && <p className="text-sm text-slate-500">Ningún resultado para “{q}”.</p>}

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {list.map((o) => {
          const plan = ownerPlan(o, payments);
          const baja = Boolean(o.deactivated_at || o.owner?.deactivated_at);
          const st = baja ? { label: "Dado de baja", tone: "bg-slate-200 text-slate-700" } : planChip(plan);
          const ownerName = (o.owner?.full_name ?? "").replace(/ \(baja\)$/, "");
          const ownerPhone = o.owner?.phone ?? o.owner?.deactivated_phone ?? null;
          return (
            <article key={o.id} className={`card space-y-3 p-4 ${baja ? "bg-slate-50" : ""}`}>
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-agua-50 text-agua-700">
                  <Store className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{o.name}</p>
                  <p className="truncate text-sm text-slate-600">
                    {ownerName} · <Phone className="mr-0.5 inline h-3.5 w-3.5 -mt-0.5" />
                    {ownerPhone}
                  </p>
                  {baja && (
                    <p className="text-xs font-semibold text-rose-700">
                      El dueño se dio de baja el {dateTime((o.deactivated_at ?? o.owner?.deactivated_at)!)}. El negocio quedó inactivo y su historial se conserva.
                    </p>
                  )}
                  <p className={`text-xs text-slate-500 ${baja ? "hidden" : ""}`}>
                    {plan.phase === "demo" ? "Demo" : plan.phase === "pagado" ? "Plan pagado" : "Venció"} · {fmtDay(plan.phase === "vencido" ? plan.until : plan.from)} al {fmtDay(plan.phase === "pagado" ? plan.until : plan.phase === "vencido" ? plan.until : plan.to)}
                    {plan.pending && <span className="ml-1 font-semibold text-orange-700">· pago por validar</span>}
                  </p>
                  <p className="text-xs text-slate-400">Registrado el {dateTime(o.created_at)}</p>
                </div>
                <span className={`chip shrink-0 ${st.tone}`}>{st.label}</span>
              </div>

              <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center">
                <div>
                  <dt className="text-xs text-slate-500">Entregas</dt>
                  <dd className="font-extrabold">{o.orders_delivered}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Ventas validadas</dt>
                  <dd className="font-extrabold">{money(o.sales_validated)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Paga al mes</dt>
                  <dd className="font-extrabold">
                    {money(feeFor(o, settings))}
                    {o.fee_override != null && <span className="ml-1 text-[10px] font-semibold text-agua-700">propio</span>}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2">
                {!baja && (
                  <>
                    <button onClick={() => setPaying(o)} className="btn-primary px-4 py-2 text-sm">
                      Registrar pago
                    </button>
                    <button onClick={() => setFee(o)} className="btn-outline px-4 py-2 text-sm">
                      Cambiar monto
                    </button>
                  </>
                )}
                {!baja && o.owner?.phone && (
                  <a href={waLink(o.owner.phone, `Hola ${o.owner.full_name}, te escribimos de AguaGasExpress.`)} target="_blank" className="btn-outline px-4 py-2 text-sm text-emerald-700">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                )}
                <button onClick={() => setRemoving(o)} className="btn-outline ml-auto px-4 py-2 text-sm text-rose-600" aria-label={`Eliminar ${o.name}`}>
                  <Trash2 className="h-4 w-4" /> Eliminar
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">Invitaciones pendientes</h2>
          {open.map((i) => (
            <div key={i.id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.note ?? "Sin nombre"}</p>
                <p className="text-xs text-slate-500">Vence {dateTime(i.expires_at)}</p>
              </div>
              <button onClick={() => revoke(i.id)} className="btn-outline px-4 py-2 text-sm text-rose-600">
                Anular
              </button>
            </div>
          ))}
        </section>
      )}

      <RegisterPaymentSheet owner={paying} onClose={() => setPaying(null)} />
      <FeeSheet owner={fee} onClose={() => setFee(null)} />
      <DeleteOwnerSheet owner={removing} onClose={() => setRemoving(null)} />
    </main>
  );
}
