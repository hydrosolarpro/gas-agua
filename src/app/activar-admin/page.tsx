"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PinInput } from "@/components/PinInput";
import { ErrorText, Logo, Spinner } from "@/components/ui";

type Step = "codigo" | "pin" | "confirmar";

// Crear un PIN nuevo para el administrador (mismo celular reservado). Exige el código secreto.
export default function ActivarAdmin() {
  const router = useRouter();
  const [state, setState] = useState<{ activado: boolean; phone: string } | null>(null);
  const [step, setStep] = useState<Step>("codigo");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/activar")
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ activado: false, phone: "" }));
  }, []);

  function next() {
    if (code.replace(/[\s-]/g, "").length < 8) return setError("Escribe el código completo");
    setError("");
    setStep("pin");
  }

  async function submit(confirm: string) {
    if (confirm !== pin) {
      setError("Los PIN no coinciden. Vuelve a intentarlo.");
      setPin("");
      setPin2("");
      setStep("pin");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/activar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar el PIN");
      setPin("");
      setPin2("");
      setStep(res.status === 401 ? "codigo" : "pin");
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-[clamp(0.5rem,2.5dvh,2rem)]">
      <Link href="/">
        <Logo />
      </Link>
      <div className="card mt-[clamp(0.5rem,2.5dvh,2rem)] w-full max-w-md p-[clamp(1rem,2.8dvh,1.5rem)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold">PIN de administrador</h1>
            <p className="text-slate-600">Crea un PIN nuevo para entrar.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {step === "codigo" && (
            <>
              {state?.phone && (
                <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                  Celular del administrador: <b>+51 {state.phone}</b>
                </p>
              )}
              <div>
                <label className="label">Código de seguridad</label>
                <input
                  className="input font-mono uppercase tracking-widest"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX"
                  autoComplete="off"
                  autoFocus
                />
                <p className="mt-1 text-xs text-slate-500">Es el valor de ADMIN_SETUP_CODE de tu configuración.</p>
              </div>
              <ErrorText>{error}</ErrorText>
              <button onClick={next} className="btn-primary w-full">
                Continuar
              </button>
            </>
          )}
          {step === "pin" && (
            <>
              <ErrorText>{error}</ErrorText>
              <PinInput
                value={pin}
                onChange={setPin}
                label="Elige tu PIN nuevo de 4 dígitos"
                onComplete={() => {
                  setError("");
                  setStep("confirmar");
                }}
              />
            </>
          )}
          {step === "confirmar" && (
            <>
              <PinInput value={pin2} onChange={setPin2} onComplete={submit} label="Repite tu PIN" />
              {busy && (
                <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Spinner className="h-4 w-4" /> Guardando…
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <Link href="/ingresar?rol=admin" className="mt-6 text-sm font-semibold text-slate-500 hover:text-slate-800">
        Ya tengo mi PIN: ingresar
      </Link>
    </main>
  );
}
