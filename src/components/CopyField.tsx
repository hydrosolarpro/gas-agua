"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Dato de pago (número o cuenta) con botón para copiarlo y pegarlo en la app del banco, Yape o Plin. */
export function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 text-left active:scale-[0.99]"
    >
      <span className="min-w-0">
        <span className="block text-xs text-slate-500">{label}</span>
        <span className="block break-all text-lg font-bold">{value}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-agua-700">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "¡Copiado!" : "Copiar"}
      </span>
    </button>
  );
}
