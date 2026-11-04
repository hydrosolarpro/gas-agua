"use client";

import { Check, Percent, Route, Wallet } from "lucide-react";
import { PAY_TYPES, type PayType } from "@/lib/pay";

const ICONS = { porcentaje: Percent, fijo: Wallet, distancia: Route } as const;

/** Tres botones grandes para elegir cómo se le paga al repartidor + el valor. */
export type PayProduct = { id: string; name: string; price: number };

export function PayPicker({
  type,
  value,
  onType,
  onValue,
  products = [],
  selected = [],
  onSelected,
}: {
  type: PayType | "";
  value: string;
  onType: (t: PayType) => void;
  onValue: (v: string) => void;
  /** Productos de «Mis productos» sobre los que se puede aplicar el pago. */
  products?: PayProduct[];
  /** Productos elegidos; vacío = el pago se calcula sobre todos. */
  selected?: string[];
  onSelected?: (ids: string[]) => void;
}) {
  const sel = PAY_TYPES.find((p) => p.id === type);
  const num = Number(value);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {PAY_TYPES.map((p) => {
          const Icon = ICONS[p.id];
          const on = p.id === type;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onType(p.id)}
              aria-pressed={on}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-center text-sm font-bold leading-tight transition active:scale-[0.98] ${on ? "border-agua-600 bg-agua-50 text-agua-800" : "border-slate-200 bg-white text-slate-600"}`}
            >
              <Icon className="h-6 w-6" />
              {p.title}
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
          <p className="text-sm text-slate-600">{sel.hint}</p>
          <label className="label">{sel.id === "porcentaje" ? "Porcentaje (%)" : sel.id === "fijo" ? "Monto por pedido (S/)" : "Tarifa por kilómetro (S/)"}</label>
          <input
            className="input"
            inputMode="decimal"
            value={value}
            onChange={(e) => onValue(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
            placeholder={sel.id === "porcentaje" ? "Ej. 10" : sel.id === "fijo" ? "Ej. 3.50" : "Ej. 1.50"}
          />
          {Number.isFinite(num) && num > 0 && <p className="text-sm font-semibold text-agua-700">{sel.example(num)}</p>}
        </div>
      )}
      {sel && onSelected && products.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
          <p className="label !mb-0">¿Sobre qué productos se aplica?</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Productos del pago">
            {[
              { all: true, label: "Todos los productos" },
              { all: false, label: "Solo algunos" },
            ].map((o) => {
              const on = o.all ? selected.length === 0 : selected.length > 0;
              return (
                <button
                  key={o.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onSelected(o.all ? [] : selected.length ? selected : [products[0].id])}
                  className={`min-h-11 rounded-2xl border-2 px-2 py-2 text-sm font-bold transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] ${on ? "border-agua-600 bg-agua-50 text-agua-800" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <ul className="space-y-1.5">
              {products.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onSelected(on ? selected.filter((x) => x !== p.id) : [...selected, p.id])}
                      className={`flex min-h-12 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.99] ${on ? "border-agua-600 bg-white" : "border-slate-200 bg-white"}`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${on ? "border-agua-600 bg-agua-600 text-white" : "border-slate-300"}`}>{on && <Check className="h-4 w-4" />}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                      <span className="shrink-0 text-sm text-slate-500">S/ {Number(p.price).toFixed(2)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-slate-500">
            {selected.length === 0
              ? "El pago se calcula sobre todo lo que lleve el pedido."
              : "Solo cuentan los productos marcados. Un pedido sin ninguno de ellos no paga al repartidor."}
          </p>
        </div>
      )}
    </div>
  );
}
