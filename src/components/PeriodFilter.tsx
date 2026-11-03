"use client";

import { useState } from "react";
import { ErrorText, Spinner } from "@/components/ui";
import { limaDate } from "@/lib/plan";
import { RANGE_MODES, resolveRange, type Range, type RangeMode } from "@/lib/stats";

/** Mismo filtro que usa el dueño: un día, rango de días, mes, rango de meses, año o rango de años. */
export function PeriodFilter({ firstDate, loading, onApply, actionLabel = "Ver" }: { firstDate: string; loading: boolean; onApply: (r: Range) => void; actionLabel?: string }) {
  const today = limaDate();
  const [mode, setMode] = useState<RangeMode>("mes");
  const [a, setA] = useState(today.slice(0, 7));
  const [b, setB] = useState(today.slice(0, 7));
  const [error, setError] = useState("");

  const year = Number(today.slice(0, 4));
  const firstYear = Number(limaDate(firstDate).slice(0, 4));
  const years = Array.from({ length: Math.max(1, year - firstYear + 1) }, (_, i) => String(year - i));

  function pick(next: RangeMode) {
    setMode(next);
    const v = next === "dia" || next === "rango_dias" ? today : next === "mes" || next === "rango_meses" ? today.slice(0, 7) : today.slice(0, 4);
    setA(v);
    setB(v);
  }

  function apply() {
    const r = resolveRange(mode, a, b);
    if (typeof r === "string") return setError(r);
    setError("");
    onApply(r);
  }

  const two = mode === "rango_dias" || mode === "rango_meses" || mode === "rango_anios";
  const inputType = mode === "dia" || mode === "rango_dias" ? "date" : mode === "mes" || mode === "rango_meses" ? "month" : "year";
  const field = (value: string, set: (v: string) => void, label: string) => (
    <div className="min-w-0 flex-1">
      <label className="label">{label}</label>
      {inputType === "year" ? (
        <select className="input" value={value} onChange={(e) => set(e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      ) : (
        <input className="input" type={inputType} value={value} max={inputType === "date" ? today : today.slice(0, 7)} onChange={(e) => set(e.target.value)} />
      )}
    </div>
  );

  return (
    <section className="card space-y-3 p-3 md:p-4">
      <select className="input !py-2.5 md:hidden" value={mode} onChange={(e) => pick(e.target.value as RangeMode)} aria-label="Tipo de período">
        {RANGE_MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <div className="hidden flex-wrap gap-1.5 md:flex">
        {RANGE_MODES.map((m) => (
          <button key={m.id} onClick={() => pick(m.id)} className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${mode === m.id ? "bg-agua-600 text-white shadow" : "bg-slate-100 text-slate-600"}`}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        {field(a, setA, two ? "Desde" : mode === "dia" ? "Fecha" : mode === "mes" ? "Mes" : "Año")}
        {two && field(b, setB, "Hasta")}
      </div>
      <ErrorText>{error}</ErrorText>
      <button onClick={apply} disabled={loading} className="btn-primary w-full !py-2.5 text-sm">
        {loading && <Spinner className="h-4 w-4" />} {actionLabel}
      </button>
    </section>
  );
}
