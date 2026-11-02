"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserX } from "lucide-react";
import { PinInput } from "@/components/PinInput";
import { ErrorText, Sheet, Spinner } from "@/components/ui";

/** Botón visible para que el cliente se dé de baja con su PIN. */
export function BajaButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
          setOpen(true);
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-200 bg-white px-4 py-3 font-bold text-rose-600 active:scale-[0.99] ${className}`}
      >
        <UserX className="h-5 w-5" /> Darme de baja
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Darme de baja">
        <div className="space-y-4">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>Cerraremos tu cuenta y borraremos tu celular y tu dirección.</li>
            <li>Ya no podrás entrar ni hacer pedidos con esta cuenta.</li>
            <li>Los negocios guardan el historial de tus pedidos anteriores.</li>
            <li>Si quieres volver, puedes registrarte de nuevo con tu celular.</li>
          </ul>
          <PinInput value={pin} onChange={setPin} onComplete={submit} label="Escribe tu PIN para confirmar" />
          {busy && (
            <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Spinner className="h-4 w-4" /> Cerrando tu cuenta…
            </p>
          )}
          <ErrorText>{error}</ErrorText>
          <button onClick={() => setOpen(false)} className="btn-outline w-full">
            Mejor no
          </button>
        </div>
      </Sheet>
    </>
  );
}
