"use client";

import { useState } from "react";
import { useAdmin } from "@/components/admin-context";
import { PhoneInput } from "@/components/PinInput";
import { ErrorText, FullLoader, Spinner } from "@/components/ui";
import { errorMessage, money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { PlatformSettings } from "@/lib/types";

type Form = Record<keyof PlatformSettings, string>;

const toForm = (s: PlatformSettings | null): Form => ({
  admin_name: s?.admin_name ?? "",
  admin_email: s?.admin_email ?? "",
  admin_phone: s?.admin_phone ?? "",
  account_holder: s?.account_holder ?? "",
  bank_name: s?.bank_name ?? "",
  bank_account: s?.bank_account ?? "",
  bank_cci: s?.bank_cci ?? "",
  yape_number: s?.yape_number ?? "",
  plin_number: s?.plin_number ?? "",
  monthly_fee: String(s?.monthly_fee ?? 79),
});

export default function AdminCobros() {
  const { settings, owners, reload } = useAdmin();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  if (!settings || !owners) return <FullLoader />;
  const f = form ?? toForm(settings);
  const set = (k: keyof Form, v: string) => setForm({ ...f, [k]: v });
  const digits = (v: string) => v.replace(/\D/g, "");

  async function save() {
    const fee = Number(f.monthly_fee);
    if (!(fee >= 0) || f.monthly_fee === "") return setError("Escribe un monto mensual válido");
    if (f.admin_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.admin_email.trim())) return setError("El correo no parece válido");
    setSaving(true);
    setError("");
    setMsg("");
    const orNull = (v: string) => (v.trim() === "" ? null : v.trim());
    const { error: e } = await supabaseBrowser()
      .from("platform_settings")
      .update({
        admin_name: orNull(f.admin_name),
        admin_email: orNull(f.admin_email),
        admin_phone: orNull(f.admin_phone),
        account_holder: orNull(f.account_holder),
        bank_name: orNull(f.bank_name),
        bank_account: orNull(f.bank_account),
        bank_cci: orNull(f.bank_cci),
        yape_number: orNull(f.yape_number),
        plin_number: orNull(f.plin_number),
        monthly_fee: fee,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setSaving(false);
    if (e) return setError(errorMessage(e));
    setMsg("¡Guardado! Los dueños ya ven estos datos en su sección Plan.");
    setForm(null);
    await reload();
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-extrabold">Mis datos de cobro</h1>
        <p className="text-slate-600">Lo que completes aquí lo ven los dueños de negocio para hacerte sus pagos.</p>
      </div>

      <section className="card space-y-4 p-5">
        <h2 className="font-bold">Monto mensual por usar la app</h2>
        <div>
          <label className="label">Monto general por negocio (S/ al mes)</label>
          <input className="input" inputMode="decimal" value={f.monthly_fee} onChange={(e) => set("monthly_fee", e.target.value.replace(/[^\d.]/g, ""))} />
          <p className="mt-1 text-xs text-slate-500">
            {owners.length} {owners.length === 1 ? "negocio" : "negocios"} · ingreso mensual esperado:{" "}
            <b>{money(owners.reduce((s, o) => s + Number(o.fee_override ?? Number(f.monthly_fee || 0)), 0))}</b>. Puedes fijar un monto distinto a cada negocio en la sección Dueños.
          </p>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-bold">Cuenta bancaria</h2>
        <div>
          <label className="label">Titular de la cuenta</label>
          <input className="input" value={f.account_holder} onChange={(e) => set("account_holder", e.target.value)} placeholder="Nombre completo del titular" />
        </div>
        <div>
          <label className="label">Banco</label>
          <input className="input" value={f.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="Ej. BCP, Interbank, BBVA" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Número de cuenta</label>
            <input className="input" inputMode="numeric" value={f.bank_account} onChange={(e) => set("bank_account", digits(e.target.value))} />
          </div>
          <div>
            <label className="label">CCI (interbancario)</label>
            <input className="input" inputMode="numeric" value={f.bank_cci} onChange={(e) => set("bank_cci", digits(e.target.value))} />
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-bold">Yape y Plin</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Número Yape</label>
            <input className="input" inputMode="numeric" maxLength={9} value={f.yape_number} onChange={(e) => set("yape_number", digits(e.target.value).slice(0, 9))} />
          </div>
          <div>
            <label className="label">Número Plin</label>
            <input className="input" inputMode="numeric" maxLength={9} value={f.plin_number} onChange={(e) => set("plin_number", digits(e.target.value).slice(0, 9))} />
          </div>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-bold">Contacto del administrador</h2>
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={f.admin_name} onChange={(e) => set("admin_name", e.target.value)} />
        </div>
        <div>
          <label className="label">Correo</label>
          <input className="input" type="email" inputMode="email" value={f.admin_email} onChange={(e) => set("admin_email", e.target.value)} placeholder="correo@gmail.com" />
        </div>
        <div>
          <label className="label">Celular / WhatsApp</label>
          <PhoneInput value={f.admin_phone} onChange={(v) => set("admin_phone", v)} />
        </div>
      </section>

      <ErrorText>{error}</ErrorText>
      {msg && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{msg}</p>}
      <button onClick={save} disabled={saving} className="btn-primary w-full">
        {saving && <Spinner className="h-5 w-5" />} Guardar datos de cobro
      </button>
    </main>
  );
}
