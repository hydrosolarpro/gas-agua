"use client";

import { useState } from "react";
import { KeyRound, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Bike, Phone } from "@/components/icons";
import { PhoneInput } from "@/components/PinInput";
import { usePanel } from "@/components/panel-context";
import { Empty, ErrorText, Sheet, Spinner } from "@/components/ui";
import { useDrivers, type Driver } from "@/components/useBusinessOrders";
import { waLink } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

async function api(method: string, body: Record<string, unknown>) {
  const res = await fetch("/api/drivers", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function RepartidoresPage() {
  const { business, profile } = usePanel();
  const { drivers, reload } = useDrivers(business.id);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function add() {
    setSaving(true);
    setError("");
    const { ok, data } = await api("POST", { fullName: name, phone });
    setSaving(false);
    if (!ok) return setError(data.error ?? "No se pudo agregar");
    setOpen(false);
    setNotice(
      data.estado === "invitado"
        ? "Ese celular ya tenía cuenta: le enviamos una invitación. Empezará a repartir cuando la acepte."
        : "Listo. Envíale el acceso por WhatsApp para que cree su PIN y entre.",
    );
    setName("");
    setPhone("");
    reload();
  }

  async function act(d: Driver, method: "PATCH" | "DELETE", confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusyId(d.user_id);
    setError("");
    setNotice("");
    const { ok, data } = await api(method, { userId: d.user_id });
    if (!ok) setError(data.error ?? "No se pudo completar la acción");
    else if (method === "PATCH") setNotice("Acceso reiniciado. Envíale el enlace por WhatsApp para que cree un PIN nuevo.");
    setBusyId(null);
    reload();
  }

  async function addMyself() {
    if (!profile.phone) return setError("Primero agrega tu celular en Mi cuenta");
    setBusyId(profile.id);
    setError("");
    setNotice("");
    const { ok, data } = await api("POST", { fullName: profile.full_name || "Dueño", phone: profile.phone });
    setBusyId(null);
    if (!ok) return setError(data.error ?? "No se pudo agregar");
    setNotice("Listo: ahora también repartes tú. Entra como repartidor con tu mismo celular y PIN de dueño.");
    reload();
  }

  async function toggle(d: Driver) {
    await supabaseBrowser().from("business_members").update({ active: !d.active }).eq("business_id", business.id).eq("user_id", d.user_id);
    reload();
  }

  const accessLink = (d: Driver) =>
    waLink(
      d.profiles.phone,
      `Hola ${d.profiles.full_name}, ya estás registrado como repartidor en ${business.name}. Entra aquí con tu celular y crea tu PIN: ${location.origin}/ingresar?rol=repartidor&tel=${d.profiles.phone}&nuevo=1`,
    );

  return (
    <main className="mx-auto max-w-6xl space-y-3 p-3 md:p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Mi equipo</h1>
        <button
          onClick={() => {
            setError("");
            setOpen(true);
          }}
          className="btn-primary px-4 py-2.5 text-sm"
        >
          <Plus className="h-4 w-4" /> Repartidor
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Registra a cada repartidor solo con su nombre y celular. Él crea su propio PIN la primera vez que entra y ve solo los pedidos de tu negocio.
      </p>
      {notice && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}
      <ErrorText>{error}</ErrorText>

      {!drivers.some((d) => d.user_id === profile.id) && (
        <section className="card space-y-3 p-4">
          <p className="font-bold">¿Repartes tú también?</p>
          <p className="text-sm text-slate-600">
            Puedes repartir con tu mismo celular y PIN de dueño, o registrar otro celular distinto con el botón «+ Repartidor».
          </p>
          <button onClick={addMyself} disabled={busyId === profile.id} className="btn-outline w-full">
            {busyId === profile.id ? <Spinner className="h-4 w-4" /> : <Bike className="h-5 w-5" />} Repartir yo mismo ({profile.phone ?? "sin celular"})
          </button>
        </section>
      )}

      {drivers.length === 0 && <Empty icon={<Bike className="h-12 w-12 text-slate-300" />} title="Aún no tienes repartidores" text="También puedes repartir tú mismo desde la vista de pedidos." />}
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {drivers.map((d) => {
          const yo = d.user_id === profile.id;
          const pendiente = !d.accepted;
          const sinPin = d.accepted && !d.profiles.has_pin;
          return (
            <article key={d.user_id} className={`card space-y-3 p-4 ${d.active || pendiente || sinPin ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-agua-100">
                  <Bike className="h-6 w-6 text-agua-700" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {d.profiles.full_name} {yo && <span className="chip bg-agua-100 text-agua-700">Tú (dueño)</span>}
                  </p>
                  <p className="text-sm text-slate-500">
                    <Phone className="mr-1 inline h-3.5 w-3.5 -mt-0.5" />
                    {d.profiles.phone}
                  </p>
                </div>
                {pendiente ? (
                  <span className="chip bg-amber-100 text-amber-800">Esperando que acepte</span>
                ) : sinPin ? (
                  <span className="chip bg-orange-100 text-orange-800">Debe crear su PIN</span>
                ) : (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <input type="checkbox" checked={d.active} onChange={() => toggle(d)} className="h-5 w-5 accent-teal-600" /> Activo
                  </label>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {sinPin && d.profiles.phone && (
                  <a href={accessLink(d)} target="_blank" className="btn-success px-4 py-2 text-sm">
                    <MessageCircle className="h-4 w-4" /> Enviar acceso por WhatsApp
                  </a>
                )}
                {yo && (
                  <p className="w-full text-xs text-slate-500">
                    Entras como repartidor en «Soy repartidor» con tu mismo celular y PIN. Verás los pedidos que te asignes.
                  </p>
                )}
                {d.accepted && !yo && (
                  <button
                    onClick={() => act(d, "PATCH", sinPin ? undefined : `¿Reiniciar el acceso de ${d.profiles.full_name}? Tendrá que crear un PIN nuevo.`)}
                    disabled={busyId === d.user_id}
                    className="btn-outline px-4 py-2 text-sm"
                  >
                    {busyId === d.user_id ? <Spinner className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}{" "}
                    {sinPin ? "Renovar plazo" : "Reiniciar PIN"}
                  </button>
                )}
                <button
                  onClick={() => act(d, "DELETE", yo ? "¿Dejar de repartir? Seguirás siendo dueño." : `¿Quitar a ${d.profiles.full_name} de tu equipo? Ya no podrá repartir tus pedidos.`)}
                  disabled={busyId === d.user_id}
                  className="btn-outline ml-auto px-4 py-2 text-sm text-rose-600"
                >
                  <Trash2 className="h-4 w-4" /> {pendiente ? "Anular" : yo ? "Dejar de repartir" : "Quitar repartidor"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Nuevo repartidor">
        <div className="space-y-4">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Carlos Mamani" autoFocus />
          </div>
          <div>
            <label className="label">Celular</label>
            <PhoneInput value={phone} onChange={setPhone} />
          </div>
          <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            No necesitas darle un PIN: lo crea él al entrar por primera vez. Si ese celular ya tiene cuenta, le llegará una invitación que debe aceptar.
          </p>
          <ErrorText>{error}</ErrorText>
          <button onClick={add} disabled={saving} className="btn-primary w-full">
            {saving && <Spinner className="h-5 w-5" />} Registrar repartidor
          </button>
        </div>
      </Sheet>
    </main>
  );
}
