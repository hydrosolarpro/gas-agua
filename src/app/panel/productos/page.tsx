"use client";

import { CategoryIcon, Package } from "@/components/icons";

import { useCallback, useEffect, useState } from "react";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Empty, ErrorText, FullLoader, Sheet, Spinner } from "@/components/ui";
import { CATEGORY, errorMessage, money } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Category, Product } from "@/lib/types";
import { usePanel } from "@/components/panel-context";

type Draft = { id?: string; name: string; description: string; category: Category; price: string; stock: string; cost: string };
const EMPTY: Draft = { name: "", description: "", category: "gas", price: "", stock: "", cost: "" };
const LOW_STOCK = 3;

export default function ProductosPage() {
  const { business } = usePanel();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("products").select("*").eq("business_id", business.id).order("sort_order").order("created_at").returns<Product[]>();
    setProducts(data ?? []);
    const { data: c } = await supabaseBrowser().from("product_costs").select("product_id, cost").eq("business_id", business.id).returns<{ product_id: string; cost: number }[]>();
    setCosts(Object.fromEntries((c ?? []).map((x) => [x.product_id, Number(x.cost)])));
  }, [business.id]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    // El stock baja solo cuando entran pedidos: se refresca cada pocos segundos.
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  async function save() {
    if (!draft) return;
    const price = Number(draft.price);
    if (draft.name.trim().length < 2) return setError("Escribe el nombre del producto");
    if (!(price >= 0) || draft.price === "") return setError("Escribe un precio válido");
    const stock = draft.stock.trim() === "" ? null : Math.floor(Number(draft.stock));
    if (stock !== null && !(stock >= 0)) return setError("El stock debe ser 0 o más (déjalo vacío si no lo controlas)");
    const cost = draft.cost.trim() === "" ? null : Number(draft.cost);
    if (cost !== null && !(cost >= 0 && cost <= 100000)) return setError("Escribe un costo válido (déjalo vacío si no quieres registrarlo)");
    setSaving(true);
    setError("");
    const row = { name: draft.name.trim(), description: draft.description.trim() || null, category: draft.category, price, stock };
    const supabase = supabaseBrowser();
    let productId = draft.id;
    let error;
    if (draft.id) ({ error } = await supabase.from("products").update(row).eq("id", draft.id));
    else {
      const res = await supabase.from("products").insert({ ...row, business_id: business.id, sort_order: (products?.length ?? 0) + 1 }).select("id").single();
      error = res.error;
      productId = res.data?.id;
    }
    if (!error && productId) ({ error } = await supabase.rpc("set_product_cost", { p_product_id: productId, p_cost: cost }));
    setSaving(false);
    if (error) return setError(errorMessage(error));
    setDraft(null);
    load();
  }

  async function adjustStock(p: Product, delta: number) {
    if (p.stock === null) return;
    const next = Math.max(0, p.stock + delta);
    setProducts((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, stock: next } : x)));
    await supabaseBrowser().from("products").update({ stock: next }).eq("id", p.id);
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
    <main className="mx-auto max-w-6xl space-y-3 p-3 md:p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold md:text-2xl">Mis productos</h1>
        <button onClick={() => { setError(""); setDraft(EMPTY); }} className="btn-primary px-4 py-2.5 text-sm">
          <Plus className="h-4 w-4" /> Nuevo
        </button>
      </div>
      <p className="text-sm text-slate-600">Estos son los productos que ven tus clientes. Con el stock, la tienda deja de vender lo que se agotó y se descuenta solo con cada pedido (si se cancela, vuelve).</p>

      {products.length === 0 && <Empty icon={<Package className="h-12 w-12 text-slate-300" />} title="Aún no tienes productos" text="Agrega tu primer balón de gas o bidón de agua." />}
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <div key={p.id} className={`card flex flex-wrap items-center gap-3 p-4 ${p.active ? "" : "opacity-60"}`}>
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${p.category === "gas" ? "bg-gas-50 text-gas-600" : "bg-agua-50 text-agua-600"}`}><CategoryIcon category={p.category} className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{p.name}</p>
              <p className="font-extrabold text-agua-700">{money(p.price)}</p>
              {costs[p.id] !== undefined ? (
                <p className="text-xs font-semibold text-slate-500">
                  Costo {money(costs[p.id])} · ganas <span className={p.price - costs[p.id] >= 0 ? "text-emerald-700" : "text-rose-600"}>{money(p.price - costs[p.id])}</span> por unidad
                </p>
              ) : (
                <p className="text-xs font-semibold text-amber-700">Sin costo: no se calcula tu ganancia</p>
              )}
            </div>
            <div className="flex w-full items-center gap-2 rounded-2xl bg-slate-50 p-2">
              {p.stock === null ? (
                <span className="px-2 text-sm text-slate-500">Sin control de stock</span>
              ) : (
                <>
                  <button onClick={() => adjustStock(p, -1)} className="rounded-full bg-white p-2 shadow-sm" aria-label="Restar uno al stock">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-8 text-center text-lg font-extrabold">{p.stock}</span>
                  <button onClick={() => adjustStock(p, 1)} className="rounded-full bg-agua-600 p-2 text-white shadow-sm" aria-label="Sumar uno al stock">
                    <Plus className="h-4 w-4" />
                  </button>
                  <button onClick={() => adjustStock(p, 10)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-agua-700 shadow-sm">
                    +10
                  </button>
                  {p.stock === 0 ? (
                    <span className="chip ml-auto bg-rose-100 text-rose-800">Agotado</span>
                  ) : p.stock <= LOW_STOCK ? (
                    <span className="chip ml-auto bg-orange-100 text-orange-800">Quedan {p.stock}</span>
                  ) : (
                    <span className="chip ml-auto bg-emerald-100 text-emerald-800">Disponible</span>
                  )}
                </>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <input type="checkbox" checked={p.active} onChange={() => toggle(p)} className="h-5 w-5 accent-teal-600" /> Activo
            </label>
            <button onClick={() => { setError(""); setDraft({ id: p.id, name: p.name, description: p.description ?? "", category: p.category, price: String(p.price), stock: p.stock === null ? "" : String(p.stock), cost: costs[p.id] === undefined ? "" : String(costs[p.id]) }); }} className="rounded-full bg-slate-100 p-2" aria-label="Editar">
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
            <div>
              <label className="label">Stock disponible (opcional)</label>
              <input className="input" inputMode="numeric" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value.replace(/\D/g, "") })} placeholder="Vacío = no controlar" />
              <p className="mt-1 text-xs text-slate-500">Cuántas unidades tienes hoy. Se descuenta con cada pedido y vuelve si lo cancelan.</p>
            </div>
            <div>
              <label className="label">¿Cuánto te cuesta? (S/, opcional)</label>
              <input className="input" inputMode="decimal" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value.replace(/[^\d.]/g, "") })} placeholder="Ej. 32.00" />
              <p className="mt-1 text-xs text-slate-500">Solo lo ves tú. Sirve para calcular tu ganancia bruta y neta en cada pedido.</p>
            </div>
            <ErrorText>{error}</ErrorText>
            <button onClick={save} disabled={saving} className="cta-primary">
              {saving && <Spinner className="h-5 w-5" />} Guardar
            </button>
          </div>
        )}
      </Sheet>
    </main>
  );
}
