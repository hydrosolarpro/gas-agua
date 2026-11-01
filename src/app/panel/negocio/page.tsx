"use client";

import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { PhoneInput } from "@/components/PinInput";
import { ErrorText, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { usePanel } from "@/components/panel-context";

export default function NegocioPage() {
  const { business, reload } = usePanel();
  const [name, setName] = useState(business.name);
  const [phone, setPhone] = useState(business.phone ?? "");
  const [yape, setYape] = useState(business.yape_number ?? "");
  const [plin, setPlin] = useState(business.plin_number ?? "");
  const [holder, setHolder] = useState(business.payment_holder ?? "");
  const [loc, setLoc] = useState<PickedLocation>({
    point: business.lat && business.lng ? { lat: business.lat, lng: business.lng } : null,
    address: business.address_text ?? "",
    reference: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const link = `${typeof window === "undefined" ? "" : location.origin}/n/${business.slug}`;

  async function save() {
    if (name.trim().length < 2) return setError("Escribe el nombre del negocio");
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
        address_text: loc.address || null,
        lat: loc.point?.lat ?? null,
        lng: loc.point?.lng ?? null,
      })
      .eq("id", business.id);
    setSaving(false);
    if (error) return setError(errorMessage(error));
    setMsg("¡Cambios guardados!");
    reload();
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4 md:p-8">
      <h1 className="text-2xl font-extrabold">Mi negocio</h1>

      <section className="card space-y-3 p-5">
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

      <section className="card space-y-4 p-5">
        <h2 className="font-bold">Datos del negocio</h2>
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Celular del negocio</label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>
      </section>

      <section className="card space-y-4 p-5">
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
        <div>
          <label className="label">Nombre del titular (opcional)</label>
          <input className="input" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Como aparece en Yape/Plin" />
        </div>
        <p className="text-xs text-slate-500">Si dejas Yape o Plin vacío, esa opción no se ofrece a tus clientes. El efectivo siempre está disponible.</p>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">Ubicación del local</h2>
        <LocationPicker value={loc} onChange={setLoc} />
      </section>

      <ErrorText>{error}</ErrorText>
      {msg && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{msg}</p>}
      <button onClick={save} disabled={saving} className="btn-primary w-full">
        {saving && <Spinner className="h-5 w-5" />} Guardar cambios
      </button>
    </main>
  );
}
