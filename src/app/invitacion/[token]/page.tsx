"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BellRing, MapPinned, Wallet } from "lucide-react";
import { Store, Bike } from "@/components/icons";
import { PhoneInput, PinInput } from "@/components/PinInput";
import { ErrorText, FullLoader, Logo, Spinner } from "@/components/ui";
import { money, waLink } from "@/lib/format";

type Check = { valid: boolean; note?: string | null; fee?: number | null; adminName?: string | null; adminPhone?: string | null };
type Step = "datos" | "pin" | "confirmar";

const BENEFITS = [
  { icon: BellRing, title: "Recibe pedidos al instante", text: "Cada pedido llega a tu panel y al celular de tus repartidores." },
  { icon: MapPinned, title: "Reparto con mapa en vivo", text: "Tu cliente ve por dónde viene su balón o bidón, como en un taxi por app." },
  { icon: Wallet, title: "Cobros bajo control", text: "Yape, Plin o efectivo contra-entrega, y tú validas cada pago." },
  { icon: Bike, title: "Tu equipo, ordenado", text: "Registra a tus repartidores con celular y PIN. Sin papeles ni cuadernos." },
];

// Página a la que llega un dueño desde el enlace de invitación: explica el servicio y registra su negocio.
export default function Invitacion() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [check, setCheck] = useState<Check | null>(null);
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

  useEffect(() => {
    fetch(`/api/invite/check?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setCheck)
      .catch(() => setCheck({ valid: false }));
  }, [token]);

  function next() {
    if (fullName.trim().length < 2) return setError("Escribe tu nombre");
    if (businessName.trim().length < 2) return setError("Escribe el nombre de tu negocio");
    if (!/^9\d{8}$/.test(phone)) return setError("El celular debe tener 9 dígitos y empezar con 9");
    setError("");
    setStep("pin");
    document.getElementById("registro")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const res = await fetch("/api/invite/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, fullName, businessName, phone, pin, yape, plin }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear tu cuenta");
      setPin("");
      setPin2("");
      setStep(res.status === 410 ? "datos" : "pin");
      if (res.status === 410) setCheck({ valid: false });
      return;
    }
    if (data.ok) {
      router.replace("/panel?nuevo=1");
      router.refresh();
    } else {
      router.replace("/ingresar?rol=dueno");
    }
  }

  if (!check) return <FullLoader />;

  if (!check.valid) {
    return (
      <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-8">
        <Link href="/">
          <Logo />
        </Link>
        <div className="card mt-8 w-full max-w-md space-y-4 p-6 text-center">
          <h1 className="text-2xl font-extrabold">Esta invitación ya no es válida</h1>
          <p className="text-slate-600">El enlace venció, ya se usó o fue anulado. Pide una invitación nueva al administrador.</p>
          <Link href="/ingresar?rol=dueno" className="btn-outline w-full">
            Ya tengo cuenta: ingresar
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-gradient-to-b from-agua-50 via-white to-gas-50">
      <div className="mx-auto max-w-5xl px-5 pb-16">
        <header className="flex items-center justify-between py-5">
          <Logo />
          <Link href="/ingresar?rol=dueno" className="btn-outline px-4 py-2 text-sm">
            Ya tengo cuenta
          </Link>
        </header>

        <div className="grid gap-10 pt-4 md:grid-cols-2 md:pt-10">
          <section>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
              Todo tu reparto de <span className="text-gas-500">gas</span> y <span className="text-agua-600">agua</span>, desde el celular.
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              {check.note ? `Hola, ${check.note}. ` : ""}Deja el cuaderno y los mensajes sueltos. Recibe pedidos, asigna repartidores, sigue las entregas en el mapa y valida cada pago en un solo lugar.
            </p>

            <div className="mt-8 space-y-5">
              {BENEFITS.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-4">
                  <Icon className="mt-0.5 h-6 w-6 shrink-0 text-agua-600" />
                  <div>
                    <p className="font-bold">{title}</p>
                    <p className="text-slate-600">{text}</p>
                  </div>
                </div>
              ))}
            </div>

            {check.fee != null && (
              <div className="mt-8 rounded-3xl bg-slate-900 p-5 text-white">
                <p className="text-sm text-slate-300">Tu plan</p>
                <p className="mt-1 text-3xl font-extrabold">
                  {money(check.fee)} <span className="text-base font-semibold text-slate-300">al mes</span>
                </p>
                <p className="mt-1 text-sm text-slate-300">Pedidos, repartidores y clientes sin límite. Pagas por Yape, Plin o transferencia.</p>
              </div>
            )}
          </section>

          <section id="registro" className="scroll-mt-6">
            <div className="card p-6">
              <p className="text-sm font-semibold text-agua-700">Paso {step === "datos" ? 1 : step === "pin" ? 2 : 3} de 3</p>
              <h2 className="mt-1 text-2xl font-extrabold">
                {step === "datos" ? "Registra tu negocio" : step === "pin" ? "Elige tu PIN" : "Repite tu PIN"}
              </h2>
              <p className="mt-1 text-slate-600">
                {step === "datos" ? "Te toma un minuto." : "Con este PIN y tu celular entrarás a tu panel. No lo compartas."}
              </p>

              <div className="mt-6 space-y-4">
                {step === "datos" && (
                  <>
                    <div>
                      <label className="label">Tu nombre y apellido</label>
                      <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ej. Juan Pérez" />
                    </div>
                    <div>
                      <label className="label">Nombre de tu negocio</label>
                      <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej. Distribuidora El Chorrillano" />
                    </div>
                    <div>
                      <label className="label">Tu celular</label>
                      <PhoneInput value={phone} onChange={setPhone} />
                      <p className="mt-1 text-xs text-slate-500">Tus clientes podrán llamarte o escribirte por WhatsApp.</p>
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
                    <button onClick={next} className="btn-gas w-full">
                      <Store className="h-5 w-5" /> Continuar
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
                    {busy && (
                      <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                        <Spinner className="h-4 w-4" /> Creando tu negocio…
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            {check.adminPhone && (
              <p className="mt-4 text-center text-sm text-slate-600">
                ¿Dudas?{" "}
                <a href={waLink(check.adminPhone, "Hola, tengo una duda sobre AguaGasExpress.")} target="_blank" className="font-bold text-agua-700">
                  Escribe por WhatsApp{check.adminName ? ` a ${check.adminName}` : ""}
                </a>
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
