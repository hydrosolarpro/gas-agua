"use client";

import { Percent, Route, Wallet } from "lucide-react";
import { PAY_TYPES, type PayType } from "@/lib/pay";

const ICONS = { porcentaje: Percent, fijo: Wallet, distancia: Route } as const;

/** Tres botones grandes para elegir cómo se le paga al repartidor + el valor. */
export function PayPicker({ type, value, onType, onValue }: { type: PayType | ""; value: string; onType: (t: PayType) => void; onValue: (v: string) => void }) {
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
    </div>
  );
}
