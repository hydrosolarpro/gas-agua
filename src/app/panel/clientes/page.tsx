"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, MessageCircle, Search as SearchIcon, UserPlus, Users } from "lucide-react";
import { usePanel } from "@/components/panel-context";
import { Empty, ErrorText, FullLoader, Sheet, Spinner } from "@/components/ui";
import { dateTime, errorMessage, waLink } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

type CustomerRow = {
  customer_id: string;
  source: "invitacion" | "pedido";
  created_at: string;
  profile: { full_name: string; phone: string | null; role: string; has_pin: boolean; deactivated_at: string | null } | null;
};
type InviteRow = { id: string; note: string | null; expires_at: string; uses: number; revoked: boolean; created_at: string };

export default function Clientes() {
  const { business } = usePanel();
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null);
  // Celular que el cliente dio en sus pedidos: se conserva aunque se haya dado de baja.
  const [oldPhones, setOldPhones] = useState<Record<string, string>>({});
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [days, setDays] = useState(30);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const db = supabaseBrowser();
    const [c, i] = await Promise.all([
      db
        .from("business_customers")
        .select("customer_id, source, created_at, profile:profiles!business_customers_customer_id_fkey(full_name, phone, role, has_pin, deactivated_at)")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .returns<CustomerRow[]>(),
      db
        .from("customer_invitations")
        .select("id, note, expires_at, uses, revoked, created_at")
        .eq("business_id", business.id)
        .order("created_at", { ascending: false })
        .returns<InviteRow[]>(),
    ]);
    setCustomers(c.data ?? []);
    const gone = (c.data ?? []).filter((x) => x.profile?.deactivated_at).map((x) => x.customer_id);
    if (gone.length) {
      const { data: o } = await db.from("orders").select("customer_id, customer_phone").eq("business_id", business.id).in("customer_id", gone).not("customer_phone", "is", null).order("created_at", { ascending: false }).returns<{ customer_id: string; customer_phone: string }[]>();
      const m: Record<string, string> = {};
      for (const r of o ?? []) m[r.customer_id] ??= r.customer_phone;
      setOldPhones(m);
    }
    setInvites(i.data ?? []);
  }, [business.id]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [load]);

  async function create() {
    setBusy(true);
    setError("");
    const { data, error: e } = await supabaseBrowser().rpc("owner_create_customer_invitation", { p_note: note || null, p_days: days });
    setBusy(false);
    if (e) return setError(errorMessage(e));
    setLink(`${location.origin}/unirse/${data as string}`);
    load();
  }

  function close() {
    setOpen(false);
    setLink("");
    setNote("");
    setCopied(false);
    setError("");
  }

  async function resetPin(c: CustomerRow) {
    const name = c.profile?.full_name || "este cliente";
    if (!confirm(`¿Reiniciar el PIN de ${name}? Elegirá uno nuevo al entrar.`)) return;
    setBusyId(c.customer_id);
    setError("");
    setNotice("");
    const res = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: c.customer_id }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) setError(data.error ?? "No se pudo reiniciar el PIN");
    else setNotice(`Listo. Envíale el enlace por WhatsApp para que ${name} elija su PIN nuevo.`);
    load();
  }

  async function revoke(id: string) {
    const { error: e } = await supabaseBrowser().rpc("owner_revoke_customer_invitation", { p_id: id });
    if (e) setError(errorMessage(e));
    load();
  }

  if (!customers) return <FullLoader />;

  const term = q.trim().toLowerCase();
  const list = customers.filter((c) => !term || [c.profile?.full_name, c.profile?.phone].some((v) => (v ?? "").toLowerCase().includes(term)));
  const active = invites.filter((i) => !i.revoked && new Date(i.expires_at) > new Date());

  return (
    <main className="mx-auto max-w-6xl space-y-3 p-3 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Mis Clientes</h1>
        <button onClick={() => setOpen(true)} className="btn-gas px-4 py-2.5 text-sm">
          <UserPlus className="h-4 w-4" /> Invitar clientes
        </button>
      </div>
      <p className="text-sm text-slate-600">
        Invita a tus clientes con un enlace. Quien se registre con él queda en tu lista. También aparecen los que te hacen un pedido.
      </p>

      {customers.length > 0 && (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input className="input pl-12" placeholder="Buscar por nombre o celular" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      {notice && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</p>}
      <ErrorText>{error}</ErrorText>

      {customers.length === 0 && (
        <Empty
          icon={<Users className="h-12 w-12 text-slate-300" />}
          title="Aún no tienes clientes"
          text="Crea una invitación y compártela por WhatsApp con tus clientes."
          action={<button onClick={() => setOpen(true)} className="btn-gas">Invitar clientes</button>}
        />
      )}
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => {
          const otroDueno = c.profile?.role === "dueno" && c.customer_id !== business.owner_id;
          const baja = Boolean(c.profile?.deactivated_at);
          const puedeReiniciar = c.profile?.role === "cliente" && !baja;
          const sinPin = puedeReiniciar && c.profile?.has_pin === false;
          const phone = c.profile?.phone;
          return (
            <article key={c.customer_id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{(c.profile?.full_name || "Cliente").replace(/ \(baja\)$/, "")}</p>
                <p className="truncate text-sm text-slate-500">{c.profile?.phone ?? oldPhones[c.customer_id]}</p>
                {baja && <p className="text-xs font-semibold text-slate-500">Se dio de baja el {dateTime(c.profile!.deactivated_at!)} · sus pedidos siguen en tu historial</p>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className={`chip ${c.source === "invitacion" ? "bg-agua-100 text-agua-700" : "bg-slate-100 text-slate-700"}`}>
                    {c.source === "invitacion" ? "Invitado" : "Hizo un pedido"}
                  </span>
                  {otroDueno && <span className="chip bg-violet-100 text-violet-800">Dueño de otro negocio</span>}
                  {sinPin && !baja && <span className="chip bg-orange-100 text-orange-800">Debe crear su PIN</span>}
                  {baja && <span className="chip bg-slate-200 text-slate-700">Dado de baja</span>}
                  <span className="text-xs text-slate-400">{dateTime(c.created_at)}</span>
                </div>
              </div>
              {puedeReiniciar && (
                <button
                  onClick={() => resetPin(c)}
                  disabled={busyId === c.customer_id}
                  className="rounded-full bg-slate-100 p-2.5 text-slate-700"
                  aria-label={`Reiniciar PIN de ${c.profile?.full_name}`}
                  title="Reiniciar PIN"
                >
                  {busyId === c.customer_id ? <Spinner className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
                </button>
              )}
              {phone && (
                <a
                  href={
                    sinPin
                      ? waLink(
                          phone,
                          `Hola ${c.profile?.full_name}, en ${business.name} reiniciamos tu PIN. Entra aquí con tu celular y elige uno nuevo: ${location.origin}/ingresar?tel=${phone}&nuevo=1`,
                        )
                      : waLink(phone, `Hola ${c.profile?.full_name}, te escribimos de ${business.name}.`)
                  }
                  target="_blank"
                  className="rounded-full bg-emerald-50 p-2.5 text-emerald-700"
                  aria-label={`WhatsApp a ${c.profile?.full_name}`}
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
              )}
            </article>
          );
        })}
      </div>

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">Invitaciones activas</h2>
          {active.map((i) => (
            <div key={i.id} className="card flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{i.note ?? "Sin nombre"}</p>
                <p className="text-xs text-slate-500">
                  {i.uses} {i.uses === 1 ? "registro" : "registros"} · vence {dateTime(i.expires_at)}
                </p>
              </div>
              <button onClick={() => revoke(i.id)} className="btn-outline px-4 py-2 text-sm text-rose-600">
                Anular
              </button>
            </div>
          ))}
        </section>
      )}

      <Sheet open={open} onClose={close} title="Invitar clientes">
        {!link ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Crea un enlace y compártelo. Cada cliente que lo abra se registra y queda en tu lista. Puedes usarlo con varias personas.
            </p>
            <div>
              <label className="label">Nombre de la invitación (opcional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Vecinos de la cuadra 5" />
            </div>
            <div>
              <label className="label">El enlace vale por</label>
              <div className="grid grid-cols-3 gap-2">
                {[30, 90, 180].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`rounded-2xl border-2 px-2 py-2.5 text-sm font-bold transition ${days === d ? "border-agua-500 bg-agua-50 text-agua-700" : "border-slate-200"}`}
                  >
                    {d} días
                  </button>
                ))}
              </div>
            </div>
            <ErrorText>{error}</ErrorText>
            <button onClick={create} disabled={busy} className="btn-primary w-full">
              {busy && <Spinner className="h-5 w-5" />} Crear enlace de invitación
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
              Enlace listo. <b>Cópialo ahora</b>: por seguridad no se vuelve a mostrar.
            </p>
            <div className="break-all rounded-2xl bg-slate-50 p-3 text-sm font-semibold">{link}</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  setCopied(true);
                }}
                className="btn-ghost text-sm"
              >
                <Copy className="h-4 w-4" /> {copied ? "¡Copiado!" : "Copiar"}
              </button>
              <a
                href={waLink("", `Hola, te invito a pedir tu gas y agua con ${business.name} desde tu teléfono. Regístrate aquí: ${link}`)}
                target="_blank"
                className="btn-success text-sm"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </div>
            <button onClick={close} className="btn-outline w-full">
              Listo
            </button>
          </div>
        )}
      </Sheet>
    </main>
  );
}
