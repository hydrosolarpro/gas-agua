"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ProofPickerMulti, ProofView, uploadProofs } from "@/components/proof";
import { ErrorText, Sheet, Spinner } from "@/components/ui";
import { dateTime, errorMessage, money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Order, OrderProof } from "@/lib/types";

type Concept = OrderProof["concept"];
const CONCEPT_NAME: Record<Concept, string> = { gas: "Gas", agua: "Agua", otro: "Pedido completo" };
const METHODS: { id: OrderProof["method"]; label: string }[] = [
  { id: "yape", label: "Yape" },
  { id: "plin", label: "Plin" },
  { id: "transferencia", label: "Transferencia" },
  { id: "otro", label: "Otro" },
];

function useProofs(orderId: string) {
  const [proofs, setProofs] = useState<OrderProof[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("order_proofs")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at")
      .returns<OrderProof[]>();
    setProofs(data ?? []);
  }, [orderId]);
  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);
  return { proofs, reload: load };
}

/** Lo que vale el pedido por concepto (gas, agua…), según sus productos. */
function conceptTotals(order: Order): Partial<Record<Concept, number>> {
  const t: Partial<Record<Concept, number>> = {};
  for (const i of order.order_items ?? []) t[i.category] = (t[i.category] ?? 0) + Number(i.unit_price) * i.quantity;
  return t;
}

function ProofList({ proofs, order }: { proofs: OrderProof[]; order: Order }) {
  const totals = conceptTotals(order);
  const concepts = (Object.keys(CONCEPT_NAME) as Concept[]).filter((c) => totals[c] !== undefined || proofs.some((p) => p.concept === c));
  return (
    <div className="space-y-3">
      {concepts.map((c) => {
        const mine = proofs.filter((p) => p.concept === c);
        const paid = mine.reduce((s, p) => s + Number(p.amount), 0);
        return (
          <div key={c} className="space-y-2 rounded-2xl bg-slate-50 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-bold">{CONCEPT_NAME[c]}</p>
              <p className="text-sm text-slate-600">
                {totals[c] !== undefined && <>Pedido {money(totals[c]!)} · </>}
                <span className={paid > 0 ? "font-bold text-emerald-700" : ""}>Informado {money(paid)}</span>
              </p>
            </div>
            {mine.length === 0 && <p className="text-sm text-slate-500">Aún sin comprobante.</p>}
            {mine.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {[p.proof_path, ...(p.extra_paths ?? [])].map((path) => (
                    <ProofView key={path} path={path} caption={`${CONCEPT_NAME[c]} · ${money(p.amount)}`} />
                  ))}
                </div>
                <div className="min-w-0 text-sm">
                  <p className="font-bold">{money(p.amount)}</p>
                  <p className="text-slate-500 capitalize">
                    {p.method}
                    {p.operation_code ? ` · Op. ${p.operation_code}` : ""}
                  </p>
                  <p className="text-xs text-slate-400">{dateTime(p.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** El dueño ve los comprobantes que subió el cliente, separados por concepto. */
export function OrderProofsOwner({ order }: { order: Order }) {
  const { proofs } = useProofs(order.id);
  if (!proofs || proofs.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-bold">Comprobantes del cliente</h3>
      <ProofList proofs={proofs} order={order} />
    </section>
  );
}

/** El cliente agrega sus comprobantes de pago, uno por concepto (gas, agua). */
export function OrderProofsClient({ order }: { order: Order }) {
  const { proofs, reload } = useProofs(order.id);
  const totals = useMemo(() => conceptTotals(order), [order]);
  const concepts = (Object.keys(CONCEPT_NAME) as Concept[]).filter((c) => totals[c] !== undefined);
  const [open, setOpen] = useState(false);
  const [concept, setConcept] = useState<Concept>(concepts[0] ?? "otro");
  const [method, setMethod] = useState<OrderProof["method"]>(order.payment_method === "plin" ? "plin" : "yape");
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!proofs) return null;
  const locked = order.status === "cancelado" || order.payment_status === "validado";

  function openFor(c: Concept) {
    const paid = proofs!.filter((p) => p.concept === c).reduce((s, p) => s + Number(p.amount), 0);
    const left = Math.max(0, (totals[c] ?? 0) - paid);
    setConcept(c);
    setAmount(left > 0 ? String(left) : "");
    setCode("");
    setFiles([]);
    setError("");
    setOpen(true);
  }

  async function save() {
    const value = Number(amount);
    if (!(value > 0)) return setError("Escribe el monto que pagaste");
    if (files.length === 0) return setError("Sube la captura o foto de tu pago");
    setSaving(true);
    setError("");
    try {
      const [first, ...rest] = await uploadProofs("orders", order.id, files);
      const { error: e } = await supabaseBrowser().rpc("add_order_proof", {
        p_order_id: order.id,
        p_concept: concept,
        p_amount: value,
        p_method: method,
        p_code: code || null,
        p_proof: first,
        p_extra: rest,
      });
      if (e) throw new Error(errorMessage(e));
      setOpen(false);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving(false);
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">Mis comprobantes de pago</h2>
      </div>
      <p className="text-sm text-slate-600">
        Si ya pagaste por Yape, Plin o transferencia, sube la captura. Puedes enviar una por el gas y otra por el agua.
      </p>
      {proofs.length > 0 && <ProofList proofs={proofs} order={order} />}
      {!locked && (
        <div className="flex flex-wrap gap-2">
          {concepts.map((c) => (
            <button key={c} onClick={() => openFor(c)} className="btn-outline px-4 py-2.5 text-sm">
              <Plus className="h-4 w-4" /> Pago de {CONCEPT_NAME[c].toLowerCase()}
              {totals[c] !== undefined && <span className="text-slate-500">({money(totals[c]!)})</span>}
            </button>
          ))}
        </div>
      )}
      {locked && order.payment_status === "validado" && <p className="text-sm font-semibold text-emerald-700">El negocio ya validó tu pago.</p>}

      <Sheet open={open} onClose={() => setOpen(false)} title={`Pago de ${CONCEPT_NAME[concept].toLowerCase()}`}>
        <div className="space-y-4">
          {concepts.length > 1 && (
            <div>
              <label className="label">Concepto</label>
              <div className="grid grid-cols-2 gap-2">
                {concepts.map((c) => (
                  <button
                    key={c}
                    onClick={() => openFor(c)}
                    className={`rounded-2xl border-2 px-2 py-2.5 text-sm font-bold transition ${concept === c ? "border-agua-500 bg-agua-50 text-agua-700" : "border-slate-200"}`}
                  >
                    {CONCEPT_NAME[c]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="label">Con qué pagaste</label>
            <div className="grid grid-cols-4 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`rounded-2xl border-2 px-1 py-2.5 text-xs font-bold transition ${method === m.id ? "border-agua-500 bg-agua-50 text-agua-700" : "border-slate-200"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Monto pagado (S/)</label>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <div>
            <label className="label">Código de operación (opcional)</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. 4821937" />
          </div>
          <ProofPickerMulti files={files} onChange={setFiles} />
          <ErrorText>{error}</ErrorText>
          <button onClick={save} disabled={saving} className="btn-primary w-full">
            {saving && <Spinner className="h-5 w-5" />} Enviar comprobante
          </button>
        </div>
      </Sheet>
    </section>
  );
}
