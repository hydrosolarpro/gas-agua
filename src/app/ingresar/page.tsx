"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PhoneInput, PinInput } from "@/components/PinInput";
import { ErrorText, Logo, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/inicio";
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function IngresarForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState<"google" | "pin" | null>(null);
  const [error, setError] = useState(params.get("error") === "google" ? "No se pudo ingresar con Google. Inténtalo otra vez." : "");

  async function google() {
    setLoading("google");
    setError("");
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError("Google todavía no está activado en este entorno. Usa tu celular y PIN.");
      setLoading(null);
    }
  }

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
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-8">
      <Link href="/">
        <Logo />
      </Link>
      <div className="card mt-8 w-full max-w-md p-6">
        <h1 className="text-2xl font-extrabold">¡Hola!</h1>
        <p className="mt-1 text-slate-600">Ingresa para pedir o gestionar tu reparto.</p>

        <button onClick={google} disabled={loading !== null} className="btn-outline mt-6 w-full">
          {loading === "google" ? <Spinner className="h-5 w-5" /> : <GoogleIcon />}
          Continuar con Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> o con tu celular <span className="h-px flex-1 bg-slate-200" />
        </div>

        <label className="label">Celular</label>
        <PhoneInput value={phone} onChange={setPhone} />

        <div className="mt-5">
          <PinInput value={pin} onChange={setPin} onComplete={loginPin} />
        </div>

        <div className="mt-5 space-y-3">
          <ErrorText>{error}</ErrorText>
          <button onClick={() => loginPin()} disabled={loading !== null || pin.length !== 4} className="btn-primary w-full">
            {loading === "pin" && <Spinner className="h-5 w-5" />} Ingresar
          </button>
        </div>
      </div>
      <p className="mt-6 text-sm text-slate-600">
        ¿Primera vez?{" "}
        <Link href={`/registro?next=${encodeURIComponent(next)}`} className="font-bold text-agua-700">
          Crea tu cuenta con PIN
        </Link>
      </p>
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
