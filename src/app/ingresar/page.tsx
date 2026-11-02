"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PhoneInput, PinInput } from "@/components/PinInput";
import { AuthTabs } from "@/components/AuthTabs";
import { Bike, Flame, Store } from "@/components/icons";
import { ErrorText, Logo, Spinner } from "@/components/ui";
import { capabilities, rememberRole } from "@/lib/hooks";
import { safePath } from "@/lib/safe-path";
import type { AppRole, Role } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";

type Rol = "cliente" | "dueno" | "repartidor" | "admin";

const ROL_NAME: Record<Rol, string> = { cliente: "cliente", dueno: "dueño de negocio", repartidor: "repartidor", admin: "administrador" };

const ROLES: Record<Rol, { title: string; text: string; Icon: typeof Store }> = {
  cliente: { title: "¡Hola!", text: "Ingresa para pedir gas o agua.", Icon: Flame },
  dueno: { title: "Ingresa a tu negocio", text: "Gestiona pedidos, repartidores y cobros.", Icon: Store },
  repartidor: { title: "Ingresa como repartidor", text: "Mira tus entregas y comparte tu ubicación.", Icon: Bike },
  admin: { title: "Administrador", text: "Panel de la plataforma.", Icon: ShieldCheck },
};

// Primer ingreso (o PIN reiniciado) de un repartidor o cliente: su negocio ya lo registró; aquí elige su propio PIN.
function FirstTime({ phone, setPhone, next, onGoLogin }: { phone: string; setPhone: (v: string) => void; next: string; onGoLogin: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"celular" | "pin" | "confirmar">(phone.length === 9 ? "pin" : "celular");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [noPending, setNoPending] = useState(false);

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
    const res = await fetch("/api/driver/activar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, pin }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear tu PIN");
      setNoPending(res.status === 404);
      setPin("");
      setPin2("");
      setStep(res.status === 404 ? "celular" : "pin");
      return;
    }
    if (data.ok) {
      const rol: AppRole = data.rol === "repartidor" ? "repartidor" : "cliente";
      rememberRole(rol);
      router.replace(rol === "repartidor" ? "/repartidor" : next);
      router.refresh();
    } else {
      router.replace("/ingresar");
    }
  }

  return (
    <div className="space-y-4">
      {step === "celular" && (
        <>
          <div>
            <label className="label">Tu celular</label>
            <PhoneInput value={phone} onChange={setPhone} />
            <p className="mt-1 text-xs text-slate-500">El mismo número con el que tu negocio te registró.</p>
          </div>
          <ErrorText>{error}</ErrorText>
          {noPending && (
            <button onClick={onGoLogin} className="btn-gas w-full">
              Ya tengo cuenta con este número: ingresar con mi PIN
            </button>
          )}
          <button
            onClick={() => (phone.length === 9 ? (setError(""), setNoPending(false), setStep("pin")) : setError("Escribe tu celular de 9 dígitos"))}
            className={noPending ? "btn-outline w-full" : "btn-primary w-full"}
          >
            Continuar
          </button>
        </>
      )}
      {step === "pin" && (
        <>
          <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            Celular: <b>+51 {phone}</b>{" "}
            <button onClick={() => setStep("celular")} className="font-bold text-agua-700">
              Cambiar
            </button>
          </p>
          <ErrorText>{error}</ErrorText>
          <PinInput
            value={pin}
            onChange={setPin}
            label="Crea tu PIN de 4 dígitos"
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
  );
}
function IngresarForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safePath(params.get("next"));
  const rolParam = params.get("rol");
  const rol: Rol = rolParam === "dueno" || rolParam === "repartidor" || rolParam === "admin" ? rolParam : "cliente";
  const { title, text, Icon } = ROLES[rol];
  const [phone, setPhone] = useState(() => (/^9\d{8}$/.test(params.get("tel") ?? "") ? (params.get("tel") as string) : ""));
  const [first, setFirst] = useState((rol === "repartidor" || rol === "cliente") && params.get("nuevo") === "1");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState<"pin" | null>(null);
  const [error, setError] = useState("");
  const [mismatch, setMismatch] = useState<AppRole | null>(null);
  const [invites, setInvites] = useState<{ business_id: string; name: string }[]>([]);
  const [accepting, setAccepting] = useState(false);

  async function loginPin(value = pin) {
    if (phone.length !== 9) return setError("Ingresa tu celular de 9 dígitos");
    if (value.length !== 4) return;
    setLoading("pin");
    setError("");
    const res = await fetch("/api/pin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, pin: value }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo ingresar");
      setPin("");
      setLoading(null);
      return;
    }
    // Una misma cuenta puede tener varios roles. Recordamos con cuál entra; si la cuenta no tiene ese rol, se lo decimos.
    const db = supabaseBrowser();
    const { data: u } = await db.auth.getUser();
    const { data: p } = u.user
      ? await db.from("profiles").select("role, is_admin").eq("id", u.user.id).single<{ role: Role; is_admin: boolean }>()
      : { data: null };
    if (p) {
      const caps = capabilities(p);
      if (!caps.includes(rol)) {
        // Un celular que ya tiene otra cuenta (cliente, etc.) puede ser repartidor: si un negocio lo invitó, acepta aquí mismo.
        if (rol === "repartidor" && u.user) {
          const { data: inv } = await db
            .from("business_members")
            .select("business_id, businesses(name)")
            .eq("user_id", u.user.id)
            .eq("accepted", false)
            .returns<{ business_id: string; businesses: { name: string } | null }[]>();
          if (inv && inv.length > 0) {
            setInvites(inv.map((x) => ({ business_id: x.business_id, name: x.businesses?.name ?? "un negocio" })));
            setPin("");
            setLoading(null);
            return;
          }
        }
        setMismatch(caps[0]);
        setPin("");
        setLoading(null);
        return;
      }
      rememberRole(rol);
    }
    // El dueño siempre empieza en su Resumen, salvo que viniera de otra página de su panel.
    router.replace(rol === "dueno" && !next.startsWith("/panel") ? "/panel" : next);
    router.refresh();
  }

  async function answerInvite(businessId: string, accept: boolean) {
    setAccepting(true);
    const db = supabaseBrowser();
    await db.rpc(accept ? "accept_driver_invitation" : "decline_driver_invitation", { p_business_id: businessId });
    setAccepting(false);
    const rest = invites.filter((i) => i.business_id !== businessId);
    setInvites(rest);
    if (accept) {
      rememberRole("repartidor");
      router.replace("/repartidor");
      router.refresh();
    } else if (rest.length === 0) {
      router.replace("/inicio");
      router.refresh();
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-8">
      <Link href="/">
        <Logo />
      </Link>
      <div className="card mt-8 w-full max-w-md p-6">
        {rol === "cliente" && <AuthTabs active="ingresar" next={params.get("next")} />}
        <div className="flex items-center gap-3">
          {rol !== "cliente" && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-agua-50 text-agua-700">
              <Icon className="h-6 w-6" />
            </span>
          )}
          <div>
            <h1 className="text-2xl font-extrabold">{title}</h1>
            <p className="text-slate-600">{text}</p>
          </div>
        </div>

        {invites.length > 0 && (
          <div className="mt-6 space-y-3">
            {invites.map((i) => (
              <div key={i.business_id} className="space-y-3 rounded-2xl border-2 border-agua-200 p-4">
                <p className="font-bold">{i.name} te invitó como repartidor</p>
                <p className="text-sm text-slate-600">Si aceptas, entras como repartidor con este mismo celular y PIN. Tu otra cuenta sigue igual.</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => answerInvite(i.business_id, true)} disabled={accepting} className="btn-primary px-3 py-2.5 text-sm">
                    Aceptar y entrar
                  </button>
                  <button onClick={() => answerInvite(i.business_id, false)} disabled={accepting} className="btn-outline px-3 py-2.5 text-sm">
                    Ahora no
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6" />
        {rol === "repartidor" && (
          <div className="mb-5 flex gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
            {[
              { id: false, label: "Ingresar" },
              { id: true, label: "Primera vez" },
            ].map((tab) => (
              <button
                key={tab.label}
                role="tab"
                aria-selected={first === tab.id}
                onClick={() => setFirst(tab.id)}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition ${first === tab.id ? "bg-white text-agua-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        {first ? (
          <FirstTime phone={phone} setPhone={setPhone} next={next} onGoLogin={() => setFirst(false)} />
        ) : (
          <>
        <label className="label">Celular</label>
        <PhoneInput value={phone} onChange={setPhone} />

        <div className="mt-5">
          <PinInput value={pin} onChange={setPin} onComplete={loginPin} />
        </div>

        <div className="mt-5 space-y-3">
          <ErrorText>{error}</ErrorText>
          {mismatch && (
            <div className="space-y-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              <p>
                Entraste, pero esta cuenta es de <b>{ROL_NAME[mismatch]}</b>, no de {ROL_NAME[rol]}.
              </p>
              {rol === "admin" && (
                <Link href="/activar-admin" className="btn-primary w-full">
                  Crear mi PIN de administrador
                </Link>
              )}
              <button
                onClick={() => {
                  router.replace("/inicio");
                  router.refresh();
                }}
                className="btn-outline w-full"
              >
                Continuar como {ROL_NAME[mismatch]}
              </button>
            </div>
          )}
          {rol === "cliente" && error.includes("incorrecto") && (
            // No revelamos si el celular existe; ofrecemos crear cuenta a cualquiera que falle.
            <Link
              href={`/registro?next=${encodeURIComponent(next)}${phone.length === 9 ? `&tel=${phone}` : ""}`}
              className="btn-outline w-full"
            >
              ¿Aún no tienes cuenta? Crear mi cuenta con PIN
            </Link>
          )}
          <button onClick={() => loginPin()} disabled={loading !== null || pin.length !== 4} className="btn-primary w-full">
            {loading === "pin" && <Spinner className="h-5 w-5" />} Ingresar
          </button>
        </div>
          </>
        )}
      </div>
      <p className="mt-6 max-w-md text-center text-sm text-slate-600">
        {rol === "cliente" && (
          <>
            ¿Primera vez?{" "}
            <Link href={`/registro?next=${encodeURIComponent(next)}`} className="font-bold text-agua-700">
              Crea tu cuenta con PIN
            </Link>
            <span className="mt-2 block">
              ¿Tu negocio reinició tu PIN?{" "}
              <button onClick={() => setFirst((v) => !v)} className="font-bold text-agua-700">
                {first ? "Volver a ingresar" : "Elige uno nuevo"}
              </button>
            </span>
          </>
        )}
        {rol === "dueno" && "¿Quieres usar AguaGasExpress en tu negocio? El administrador te envía una invitación para crear tu cuenta."}
        {rol === "repartidor" && "¿Aún no tienes acceso? Tu dueño te registra con tu nombre y celular; luego creas tu PIN en «Primera vez»."}
        {rol === "admin" && (
          <>
            ¿Primera vez o olvidaste tu PIN?{" "}
            <Link href="/activar-admin" className="font-bold text-agua-700">
              Crea un PIN nuevo
            </Link>
          </>
        )}
      </p>
      {rol !== "cliente" && (
        <Link href="/ingresar" className="mt-3 text-sm font-semibold text-slate-500 hover:text-slate-800">
          ← Soy cliente
        </Link>
      )}
    </main>
  );
}

export default function IngresarPage() {
  return (
    <Suspense>
      <IngresarForm />
    </Suspense>
  );
}
