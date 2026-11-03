"use client";

import { Copy } from "lucide-react";
import { DAY_KEYS, DAY_NAMES, type DayKey, type OpeningHours } from "@/lib/hours";

/** Un renglón por día: se enciende/apaga y se eligen hora de apertura y de cierre. */
export function HoursEditor({ value, onChange }: { value: OpeningHours; onChange: (h: OpeningHours) => void }) {
  const set = (k: DayKey, patch: Partial<{ abre: string; cierra: string }> | null) => {
    const next = { ...value };
    if (patch === null) delete next[k];
    else next[k] = { abre: "08:00", cierra: "20:00", ...next[k], ...patch };
    onChange(next);
  };
  const first = DAY_KEYS.find((k) => value[k]);

  return (
    <div className="space-y-2">
      {DAY_KEYS.map((k) => {
        const d = value[k];
        const bad = d && d.abre >= d.cierra;
        return (
          <div key={k} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border p-3 ${d ? "border-agua-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(d)}
              aria-label={`${DAY_NAMES[k]}: ${d ? "abierto" : "cerrado"}`}
              onClick={() => set(k, d ? null : {})}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${d ? "bg-agua-600" : "bg-slate-300"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${d ? "left-[22px]" : "left-0.5"}`} />
            </button>
            <span className="w-24 font-bold text-slate-800">{DAY_NAMES[k]}</span>
            {d ? (
              <div className="flex flex-1 items-center gap-2">
                <input type="time" aria-label={`${DAY_NAMES[k]} abre`} className="input !w-auto flex-1 !py-2" value={d.abre} onChange={(e) => set(k, { abre: e.target.value })} />
                <span className="text-slate-400">a</span>
                <input type="time" aria-label={`${DAY_NAMES[k]} cierra`} className="input !w-auto flex-1 !py-2" value={d.cierra} onChange={(e) => set(k, { cierra: e.target.value })} />
              </div>
            ) : (
              <span className="text-sm font-semibold text-slate-400">Cerrado</span>
            )}
            {bad && <p className="w-full text-xs font-semibold text-rose-600">La hora de cierre debe ser después de la de apertura.</p>}
          </div>
        );
      })}
      {first && (
        <button
          type="button"
          onClick={() => {
            const src = value[first]!;
            const next: OpeningHours = {};
            for (const k of DAY_KEYS) next[k] = { ...src };
            onChange(next);
          }}
          className="btn-ghost w-full justify-center text-sm font-bold"
        >
          <Copy className="h-4 w-4" /> Usar el horario de {DAY_NAMES[first].toLowerCase()} en todos los días
        </button>
      )}
    </div>
  );
}
