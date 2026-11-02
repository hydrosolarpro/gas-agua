"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { STATUS_LABEL, monthLabel } from "@/components/admin-context";
import { SUB_METHODS, periodOptions } from "@/components/admin-sheets";
import { usePanel } from "@/components/panel-context";
import { ProofPicker, ProofView, uploadProof } from "@/components/proof";
import { Empty, ErrorText, FullLoader, Sheet, Spinner } from "@/components/ui";
import { useSubscription } from "@/components/useSubscription";
import { Wallet } from "@/components/icons";
import { dateTime, errorMessage, money, waLink } from "@/lib/format";
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

export default function Suscripcion() {
  const { business } = usePanel();
  const { settings, payments, fee, period, status, reload } = useSubscription(business);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [forPeriod, setForPeriod] = useState(period);
  const [method, setMethod] = useState("yape");
  const [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [attachId, setAttachId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!settings || !payments || !status) return <FullLoader />;
  const st = STATUS_LABEL[status];
  const hasData = [settings.yape_number, settings.plin_number, settings.bank_account, settings.bank_cci].some(Boolean);

  async function report() {
    const value = Number(amount);
    if (!(value > 0)) return setError("Escribe el monto que pagaste");
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
      p_period: forPeriod,
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
    <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-8">
      <h1 className="text-2xl font-extrabold">Mi plan</h1>

      <section className="card space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500 capitalize">{monthLabel(period)}</p>
            <p className="text-3xl font-extrabold">
              {money(fee)} <span className="text-base font-semibold text-slate-500">al mes</span>
            </p>
          </div>
          <span className={`chip ${st.tone}`}>{st.label}</span>
        </div>
        {status === "pendiente" && (
          <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">
            Aún no registras tu pago de este mes. Paga a la cuenta de abajo y luego pulsa <b>“Ya pagué”</b>.
          </p>
        )}
        {status === "por_validar" && (
          <p className="rounded-2xl bg-orange-50 p-3 text-sm text-orange-800">Recibimos tu aviso de pago. El administrador lo está revisando.</p>
        )}
        {status === "al_dia" && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">¡Estás al día! Gracias por tu pago.</p>}
        <button
          onClick={() => {
            setAmount(String(fee));
            setForPeriod(period);
            setError("");
            setOpen(true);
          }}
          className="btn-gas w-full"
        >
          <Wallet className="h-5 w-5" /> Ya pagué
        </button>
      </section>

      <section className="card space-y-3 p-5">
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

      <section className="space-y-3">
        <h2 className="font-bold">Mis pagos</h2>
        {payments.length === 0 && <Empty icon={<Wallet className="h-12 w-12 text-slate-300" />} title="Aún no registras pagos" />}
        {payments.map((p) => (
          <div key={p.id} className="card flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-bold capitalize">{monthLabel(p.period)}</p>
              <p className="text-sm text-slate-500">
                {p.method}
                {p.operation_code ? ` · Op. ${p.operation_code}` : ""} · {dateTime(p.reported_at)}
              </p>
            </div>
            {p.proof_path ? (
              <ProofView path={p.proof_path} caption={`${monthLabel(p.period)} · ${money(p.amount)}`} />
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

      <Sheet open={open} onClose={() => setOpen(false)} title="Avisar mi pago">
        <div className="space-y-4">
          <div>
            <label className="label">Mes que pagas</label>
            <select className="input" value={forPeriod} onChange={(e) => setForPeriod(e.target.value)}>
              {periodOptions().map((p) => (
                <option key={p} value={p}>
                  {monthLabel(p)}
                </option>
              ))}
            </select>
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
