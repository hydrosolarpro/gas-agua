"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PhoneInput, PinInput } from "@/components/PinInput";
import { ErrorText, FullLoader, Logo, Spinner } from "@/components/ui";
import { money } from "@/lib/format";
import { phoneExists } from "@/lib/phone-exists";

type Check = { valid: boolean; note?: string | null; fee?: number | null };
type Step = "datos" | "pin" | "confirmar";

// Registro de un dueño: con enlace de invitación (token) o abierto desde la web de Escalia (token = null).
export function OwnerSignup({ token }: { token: string | null }) {
  const router = useRouter();
  const [check, setCheck] = useState<Check | null>(token ? null : { valid: true });
  const [step, setStep] = useState<Step>("datos");
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [yape, setYape] = useState("");
  const [plin, setPlin] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/invite/check?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setCheck)
      .catch(() => setCheck({ valid: false }));
  }, [token]);

  async function next() {
    if (fullName.trim().length < 2) return setError("Escribe tu nombre");
    if (businessName.trim().length < 2) return setError("Escribe el nombre de tu negocio");
    if (!/^9\d{8}$/.test(phone)) return setError("El celular debe tener 9 dígitos y empezar con 9");
    setError("");
    setExisting(token ? await phoneExists(token, "dueno", phone) : false);
    setStep("pin");
  }

  async function submit(confirm: string, pinValue = pin) {
    if (confirm !== pinValue) {
      setError("Los PIN no coinciden. Vuelve a intentarlo.");
      setPin("");
      setPin2("");
      setStep("pin");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/invite/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token ?? undefined, fullName, businessName, phone, pin: pinValue, yape, plin }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear tu cuenta");
      setPin("");
      setPin2("");
      if (res.status === 410 && token) setCheck({ valid: false });
      else setStep(res.status === 409 && !/negocio registrado/i.test(data.error ?? "") ? "datos" : "pin");
      return;
    }
    router.replace(data.ok ? "/panel?nuevo=1" : "/ingresar?rol=dueno");
    router.refresh();
  }

  if (!check) return <FullLoader />;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-[clamp(0.5rem,2.5dvh,2rem)]">
      <Link href="/">
        <Logo />
      </Link>

      {!check.valid ? (
        <div className="card mt-[clamp(0.5rem,2.5dvh,2rem)] w-full max-w-md space-y-4 p-6 text-center">
          <h1 className="text-2xl font-extrabold">Esta invitación ya no es válida</h1>
          <p className="text-slate-600">El enlace venció, ya se usó o fue anulado. Pide una nueva al administrador.</p>
          <Link href="/ingresar?rol=dueno" className="btn-outline w-full">
            Ya tengo cuenta: ingresar
          </Link>
        </div>
      ) : (
        <div className="card mt-[clamp(0.5rem,2.5dvh,2rem)] w-full max-w-md p-[clamp(1rem,2.8dvh,1.5rem)]">
          <p className="text-sm font-semibold text-agua-700">Paso {step === "datos" ? 1 : step === "pin" ? 2 : 3} de 3</p>
          <h1 className="mt-1 text-2xl font-extrabold">
            {step === "datos" ? "Crea tu negocio" : step === "pin" ? (existing ? "Escribe tu PIN" : "Elige tu PIN") : "Repite tu PIN"}
          </h1>
          <p className="mt-1 text-slate-600">
            {step === "datos"
              ? `${check.note ? `${check.note}, ` : ""}${check.fee != null ? `tu plan es de ${money(check.fee)} al mes.` : "completa tus datos."}`
              : "Con este PIN y tu celular entrarás a tu panel. No lo compartas."}
          </p>

          <div className="mt-6 space-y-4">
            {step === "datos" && (
              <>
                <div>
                  <label className="label">Tu nombre y apellido</label>
                  <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Juan Pérez" autoFocus />
                </div>
                <div>
                  <label className="label">Nombre de tu negocio</label>
                  <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej. Distribuidora El Chorrillano" />
                </div>
                <div>
                  <label className="label">Tu celular</label>
                  <PhoneInput value={phone} onChange={setPhone} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Yape (opcional)</label>
                    <input className="input" inputMode="numeric" maxLength={9} value={yape} onChange={(e) => setYape(e.target.value.replace(/\D/g, ""))} placeholder="9…" />
                  </div>
                  <div>
                    <label className="label">Plin (opcional)</label>
                    <input className="input" inputMode="numeric" maxLength={9} value={plin} onChange={(e) => setPlin(e.target.value.replace(/\D/g, ""))} placeholder="9…" />
                  </div>
                </div>
                <ErrorText>{error}</ErrorText>
                <button onClick={next} className="cta-primary">
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
                  onComplete={(v) => {
                    setError("");
                    if (existing) submit(v, v);
                    else setStep("confirmar");
                  }}
                />
                {existing ? (
                  <p className="rounded-2xl bg-sky-50 p-3 text-center text-sm text-sky-900">
                    Este celular <b>ya tiene cuenta</b>. Escribe el PIN que usas siempre: tu negocio se crea con la misma cuenta.
                  </p>
                ) : (
                  <p className="text-center text-xs text-slate-500">Elige un PIN de 4 dígitos que recuerdes.</p>
                )}
              </>
            )}
            {step === "confirmar" && (
              <>
                <PinInput value={pin2} onChange={setPin2} onComplete={submit} label="Confirma tu PIN" />
                {busy && (
                  <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Spinner className="h-4 w-4" /> Creando tu negocio…
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <p className="mt-[clamp(0.5rem,2dvh,1.5rem)] text-sm text-slate-600">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar?rol=dueno" className="font-bold text-agua-700">
          Ingresa aquí
        </Link>
      </p>
    </main>
  );
}
