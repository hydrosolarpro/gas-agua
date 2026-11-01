"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PinInput } from "@/components/PinInput";
import { ErrorText, Logo, Spinner } from "@/components/ui";

type Step = "datos" | "pin" | "confirmar";

// Activación única de la cuenta de administrador: celular reservado + código secreto + PIN.
export default function ActivarAdmin() {
  const router = useRouter();
  const [state, setState] = useState<{ activado: boolean; existe?: boolean; nombre?: string; phone: string } | null>(null);
  const [step, setStep] = useState<Step>("datos");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/activar")
      .then((r) => r.json())
      .then((s) => {
        setState(s);
        if (s?.nombre) setName(s.nombre);
      })
      .catch(() => setState({ activado: false, phone: "" }));
  }, []);

  function next() {
    if (name.trim().length < 2) return setError("Escribe tu nombre");
    if (code.replace(/[\s-]/g, "").length < 8) return setError("Escribe el código de activación completo");
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
      body: JSON.stringify({ fullName: name, pin, code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo activar");
      setPin("");
      setPin2("");
      setStep(res.status === 401 ? "datos" : "pin");
      return;
    }
    router.replace("/admin/cobros");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-8">
      <Link href="/">
        <Logo />
      </Link>
      <div className="card mt-8 w-full max-w-md p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold">Activar administrador</h1>
            <p className="text-slate-600">Se hace una sola vez.</p>
          </div>
        </div>

        {state?.activado ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-2xl bg-slate-50 p-4 text-slate-700">El administrador ya fue activado. Ingresa con tu celular y tu PIN.</p>
            <Link href="/ingresar?rol=admin" className="btn-primary w-full">
              Ir a ingresar
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {step === "datos" && (
              <>
                {state?.phone && (
                  <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                    Celular del administrador: <b>+51 {state.phone}</b>
                    {state.existe && " · Ya tiene una cuenta: se convertirá en administradora y se guardará el PIN que elijas."}
                  </p>
                )}
                <div>
                  <label className="label">Tu nombre</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="label">Código de activación</label>
                  <input
                    className="input font-mono uppercase tracking-widest"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX"
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-slate-500">Está en la variable ADMIN_SETUP_CODE de tu configuración.</p>
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
                  label="Elige tu PIN de 4 dígitos"
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
                    <Spinner className="h-4 w-4" /> Activando…
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
