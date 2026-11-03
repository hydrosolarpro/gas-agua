"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { PhoneInput } from "@/components/PinInput";
import { LogoUploader } from "@/components/LogoUploader";
import { HoursEditor } from "@/components/HoursEditor";
import { cleanHours, DAY_KEYS, type OpeningHours } from "@/lib/hours";
import { ErrorText, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { usePanel } from "@/components/panel-context";

type Tab = "datos" | "horario" | "pagos" | "ubicacion" | "enlace";

export default function NegocioPage() {
  const { business, reload } = usePanel();
  const [name, setName] = useState(business.name);
  const [phone, setPhone] = useState(business.phone ?? "");
  const [yape, setYape] = useState(business.yape_number ?? "");
  const [plin, setPlin] = useState(business.plin_number ?? "");
  const [holder, setHolder] = useState(business.payment_holder ?? "");
  const [otherName, setOtherName] = useState(business.other_pay_name ?? "");
  const [otherValue, setOtherValue] = useState(business.other_pay_value ?? "");
  const [loc, setLoc] = useState<PickedLocation>({
    point: business.lat && business.lng ? { lat: business.lat, lng: business.lng } : null,
    address: business.address_text ?? "",
    reference: "",
  });
  const [hours, setHours] = useState<OpeningHours>(business.opening_hours ?? {});
  const [tab, setTab] = useState<Tab>("datos");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const link = `${typeof window === "undefined" ? "" : location.origin}/n/${business.slug}`;

  async function save() {
    if (name.trim().length < 2) return setError("Escribe el nombre del negocio");
    if (Boolean(otherName.trim()) !== Boolean(otherValue.trim())) return setError("Completa el nombre y el dato de la otra plataforma de pago, o deja ambos vacíos");
    if (DAY_KEYS.some((k) => hours[k] && hours[k]!.abre >= hours[k]!.cierra)) return setError("Revisa el horario: la hora de cierre debe ser después de la de apertura");
    setSaving(true);
    setError("");
    setMsg("");
    const { error } = await supabaseBrowser()
      .from("businesses")
      .update({
        name: name.trim(),
        phone: phone || null,
        yape_number: yape || null,
        plin_number: plin || null,
        payment_holder: holder.trim() || null,
        other_pay_name: otherName.trim() || null,
        other_pay_value: otherValue.trim() || null,
        address_text: loc.address || null,
        lat: loc.point?.lat ?? null,
        lng: loc.point?.lng ?? null,
        opening_hours: cleanHours(hours),
      })
      .eq("id", business.id);
    setSaving(false);
    if (error) return setError(errorMessage(error));
    setMsg("¡Cambios guardados!");
    reload();
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "datos", label: "Datos" },
    { id: "horario", label: "Horario" },
    { id: "pagos", label: "Pagos" },
    { id: "ubicacion", label: "Ubicación" },
    { id: "enlace", label: "Enlace" },
  ];
  const pane = (t: Tab) => (tab === t ? "block" : "hidden");

  // Cada sección en su propia pestaña: todo cabe en pantalla y el botón Guardar siempre está a la vista.
  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-3 p-3 md:p-5">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold md:text-2xl">Datos de mi Negocio</h1>
        <div className="flex items-center gap-2">
          <Link href="/panel/suscripcion" className="btn-outline !px-3 !py-2 text-sm">
            Mi plan
          </Link>
        </div>
      </div>

      <div className="flex shrink-0 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl px-2 py-2 text-sm font-bold transition ${tab === t.id ? "bg-white text-agua-700 shadow-sm" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      {msg && <p className="shrink-0 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">{msg}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className={`card space-y-4 p-4 md:p-5 ${pane("datos")}`}>
          <h2 className="font-bold">Datos del negocio</h2>
          <LogoUploader business={business} onChanged={reload} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Celular del negocio</label>
              <PhoneInput value={phone} onChange={setPhone} />
            </div>
          </div>
        </section>

        <section className={`card space-y-3 p-4 md:p-5 ${pane("horario")}`}>
          <h2 className="font-bold">Horario de atención</h2>
          <p className="text-sm text-slate-600">Tus clientes y repartidores verán si estás abierto o cerrado. Un día apagado se muestra como cerrado.</p>
          <HoursEditor value={hours} onChange={setHours} />
        </section>

        <section className={`card space-y-3 p-4 md:p-5 ${pane("pagos")}`}>
          <h2 className="font-bold">Dónde te pagan</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Número Yape</label>
              <input className="input" inputMode="numeric" maxLength={9} value={yape} onChange={(e) => setYape(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div>
              <label className="label">Número Plin</label>
              <input className="input" inputMode="numeric" maxLength={9} value={plin} onChange={(e) => setPlin(e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Otra plataforma (opcional)</label>
              <input className="input" maxLength={40} value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Ej. BCP cuenta, Interbank, Agora" />
            </div>
            <div>
              <label className="label">Número o cuenta</label>
              <input className="input" maxLength={60} value={otherValue} onChange={(e) => setOtherValue(e.target.value)} placeholder="Ej. 19498905205045" />
            </div>
          </div>
          <div>
            <label className="label">Nombre del titular (opcional)</label>
            <input className="input" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Como aparece en Yape/Plin" />
          </div>
          <p className="text-xs text-slate-500">Si dejas Yape o Plin vacío, esa opción no se ofrece a tus clientes. El efectivo siempre está disponible.</p>
        </section>

        <section className={`card space-y-3 p-4 md:p-5 ${pane("ubicacion")}`}>
          <h2 className="font-bold">Ubicación del local</h2>
          <LocationPicker value={loc} onChange={setLoc} />
        </section>

        <section className={`card space-y-3 p-4 md:p-5 ${pane("enlace")}`}>
          <h2 className="font-bold">Enlace de tu tienda</h2>
          <p className="text-sm text-slate-600">Compártelo por WhatsApp o ponlo en tu bio de Facebook/Instagram.</p>
          <div className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold break-all">{link}</div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="btn-ghost text-sm">
              <Copy className="h-4 w-4" /> {copied ? "¡Copiado!" : "Copiar"}
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Pide tu gas y agua a domicilio con ${business.name}: ${link}`)}`} target="_blank" className="btn-success text-sm">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          </div>
        </section>
      </div>

      <button onClick={save} disabled={saving} className="cta-primary shrink-0">
        {saving && <Spinner className="h-5 w-5" />} Guardar cambios
      </button>
    </main>
  );
}
