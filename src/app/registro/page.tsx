"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PhoneInput, PinInput } from "@/components/PinInput";
import { AuthTabs } from "@/components/AuthTabs";
import { ErrorText, Logo, Spinner } from "@/components/ui";

function RegistroForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [step, setStep] = useState<"datos" | "pin" | "confirmar">("datos");
  const [fullName, setFullName] = useState("");
  // Si vienen desde un intento fallido de ingreso, el celular ya viene escrito.
  const [phone, setPhone] = useState(() => (/^9\d{8}$/.test(params.get("tel") ?? "") ? (params.get("tel") as string) : ""));
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function continueData() {
    if (fullName.trim().length < 2) return setError("Escribe tu nombre");
    if (!/^9\d{8}$/.test(phone)) return setError("El celular debe tener 9 dígitos y empezar con 9");
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
    setLoading(true);
    setError("");
    const res = await fetch("/api/pin/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, phone, pin }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear la cuenta");
      setStep("datos");
      setPin("");
      setPin2("");
      return;
    }
    router.replace(`/bienvenida${next ? `?next=${encodeURIComponent(next)}` : ""}`);
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-[clamp(0.5rem,2.5dvh,2rem)]">
      <Link href="/">
        <Logo />
      </Link>
      <div className="card mt-[clamp(0.5rem,2.5dvh,2rem)] w-full max-w-md p-[clamp(1rem,2.8dvh,1.5rem)]">
        {step === "datos" && <AuthTabs active="registro" next={next} />}
        <p className="text-sm font-semibold text-agua-700">
          Paso {step === "datos" ? 1 : step === "pin" ? 2 : 3} de 3
        </p>
        <h1 className="mt-1 text-2xl font-extrabold">
          {step === "datos" ? "Crea tu cuenta" : step === "pin" ? "Elige tu PIN" : "Repite tu PIN"}
        </h1>
        <p className="mt-1 text-slate-600">
          {step === "datos"
            ? "Solo te pedimos tu nombre y celular."
            : "Con este PIN entrarás rápido desde cualquier celular. No lo compartas."}
        </p>

        <div className="mt-6 space-y-4">
          {step === "datos" && (
            <>
              <div>
                <label className="label">Nombre y apellido</label>
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Rosa Quispe" autoFocus />
              </div>
              <div>
                <label className="label">Celular</label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
              <ErrorText>{error}</ErrorText>
              <button onClick={continueData} className="btn-primary w-full">
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
                onComplete={() => {
                  setError("");
                  setStep("confirmar");
                }}
              />
            </>
          )}
          {step === "confirmar" && (
            <>
              <PinInput value={pin2} onChange={setPin2} onComplete={submit} label="Confirma tu PIN" />
              {loading && (
                <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Spinner className="h-4 w-4" /> Creando tu cuenta…
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <p className="mt-[clamp(0.5rem,2dvh,1.5rem)] text-sm text-slate-600">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-bold text-agua-700">
          Ingresa aquí
        </Link>
      </p>
    </main>
  );
}

export default function RegistroPage() {
  return (
    <Suspense>
      <RegistroForm />
    </Suspense>
  );
}
