"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, UserX } from "lucide-react";
import { PinInput } from "@/components/PinInput";
import { ErrorText, Sheet, Spinner } from "@/components/ui";

type BajaRole = "cliente" | "dueno" | "repartidor";

const POINTS: Record<BajaRole, string[]> = {
  cliente: [
    "Cerraremos tu cuenta y borraremos tu celular y tu dirección.",
    "Ya no podrás entrar ni hacer pedidos con esta cuenta.",
    "Tu negocio conserva tu nombre y tus pedidos anteriores, marcados como «cliente dado de baja».",
    "Si quieres volver, puedes registrarte de nuevo con tu celular.",
  ],
  dueno: [
    "Cerraremos tu cuenta y tu negocio dejará de recibir pedidos.",
    "Tus clientes ya no podrán pedirte y tus repartidores dejarán de repartir.",
    "El administrador conserva el registro de tu negocio y tus pedidos, marcado como «dado de baja».",
    "Debes terminar o cancelar los pedidos en curso antes de darte de baja.",
  ],
  repartidor: [
    "Cerraremos tu cuenta y borraremos tu celular.",
    "Ya no podrás entrar ni recibir pedidos con esta cuenta.",
    "Tu negocio conserva tu nombre y tus entregas anteriores, marcados como «repartidor dado de baja».",
    "Debes terminar tus entregas en curso antes de darte de baja.",
  ],
};

/** Botón visible para darse de baja: primero se explica, luego se reconfirma con el PIN. Sirve para cliente, dueño y repartidor. */
export function BajaButton({ className = "", role = "cliente" }: { className?: string; role?: BajaRole }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(value: string) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/account/baja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setPin("");
    if (!res.ok) return setError(data.error ?? "No se pudo completar la baja");
    router.replace("/");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => {
          setError("");
          setPin("");
          setStep(1);
          setOpen(true);
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-white px-4 py-3 font-bold text-rose-600 active:scale-[0.99] ${className}`}
      >
        <UserX className="h-5 w-5" /> Darme de baja
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Darme de baja">
        {step === 1 ? (
          <div className="space-y-4">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
              {POINTS[role].map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <button onClick={() => setStep(2)} className="cta cta-danger">
              <UserX className="h-6 w-6" /> Sí, quiero darme de baja
            </button>
            <button onClick={() => setOpen(false)} className="cta cta-outline">
              Mejor no, quedarme
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-2xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> Última confirmación: al escribir tu PIN tu cuenta se cierra y no se puede deshacer.
            </p>
            <PinInput value={pin} onChange={setPin} onComplete={submit} label="Escribe tu PIN para confirmar la baja" />
            {busy && (
              <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <Spinner className="h-4 w-4" /> Cerrando tu cuenta…
              </p>
            )}
            <ErrorText>{error}</ErrorText>
            <button onClick={() => { setPin(""); setError(""); setStep(1); }} disabled={busy} className="cta cta-outline">
              Volver
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
