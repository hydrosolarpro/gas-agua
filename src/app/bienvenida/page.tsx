"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PhoneInput } from "@/components/PinInput";
import { ErrorText, FullLoader, Logo, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/format";
import { useSession } from "@/lib/hooks";
import { safePath } from "@/lib/safe-path";
import { supabaseBrowser } from "@/lib/supabase/client";

// Datos mínimos de un cliente nuevo (nombre y celular). Los negocios se crean solo con invitación.
function Bienvenida() {
  const router = useRouter();
  const params = useSearchParams();
  const { loading, user, profile } = useSession();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const target = safePath(params.get("next"), "/cliente");

  if (profile && !prefilled) {
    setPrefilled(true);
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
  }

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/ingresar");
    else if (profile?.onboarded) router.replace("/inicio");
    else if (profile && /^9\d{8}$/.test(profile.phone ?? "") && (profile.full_name ?? "").trim().length >= 2) {
      // Ya tenemos nombre y celular (se registró con PIN): no le pedimos nada más.
      supabaseBrowser()
        .from("profiles")
        .update({ onboarded: true })
        .eq("id", profile.id)
        .then(() => router.replace(target));
    }
  }, [loading, user, profile, router, target]);

  async function save() {
    if (!user) return;
    if (fullName.trim().length < 2) return setError("Escribe tu nombre");
    if (!/^9\d{8}$/.test(phone)) return setError("El celular debe tener 9 dígitos y empezar con 9");
    setSaving(true);
    setError("");
    const { error: e } = await supabaseBrowser()
      .from("profiles")
      .update({ full_name: fullName.trim(), phone, onboarded: true })
      .eq("id", user.id);
    if (e) {
      setError(errorMessage(e));
      setSaving(false);
      return;
    }
    router.replace(target);
  }

  if (loading || !profile) return <FullLoader />;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-[clamp(0.5rem,2.5dvh,2rem)]">
      <Logo />
      <div className="card mt-[clamp(0.5rem,2.5dvh,2rem)] w-full max-w-md p-[clamp(1rem,2.8dvh,1.5rem)]">
        <h1 className="text-2xl font-extrabold">¡Bienvenido{fullName ? `, ${fullName.split(" ")[0]}` : ""}!</h1>
        <p className="mt-1 text-slate-600">Solo falta confirmar tus datos para pedir.</p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="label">Tu nombre</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="label">Tu celular</label>
            <PhoneInput value={phone} onChange={setPhone} />
            <p className="mt-1 text-xs text-slate-500">El repartidor te llamará si no encuentra tu dirección.</p>
          </div>
          <ErrorText>{error}</ErrorText>
          <button onClick={save} disabled={saving} className="cta-gas">
            {saving && <Spinner className="h-5 w-5" />} Empezar a pedir
          </button>
        </div>
      </div>
    </main>
  );
}

export default function BienvenidaPage() {
  return (
    <Suspense>
      <Bienvenida />
    </Suspense>
  );
}
