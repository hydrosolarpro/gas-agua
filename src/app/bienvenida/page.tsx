"use client";

import { House, Store } from "@/components/icons";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PhoneInput } from "@/components/PinInput";
import { ErrorText, FullLoader, Logo, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/format";
import { useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";

function Bienvenida() {
  const router = useRouter();
  const params = useSearchParams();
  const { loading, user, profile } = useSession();
  // Si llega desde la tienda de un negocio ya sabemos que quiere pedir; si llega por "Tengo un negocio", que quiere crearlo.
  const cameFromStore = Boolean(params.get("next"));
  const cameAsBusiness = Boolean(params.get("negocio"));
  const [choice, setChoice] = useState<"cliente" | "negocio" | null>(
    cameAsBusiness ? "negocio" : cameFromStore ? "cliente" : null,
  );
  const knownRole = cameAsBusiness || cameFromStore;
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bizName, setBizName] = useState("");
  const [yape, setYape] = useState("");
  const [plin, setPlin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  if (profile && !prefilled) {
    setPrefilled(true);
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
  }

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/ingresar");
    else if (profile?.onboarded) router.replace("/inicio");
    else if (
      profile &&
      cameFromStore &&
      !cameAsBusiness &&
      /^9\d{8}$/.test(profile.phone ?? "") &&
      (profile.full_name ?? "").trim().length >= 2
    ) {
      // Ya tenemos nombre y celular (se registró con PIN): no le pedimos nada más, vuelve a su pedido.
      const next = params.get("next") ?? "/cliente";
      const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/cliente";
      supabaseBrowser()
        .from("profiles")
        .update({ onboarded: true })
        .eq("id", profile.id)
        .then(() => router.replace(safe));
    }
  }, [loading, user, profile, router, params, cameFromStore, cameAsBusiness]);

  async function save() {
    if (!user || !choice) return;
    if (fullName.trim().length < 2) return setError("Escribe tu nombre");
    if (!/^9\d{8}$/.test(phone)) return setError("El celular debe tener 9 dígitos y empezar con 9");
    if (choice === "negocio" && bizName.trim().length < 2) return setError("Escribe el nombre de tu negocio");
    setSaving(true);
    setError("");
    const supabase = supabaseBrowser();
    try {
      const { error: e1 } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), phone, onboarded: choice === "cliente" })
        .eq("id", user.id);
      if (e1) throw e1;
      if (choice === "negocio") {
        const { error: e2 } = await supabase.rpc("create_business", {
          p_name: bizName.trim(),
          p_phone: phone,
          p_yape: yape || null,
          p_plin: plin || null,
        });
        if (e2) throw e2;
        router.replace("/panel?nuevo=1");
      } else {
        const next = params.get("next");
        router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/cliente");
      }
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  if (loading || !profile) return <FullLoader />;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-agua-50 to-white px-5 py-8">
      <Logo />
      <div className="card mt-8 w-full max-w-md p-6">
        <h1 className="text-2xl font-extrabold">¡Bienvenido{fullName ? `, ${fullName.split(" ")[0]}` : ""}!</h1>
        <p className="mt-1 text-slate-600">
          {knownRole
            ? cameAsBusiness
              ? "Crea tu negocio en un minuto."
              : "Solo falta confirmar tus datos para pedir."
            : "Cuéntanos cómo usarás AguaGasExpress."}
        </p>

        <div className={`mt-6 grid grid-cols-2 gap-3 ${knownRole ? "hidden" : ""}`}>
          {[
            { id: "cliente" as const, icon: House, title: "Quiero pedir", text: "Gas o agua a mi casa o negocio" },
            { id: "negocio" as const, icon: Store, title: "Tengo un negocio", text: "Reparto gas y/o agua" },
          ].map((o) => (
            <button
              key={o.id}
              onClick={() => setChoice(o.id)}
              className={`rounded-3xl border-2 p-4 text-left transition ${
                choice === o.id ? "border-agua-500 bg-agua-50" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <o.icon className="h-8 w-8 text-agua-600" />
              <p className="mt-2 font-bold">{o.title}</p>
              <p className="text-xs text-slate-500">{o.text}</p>
            </button>
          ))}
        </div>

        {choice && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="label">Tu nombre</label>
              <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="label">Tu celular</label>
              <PhoneInput value={phone} onChange={setPhone} />
              <p className="mt-1 text-xs text-slate-500">
                {choice === "negocio" ? "Tus clientes podrán llamarte o escribirte por WhatsApp." : "El repartidor te llamará si no encuentra tu dirección."}
              </p>
            </div>
            {choice === "negocio" && (
              <>
                <div>
                  <label className="label">Nombre del negocio</label>
                  <input className="input" value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Ej. Distribuidora El Chorrillano" />
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
              </>
            )}
            <ErrorText>{error}</ErrorText>
            <button onClick={save} disabled={saving} className={choice === "negocio" ? "btn-primary w-full" : "btn-gas w-full"}>
              {saving && <Spinner className="h-5 w-5" />}
              {choice === "negocio" ? "Crear mi negocio" : "Empezar a pedir"}
            </button>
          </div>
        )}
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
