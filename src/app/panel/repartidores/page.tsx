"use client";

import { Bike, Phone } from "@/components/icons";

import { useState } from "react";
import { Plus } from "lucide-react";
import { PhoneInput, PinInput } from "@/components/PinInput";
import { Empty, ErrorText, Sheet, Spinner } from "@/components/ui";
import { useDrivers } from "@/components/useBusinessOrders";
import { supabaseBrowser } from "@/lib/supabase/client";
import { usePanel } from "@/components/panel-context";

export default function RepartidoresPage() {
  const { business } = usePanel();
  const { drivers, reload } = useDrivers(business.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: name, phone, pin }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "No se pudo agregar");
    setOpen(false);
    setName("");
    setPhone("");
    setPin("");
    reload();
  }

  async function toggle(userId: string, active: boolean) {
    await supabaseBrowser().from("business_members").update({ active: !active }).eq("business_id", business.id).eq("user_id", userId);
    reload();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Mi equipo</h1>
        <button onClick={() => { setError(""); setOpen(true); }} className="btn-primary px-4 py-2.5 text-sm">
          <Plus className="h-4 w-4" /> Repartidor
        </button>
      </div>
      <p className="text-sm text-slate-600">Cada repartidor entra con su celular y un PIN de 4 dígitos que tú le das. Ve solo los pedidos de tu negocio.</p>

      {drivers.length === 0 && <Empty icon={<Bike className="h-12 w-12 text-slate-300" />} title="Aún no tienes repartidores" text="También puedes repartir tú mismo desde la vista de pedidos." />}
      <div className="space-y-3">
        {drivers.map((d) => (
          <div key={d.user_id} className={`card flex items-center gap-4 p-4 ${d.active ? "" : "opacity-60"}`}>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-agua-100"><Bike className="h-6 w-6 text-agua-700" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{d.profiles.full_name}</p>
              <p className="text-sm text-slate-500"><Phone className="mr-1 inline h-3.5 w-3.5 -mt-0.5" />{d.profiles.phone}</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <input type="checkbox" checked={d.active} onChange={() => toggle(d.user_id, d.active)} className="h-5 w-5 accent-teal-600" /> Activo
            </label>
          </div>
        ))}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Nuevo repartidor">
        <div className="space-y-4">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Carlos Mamani" />
          </div>
          <div>
            <label className="label">Celular</label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>
          <PinInput value={pin} onChange={setPin} label="PIN de 4 dígitos para él" />
          <p className="text-center text-xs text-slate-500">Si ese celular ya tiene cuenta, se agrega a tu equipo y conserva su PIN.</p>
          <ErrorText>{error}</ErrorText>
          <button onClick={add} disabled={saving} className="btn-primary w-full">
            {saving && <Spinner className="h-5 w-5" />} Agregar repartidor
          </button>
        </div>
      </Sheet>
    </main>
  );
}
