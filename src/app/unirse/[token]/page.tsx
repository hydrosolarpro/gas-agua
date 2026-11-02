"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PhoneInput, PinInput } from "@/components/PinInput";
import { ErrorText, FullLoader, Logo, Spinner } from "@/components/ui";
import { rememberRole } from "@/lib/hooks";

type Check = { valid: boolean; business?: string; slug?: string; note?: string | null };
type Step = "datos" | "pin" | "confirmar";

// Pantalla a la que llega un cliente desde el enlace con el que un negocio lo invita a pedir.
export default function Unirse() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [check, setCheck] = useState<Check | null>(null);
  const [step, setStep] = useState<Step>("datos");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/customers/check?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setCheck)
      .catch(() => setCheck({ valid: false }));
  }, [token]);

  function next() {
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
    setBusy(true);
    setError("");
    const res = await fetch("/api/customers/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, fullName, phone, pin }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo completar el registro");
      setPin("");
      setPin2("");
      if (res.status === 410) setCheck({ valid: false });
      else setStep(res.status === 400 && /nombre/i.test(data.error ?? "") ? "datos" : "pin");
      return;
    }
    if (data.ok) {
      rememberRole("cliente");
      router.replace(`/n/${data.slug}`);
      router.refresh();
    } else {
      router.replace("/ingresar");
    }
  }

  if (!check) return <FullLoader />;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-8">
      <Link href="/">
        <Logo />
      </Link>

      {!check.valid ? (
        <div className="card mt-8 w-full max-w-md space-y-4 p-6 text-center">
          <h1 className="text-2xl font-extrabold">Esta invitación ya no es válida</h1>
          <p className="text-slate-600">El enlace venció o fue anulado. Pide uno nuevo a tu negocio.</p>
          <Link href="/ingresar" className="btn-outline w-full">
            Ya tengo cuenta: ingresar
          </Link>
        </div>
      ) : (
        <div className="card mt-8 w-full max-w-md p-6">
          <p className="text-sm font-semibold text-agua-700">Paso {step === "datos" ? 1 : step === "pin" ? 2 : 3} de 3</p>
          <h1 className="mt-1 text-2xl font-extrabold">
            {step === "datos" ? `Pide con ${check.business}` : step === "pin" ? "Elige tu PIN" : "Repite tu PIN"}
          </h1>
          <p className="mt-1 text-slate-600">
            {step === "datos"
              ? "Regístrate en un minuto para pedir gas y agua a domicilio y seguir a tu repartidor en el mapa."
              : "Con tu celular y este PIN entrarás cuando quieras. No lo compartas."}
          </p>

          <div className="mt-6 space-y-4">
            {step === "datos" && (
              <>
                <div>
                  <label className="label">Tu nombre y apellido</label>
                  <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Rosa Quispe" autoFocus />
                </div>
                <div>
                  <label className="label">Tu celular</label>
                  <PhoneInput value={phone} onChange={setPhone} />
                </div>
                <ErrorText>{error}</ErrorText>
                <button onClick={next} className="btn-gas w-full">
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
                  label="Tu PIN de 4 dígitos"
                  onComplete={() => {
                    setError("");
                    setStep("confirmar");
                  }}
                />
                <p className="text-center text-xs text-slate-500">
                  Si este celular ya tiene cuenta (por ejemplo, eres dueño de otro negocio), escribe tu PIN actual.
                </p>
              </>
            )}
            {step === "confirmar" && (
              <>
                <PinInput value={pin2} onChange={setPin2} onComplete={submit} label="Repite tu PIN" />
                {busy && (
                  <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Spinner className="h-4 w-4" /> Registrándote…
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <p className="mt-6 text-sm text-slate-600">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-bold text-agua-700">
          Ingresa aquí
        </Link>
      </p>
    </main>
  );
}
