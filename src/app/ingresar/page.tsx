"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PhoneInput, PinInput } from "@/components/PinInput";
import { AuthTabs } from "@/components/AuthTabs";
import { Bike, Flame, Store } from "@/components/icons";
import { ErrorText, Logo, Spinner } from "@/components/ui";
import { appRole } from "@/lib/hooks";
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

function IngresarForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safePath(params.get("next"));
  const rolParam = params.get("rol");
  const rol: Rol = rolParam === "dueno" || rolParam === "repartidor" || rolParam === "admin" ? rolParam : "cliente";
  const { title, text, Icon } = ROLES[rol];
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState<"pin" | null>(null);
  const [error, setError] = useState("");
  const [mismatch, setMismatch] = useState<AppRole | null>(null);

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
    // Si entró por una puerta que no es la de su cuenta (p. ej. "Administrador" sin estar activado), se lo decimos.
    if (rol !== "cliente") {
      const db = supabaseBrowser();
      const { data: u } = await db.auth.getUser();
      const { data: p } = u.user
        ? await db.from("profiles").select("role, is_admin").eq("id", u.user.id).single<{ role: Role; is_admin: boolean }>()
        : { data: null };
      if (p && appRole(p) !== rol) {
        setMismatch(appRole(p));
        setPin("");
        setLoading(null);
        return;
      }
    }
    router.replace(next);
    router.refresh();
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

        <div className="mt-6" />

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
      </div>
      <p className="mt-6 max-w-md text-center text-sm text-slate-600">
        {rol === "cliente" && (
          <>
            ¿Primera vez?{" "}
            <Link href={`/registro?next=${encodeURIComponent(next)}`} className="font-bold text-agua-700">
              Crea tu cuenta con PIN
            </Link>
          </>
        )}
        {rol === "dueno" && "¿Quieres usar AguaGasExpress en tu negocio? El administrador te envía una invitación para crear tu cuenta."}
        {rol === "repartidor" && "¿Aún no tienes acceso? Tu dueño de negocio te registra y te da tu celular y tu PIN."}
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
