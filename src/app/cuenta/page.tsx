"use client";

import { Mail, Phone, Store } from "@/components/icons";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { PinInput } from "@/components/PinInput";
import { ErrorText, FullLoader, Spinner, TopBar } from "@/components/ui";
import { appRole, homeFor, useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";

const ROLE_LABEL = { cliente: "Cliente", dueno: "Dueño de negocio", repartidor: "Repartidor", admin: "Administrador" };

export default function CuentaPage() {
  const router = useRouter();
  const { loading, profile, user, business, reload } = useSession(["cliente", "dueno", "repartidor", "admin"]);
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function savePin(value: string) {
    setSaving(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/pin/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: value }),
    });
    const data = await res.json();
    setSaving(false);
    setPin("");
    if (!res.ok) return setError(data.error ?? "No se pudo guardar el PIN");
    setMsg("¡Listo! Ya puedes entrar con tu celular y este PIN.");
    reload();
  }

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/");
    router.refresh();
  }

  if (loading || !profile) return <FullLoader />;
  const home = homeFor(appRole(profile));

  return (
    <div className="min-h-dvh">
      <TopBar title="Mi cuenta" back={home} />
      <main className="mx-auto max-w-lg space-y-4 p-4">
        <section className="card p-5">
          <p className="text-xl font-bold">{profile.full_name || "Sin nombre"}</p>
          <p className="flex items-center gap-2 text-slate-600"><Phone className="h-4 w-4" /> {profile.phone ?? "Sin celular"}</p>
          {user?.email && !user.email.endsWith("@pin.aguagasexpress.app") && (
            <p className="flex items-center gap-2 text-slate-600"><Mail className="h-4 w-4" /> {user.email}</p>
          )}
          <p className="mt-2">
            <span className="chip bg-agua-100 text-agua-700">{ROLE_LABEL[appRole(profile)]}</span>
            {business && <span className="chip ml-2 bg-slate-100 text-slate-700"><Store className="h-3.5 w-3.5" /> {business.name}</span>}
          </p>
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-agua-600" />
            <h2 className="text-lg font-bold">{profile.has_pin ? "Cambiar mi PIN" : "Crear mi PIN"}</h2>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Con tu PIN entras con tu celular <b>{profile.phone}</b> para entrar desde cualquier celular.
          </p>
          <PinInput value={pin} onChange={setPin} onComplete={savePin} label="Nuevo PIN" />
          <div className="mt-4 space-y-2">
            {saving && (
              <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <Spinner className="h-4 w-4" /> Guardando…
              </p>
            )}
            {msg && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{msg}</p>}
            <ErrorText>{error}</ErrorText>
          </div>
        </section>

        <button onClick={logout} className="btn-outline w-full text-rose-600">
          <LogOut className="h-5 w-5" /> Cerrar sesión
        </button>
      </main>
    </div>
  );
}
