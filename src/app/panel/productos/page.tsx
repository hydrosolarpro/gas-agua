"use client";

import { CategoryIcon, Package } from "@/components/icons";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Empty, ErrorText, FullLoader, Sheet, Spinner } from "@/components/ui";
import { CATEGORY, errorMessage, money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Category, Product } from "@/lib/types";
import { usePanel } from "@/components/panel-context";

type Draft = { id?: string; name: string; description: string; category: Category; price: string };
const EMPTY: Draft = { name: "", description: "", category: "gas", price: "" };

export default function ProductosPage() {
  const { business } = usePanel();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("products").select("*").eq("business_id", business.id).order("sort_order").order("created_at").returns<Product[]>();
    setProducts(data ?? []);
  }, [business.id]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  async function save() {
    if (!draft) return;
    const price = Number(draft.price);
    if (draft.name.trim().length < 2) return setError("Escribe el nombre del producto");
    if (!(price >= 0) || draft.price === "") return setError("Escribe un precio válido");
    setSaving(true);
    setError("");
    const row = { name: draft.name.trim(), description: draft.description.trim() || null, category: draft.category, price };
    const supabase = supabaseBrowser();
    const { error } = draft.id
      ? await supabase.from("products").update(row).eq("id", draft.id)
      : await supabase.from("products").insert({ ...row, business_id: business.id, sort_order: (products?.length ?? 0) + 1 });
    setSaving(false);
    if (error) return setError(errorMessage(error));
    setDraft(null);
    load();
  }

  async function toggle(p: Product) {
    await supabaseBrowser().from("products").update({ active: !p.active }).eq("id", p.id);
    load();
  }

  async function remove(p: Product) {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    const { error } = await supabaseBrowser().from("products").delete().eq("id", p.id);
    if (error) alert("No se pudo eliminar. Desactívalo en su lugar.");
    load();
  }

  if (!products) return <FullLoader />;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Productos y precios</h1>
        <button onClick={() => { setError(""); setDraft(EMPTY); }} className="btn-primary px-4 py-2.5 text-sm">
          <Plus className="h-4 w-4" /> Nuevo
        </button>
      </div>
      <p className="text-sm text-slate-600">Estos son los productos que ven tus clientes. Los precios de ejemplo son editables.</p>

      {products.length === 0 && <Empty icon={<Package className="h-12 w-12 text-slate-300" />} title="Aún no tienes productos" text="Agrega tu primer balón de gas o bidón de agua." />}
      <div className="space-y-3">
        {products.map((p) => (
          <div key={p.id} className={`card flex items-center gap-4 p-4 ${p.active ? "" : "opacity-60"}`}>
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${p.category === "gas" ? "bg-gas-50 text-gas-600" : "bg-agua-50 text-agua-600"}`}><CategoryIcon category={p.category} className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{p.name}</p>
              <p className="font-extrabold text-agua-700">{money(p.price)}</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <input type="checkbox" checked={p.active} onChange={() => toggle(p)} className="h-5 w-5 accent-teal-600" /> Activo
            </label>
            <button onClick={() => { setError(""); setDraft({ id: p.id, name: p.name, description: p.description ?? "", category: p.category, price: String(p.price) }); }} className="rounded-full bg-slate-100 p-2" aria-label="Editar">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => remove(p)} className="rounded-full bg-rose-50 p-2 text-rose-600" aria-label="Eliminar">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <Sheet open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? "Editar producto" : "Nuevo producto"}>
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(["gas", "agua", "otro"] as Category[]).map((c) => (
                <button key={c} onClick={() => setDraft({ ...draft, category: c })} className={`rounded-2xl border-2 p-3 font-bold ${draft.category === c ? "border-agua-500 bg-agua-50" : "border-slate-200"}`}>
                  <span className="inline-flex items-center justify-center gap-2"><CategoryIcon category={c} className="h-5 w-5" />{CATEGORY[c].label}</span>
                </button>
              ))}
            </div>
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej. Balón de gas 10 kg" />
            </div>
            <div>
              <label className="label">Descripción (opcional)</label>
              <input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Ej. Marca Solgas, incluye envase" />
            </div>
            <div>
              <label className="label">Precio (S/)</label>
              <input className="input" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^\d.]/g, "") })} placeholder="45.00" />
            </div>
            <ErrorText>{error}</ErrorText>
            <button onClick={save} disabled={saving} className="btn-primary w-full">
              {saving && <Spinner className="h-5 w-5" />} Guardar
            </button>
          </div>
        )}
      </Sheet>
    </main>
  );
}
