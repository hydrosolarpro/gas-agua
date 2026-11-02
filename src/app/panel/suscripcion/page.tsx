"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { SUB_METHODS } from "@/components/admin-sheets";
import { usePanel } from "@/components/panel-context";
import { ProofPicker, ProofView, uploadProof } from "@/components/proof";
import { SupportCard } from "@/components/SupportCard";
import { Empty, ErrorText, FullLoader, Sheet, Spinner } from "@/components/ui";
import { useSubscription } from "@/components/useSubscription";
import { Wallet } from "@/components/icons";
import { errorMessage, money, waLink } from "@/lib/format";
import { PLAN_DAYS, addDays, daysLabel, fmtDateTime, fmtDay, inputToIso, limaDate, nowForInput } from "@/lib/plan";
import { supabaseBrowser } from "@/lib/supabase/client";

function CopyRow({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left active:scale-[0.99]"
    >
      <span className="min-w-0">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className="block truncate font-bold">{value}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-agua-700">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiado" : "Copiar"}
      </span>
    </button>
  );
}

const TONE = { validado: "bg-emerald-100 text-emerald-800", pendiente: "bg-orange-100 text-orange-800", rechazado: "bg-rose-100 text-rose-800" } as const;
const NAME = { validado: "Validado", pendiente: "Por validar", rechazado: "Rechazado" } as const;

type Tab = "plan" | "pagar" | "pagos" | "soporte";

export default function Suscripcion() {
  const { business } = usePanel();
  const { settings, payments, fee, plan, reload } = useSubscription(business);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(nowForInput());
  const [method, setMethod] = useState("yape");
  const [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attachId, setAttachId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (new URLSearchParams(location.search).get("renovar") && plan) {
      setAmount(String(fee)); // eslint-disable-line react-hooks/set-state-in-effect
      setPaidAt(nowForInput());
      setOpen(true);
    }
  }, [plan === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const TABS: { id: Tab; label: string }[] = [
    { id: "plan", label: "Mi plan" },
    { id: "pagar", label: "Dónde pagar" },
    { id: "pagos", label: "Mis pagos" },
    { id: "soporte", label: "Soporte" },
  ];
  const pane = (t: Tab) => (tab === t ? "block" : "hidden");

  if (!settings || !payments || !plan) return <FullLoader />;
  const hasData = [settings.yape_number, settings.plin_number, settings.bank_account, settings.bank_cci].some(Boolean);

  async function report() {
    const value = Number(amount);
    if (!(value > 0)) return setError("Escribe el monto que pagaste");
    if (!paidAt) return setError("Indica la fecha y hora de tu pago");
    setSaving(true);
    setError("");
    let proof: string | null = null;
    try {
      if (file) proof = await uploadProof("subs", business.id, file);
    } catch (err) {
      setSaving(false);
      return setError((err as Error).message);
    }
    const { error: e } = await supabaseBrowser().rpc("report_subscription_payment", {
      p_amount: value,
      p_paid_at: inputToIso(paidAt),
      p_method: method,
      p_code: code || null,
      p_proof: proof,
    });
    setSaving(false);
    if (e) return setError(errorMessage(e));
    setOpen(false);
    setCode("");
    setFile(null);
    await reload();
  }

  async function attach(paymentId: string, f: File | null) {
    if (!f) return;
    setAttachId(paymentId);
    setError("");
    try {
      const path = await uploadProof("subs", business.id, f);
      const { error: e } = await supabaseBrowser().rpc("attach_subscription_proof", { p_payment_id: paymentId, p_proof: path });
      if (e) throw new Error(errorMessage(e));
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
    setAttachId(null);
  }

  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-3 p-3 md:p-5">
      <h1 className="shrink-0 text-xl font-extrabold md:text-2xl">Mi plan</h1>

      <div className="flex shrink-0 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl px-2 py-2 text-sm font-bold transition ${tab === t.id ? "bg-white text-agua-700 shadow-sm" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">

      <section className={`card space-y-3 p-4 md:p-5 ${pane("plan")}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">
              {plan.phase === "demo" ? "DEMO gratis" : plan.phase === "pagado" ? "Plan pagado" : "Tu acceso"}
            </p>
            <p className="text-3xl font-extrabold">
              {money(fee)} <span className="text-base font-semibold text-slate-500">por {PLAN_DAYS} días</span>
            </p>
          </div>
          <span
            className={`chip ${plan.phase === "vencido" ? "bg-rose-100 text-rose-800" : plan.level === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"}`}
          >
            {plan.phase === "vencido" ? "Vencido" : daysLabel(plan.daysLeft)}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-center">
          <div>
            <dt className="text-xs text-slate-500">{plan.phase === "pagado" ? "Plan desde" : "Inicio del demo"}</dt>
            <dd className="font-extrabold">{fmtDay(plan.phase === "pagado" ? plan.from : plan.demoStart)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">{plan.phase === "pagado" ? "Vigente hasta" : plan.phase === "demo" ? "Fin del demo" : "Venció el"}</dt>
            <dd className="font-extrabold">{fmtDay(plan.phase === "pagado" ? plan.until : plan.phase === "demo" ? plan.demoEnd : plan.until)}</dd>
          </div>
        </dl>
        {plan.phase === "demo" && (
          <p className="rounded-2xl bg-sky-50 p-3 text-sm text-sky-900">
            Estás en tu <b>DEMO gratis de 15 días</b> para probar la app. Al terminar, pagas {money(fee)} y sigues 30 días continuos. Si pagas antes, no
            pierdes ningún día del demo.
          </p>
        )}
        {plan.phase === "vencido" && (
          <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">
            Tu acceso terminó. Paga a la cuenta de abajo y pulsa <b>“Renovar plan”</b>: al validar tu pago vuelves a recibir pedidos.
          </p>
        )}
        {plan.phase === "pagado" && plan.level !== "ok" && (
          <p className="rounded-2xl bg-orange-50 p-3 text-sm text-orange-900">Tu plan está por vencer. Renueva para continuar sin interrupciones.</p>
        )}
        {plan.pending && <p className="rounded-2xl bg-orange-50 p-3 text-sm text-orange-800">Recibimos tu aviso de pago. El administrador lo está revisando.</p>}
        <button
          onClick={() => {
            setAmount(String(fee));
            setPaidAt(nowForInput());
            setError("");
            setOpen(true);
          }}
          className="btn-gas w-full"
        >
          <Wallet className="h-5 w-5" /> {plan.phase === "demo" ? "Ya pagué" : "Renovar plan"}
        </button>
      </section>

      <section className={`card space-y-3 p-4 md:p-5 ${pane("pagar")}`}>
        <h2 className="font-bold">Dónde pagar</h2>
        {!hasData && <p className="text-sm text-slate-500">El administrador aún no publicó sus datos de pago. Escríbele por WhatsApp.</p>}
        <CopyRow label="Yape" value={settings.yape_number} />
        <CopyRow label="Plin" value={settings.plin_number} />
        <CopyRow label={`Cuenta ${settings.bank_name ?? "bancaria"}`} value={settings.bank_account} />
        <CopyRow label="CCI (interbancario)" value={settings.bank_cci} />
        {settings.account_holder && <p className="text-sm text-slate-600">Titular: <b>{settings.account_holder}</b></p>}
        {settings.admin_phone && (
          <a
            href={waLink(settings.admin_phone, `Hola, soy ${business.name}. Te escribo sobre mi pago de AguaGasExpress.`)}
            target="_blank"
            className="btn-outline w-full text-emerald-700"
          >
            <MessageCircle className="h-5 w-5" /> Escribir al administrador
          </a>
        )}
      </section>

      <div className={pane("soporte")}>
        <SupportCard />
      </div>

      <section className={`space-y-2 ${pane("pagos")}`}>
        <h2 className="font-bold">Mis pagos</h2>
        {payments.length === 0 && <Empty icon={<Wallet className="h-12 w-12 text-slate-300" />} title="Aún no registras pagos" />}
        {payments.map((p) => (
          <div key={p.id} className="card flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-bold">Pagó el {fmtDateTime(p.paid_at)}</p>
              <p className="text-sm capitalize text-slate-500">
                {p.method}
                {p.operation_code ? ` · Op. ${p.operation_code}` : ""}
              </p>
              {p.status === "validado" && p.valid_from && p.valid_to && (
                <p className="text-sm font-semibold text-emerald-700">
                  Vigente del {fmtDay(p.valid_from)} al {fmtDay(p.valid_to)}
                </p>
              )}
            </div>
            {p.proof_path ? (
              <ProofView path={p.proof_path} caption={`${fmtDateTime(p.paid_at)} · ${money(p.amount)}`} />
            ) : (
              p.status !== "validado" && (
                <label className="cursor-pointer text-xs font-bold text-agua-700">
                  {attachId === p.id ? "Subiendo…" : "Adjuntar comprobante"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => attach(p.id, e.target.files?.[0] ?? null)} />
                </label>
              )
            )}
            <div className="text-right">
              <p className="font-extrabold">{money(p.amount)}</p>
              <span className={`chip ${TONE[p.status]}`}>{NAME[p.status]}</span>
            </div>
          </div>
        ))}
      </section>

      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={plan.phase === "demo" ? "Avisar mi pago" : "Renovar mi plan"}>
        <div className="space-y-4">
          <div>
            <label className="label">Fecha y hora de tu pago</label>
            <input className="input" type="datetime-local" value={paidAt} max={nowForInput()} onChange={(e) => setPaidAt(e.target.value)} />
            {(() => {
              const day = paidAt ? paidAt.slice(0, 10) : limaDate();
              const from = day > addDays(plan.until, 1) ? day : addDays(plan.until, 1);
              return (
                <p className="mt-1.5 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  Al validarse, tu plan será del <b>{fmtDay(from)}</b> al <b>{fmtDay(addDays(from, PLAN_DAYS - 1))}</b> ({PLAN_DAYS} días).
                </p>
              );
            })()}
          </div>
          <div>
            <label className="label">Monto pagado (S/)</label>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <div>
            <label className="label">Cómo pagaste</label>
            <div className="grid grid-cols-3 gap-2">
              {SUB_METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`rounded-2xl border-2 px-2 py-2.5 text-sm font-bold transition ${method === m.id ? "border-agua-500 bg-agua-50 text-agua-700" : "border-slate-200"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Código de operación (opcional)</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. 4821937" />
          </div>
          <ProofPicker file={file} onChange={setFile} label="Captura o foto del pago (recomendado)" />
          <ErrorText>{error}</ErrorText>
          <button onClick={report} disabled={saving} className="btn-primary w-full">
            {saving && <Spinner className="h-5 w-5" />} Enviar aviso de pago
          </button>
        </div>
      </Sheet>
    </main>
  );
}
