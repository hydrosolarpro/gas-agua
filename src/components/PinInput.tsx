"use client";

import { Delete } from "lucide-react";

/** PIN de 4 dígitos con teclado numérico grande (cómodo en celular y PC). */
export function PinInput({
  value,
  onChange,
  onComplete,
  label = "PIN de 4 dígitos",
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  label?: string;
}) {
  const press = (d: string) => {
    if (value.length >= 4) return;
    const next = value + d;
    onChange(next);
    if (next.length === 4) onComplete?.(next);
  };

  return (
    <div>
      <p className="label text-center">{label}</p>
      <div
        className="mb-4 flex justify-center gap-3"
        tabIndex={0}
        onKeyDown={(e) => {
          if (/^\d$/.test(e.key)) press(e.key);
          if (e.key === "Backspace") onChange(value.slice(0, -1));
        }}
        aria-label={label}
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`flex h-14 w-12 items-center justify-center rounded-2xl border-2 text-2xl font-bold transition ${
              value.length > i ? "border-agua-500 bg-agua-50 text-agua-700" : "border-slate-200 bg-white"
            }`}
          >
            {value.length > i ? "●" : ""}
          </span>
        ))}
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="btn-ghost h-14 text-xl">
            {d}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press("0")} className="btn-ghost h-14 text-xl">
          0
        </button>
        <button
          type="button"
          onClick={() => onChange(value.slice(0, -1))}
          className="btn h-14 text-slate-500 hover:bg-slate-100"
          aria-label="Borrar"
        >
          <Delete className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

/** Celular peruano: 9 dígitos que empiezan con 9. */
export function PhoneInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3.5 font-semibold text-slate-600">+51</span>
      <input
        className="input"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="987 654 321"
        maxLength={9}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 9))}
      />
    </div>
  );
}
