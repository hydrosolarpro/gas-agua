"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { ErrorText, Sheet, Spinner } from "@/components/ui";
import { currentPeriod, monthLabel, useAdmin, type OwnerRow, feeFor } from "@/components/admin-context";
import { errorMessage, money, waLink } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

export const SUB_METHODS = [
  { id: "yape", label: "Yape" },
  { id: "plin", label: "Plin" },
  { id: "transferencia", label: "Transferencia" },
  { id: "deposito", label: "Depósito" },
  { id: "efectivo", label: "Efectivo" },
] as const;

/** Últimos 3 meses y el siguiente, para elegir qué mes se está pagando. */
export function periodOptions() {
  const now = new Date();
  return [-2, -1, 0, 1].map((d) => currentPeriod(new Date(now.getFullYear(), now.getMonth() + d, 1)));
}

/** El administrador registra un pago recibido (queda validado al instante). */
export function RegisterPaymentSheet({ owner, onClose }: { owner: OwnerRow | null; onClose: () => void }) {
  const { settings, reload } = useAdmin();
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [method, setMethod] = useState<string>("yape");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastOwner, setLastOwner] = useState<string | null>(null);

  if (owner && owner.id !== lastOwner) {
    setLastOwner(owner.id);
    setAmount(String(feeFor(owner, settings)));
    setCode("");
    setError("");
  }

  async function save() {
    if (!owner) return;
    const value = Number(amount);
    if (!(value > 0)) return setError("Escribe un monto mayor a cero");
    setSaving(true);
    setError("");
    const { error: e } = await supabaseBrowser().rpc("admin_register_payment", {
      p_business_id: owner.id,
      p_amount: value,
      p_period: period,
      p_method: method,
      p_code: code || null,
    });
    setSaving(false);
    if (e) return setError(errorMessage(e));
    await reload();
    onClose();
  }

  return (
    <Sheet open={Boolean(owner)} onClose={onClose} title="Registrar pago recibido">
      {owner && (
        <div className="space-y-4">
          <p className="text-slate-600">
            <b>{owner.name}</b> · {owner.owner?.full_name}
          </p>
          <div>
            <label className="label">Mes que paga</label>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {periodOptions().map((p) => (
                <option key={p} value={p}>
                  {monthLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Monto (S/)</label>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <div>
            <label className="label">Cómo pagó</label>
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
          <ErrorText>{error}</ErrorText>
          <button onClick={save} disabled={saving} className="btn-success w-full">
            {saving && <Spinner className="h-5 w-5" />} Guardar pago validado
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Monto mensual propio de un negocio (vacío = usa el monto general). */
export function FeeSheet({ owner, onClose }: { owner: OwnerRow | null; onClose: () => void }) {
  const { settings, reload } = useAdmin();
  const [fee, setFee] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastOwner, setLastOwner] = useState<string | null>(null);

  if (owner && owner.id !== lastOwner) {
    setLastOwner(owner.id);
    setFee(owner.fee_override == null ? "" : String(owner.fee_override));
    setError("");
  }

  async function save() {
    if (!owner) return;
    const value = fee.trim() === "" ? null : Number(fee);
    if (value !== null && !(value >= 0)) return setError("Monto inválido");
    setSaving(true);
    const { error: e } = await supabaseBrowser().rpc("admin_set_fee", { p_business_id: owner.id, p_fee: value });
    setSaving(false);
    if (e) return setError(errorMessage(e));
    await reload();
    onClose();
  }

  return (
    <Sheet open={Boolean(owner)} onClose={onClose} title="Monto mensual del negocio">
      {owner && (
        <div className="space-y-4">
          <p className="text-slate-600">
            <b>{owner.name}</b>
          </p>
          <div>
            <label className="label">Monto mensual propio (S/)</label>
            <input
              className="input"
              inputMode="decimal"
              value={fee}
              placeholder={`Vacío = monto general (${money(settings?.monthly_fee)})`}
              onChange={(e) => setFee(e.target.value.replace(/[^\d.]/g, ""))}
            />
            <p className="mt-1 text-xs text-slate-500">Úsalo para dar un descuento o un precio especial a este negocio.</p>
          </div>
          <ErrorText>{error}</ErrorText>
          <button onClick={save} disabled={saving} className="btn-primary w-full">
            {saving && <Spinner className="h-5 w-5" />} Guardar monto
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Eliminar la cuenta de un dueño: exige escribir el nombre del negocio. */
export function DeleteOwnerSheet({ owner, onClose }: { owner: OwnerRow | null; onClose: () => void }) {
  const { reload } = useAdmin();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastOwner, setLastOwner] = useState<string | null>(null);

  if (owner && owner.id !== lastOwner) {
    setLastOwner(owner.id);
    setName("");
    setError("");
  }

  async function remove() {
    if (!owner) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/owners", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: owner.id, confirmName: name }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "No se pudo eliminar");
    await reload();
    onClose();
  }

  return (
    <Sheet open={Boolean(owner)} onClose={onClose} title="Eliminar cuenta de dueño">
      {owner && (
        <div className="space-y-4">
          <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
            Se borrará <b>para siempre</b> la cuenta de <b>{owner.owner?.full_name}</b>, el negocio <b>{owner.name}</b>, sus productos,
            pedidos, pagos y las cuentas de sus repartidores. No se puede deshacer.
          </p>
          <div>
            <label className="label">Para confirmar, escribe el nombre del negocio</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={owner.name} />
          </div>
          <ErrorText>{error}</ErrorText>
          <button
            onClick={remove}
            disabled={busy || name.trim().toLowerCase() !== owner.name.trim().toLowerCase()}
            className="btn w-full bg-rose-600 text-white hover:bg-rose-700"
          >
            {busy && <Spinner className="h-5 w-5" />} Eliminar definitivamente
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Crear un enlace de invitación para un nuevo dueño y compartirlo. */
export function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reload } = useAdmin();
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    setError("");
    const { data, error: e } = await supabaseBrowser().rpc("admin_create_invitation", { p_note: note || null, p_days: days });
    setBusy(false);
    if (e) return setError(errorMessage(e));
    setLink(`${location.origin}/invitacion/${data as string}`);
    reload();
  }

  function close() {
    setLink("");
    setNote("");
    setCopied(false);
    setError("");
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title="Invitar a un dueño de negocio">
      {!link ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Crea un enlace personal. Quien lo abra verá la página de bienvenida y podrá registrar su negocio al instante.
          </p>
          <div>
            <label className="label">¿A quién invitas? (opcional)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Juan Pérez, Distribuidora El Sol" />
          </div>
          <div>
            <label className="label">El enlace vale por</label>
            <div className="grid grid-cols-3 gap-2">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`rounded-2xl border-2 px-2 py-2.5 text-sm font-bold transition ${days === d ? "border-agua-500 bg-agua-50 text-agua-700" : "border-slate-200"}`}
                >
                  {d} días
                </button>
              ))}
            </div>
          </div>
          <ErrorText>{error}</ErrorText>
          <button onClick={create} disabled={busy} className="btn-primary w-full">
            {busy && <Spinner className="h-5 w-5" />} Crear enlace de invitación
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
            Enlace listo. <b>Cópialo ahora</b>: por seguridad no se vuelve a mostrar.
          </p>
          <div className="break-all rounded-2xl bg-slate-50 p-3 text-sm font-semibold">{link}</div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(link);
                setCopied(true);
              }}
              className="btn-ghost text-sm"
            >
              <Copy className="h-4 w-4" /> {copied ? "¡Copiado!" : "Copiar"}
            </button>
            <a href={waLink("", `Te invito a usar AguaGasExpress para gestionar tu negocio de gas y agua. Crea tu cuenta aquí: ${link}`)} target="_blank" className="btn-success text-sm">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
          <button onClick={close} className="btn-outline w-full">
            Listo
          </button>
        </div>
      )}
    </Sheet>
  );
}
