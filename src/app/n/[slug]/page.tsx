"use client";

import { CategoryIcon, MapPin, MethodMark, Package, Search } from "@/components/icons";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Minus, Phone, Plus, ShoppingBag } from "lucide-react";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { Empty, ErrorText, FullLoader, Spinner, TopBar } from "@/components/ui";
import { CATEGORY, errorMessage, METHOD, money, telLink } from "@/lib/format";
import { useSession } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Business, PaymentMethod, Product } from "@/lib/types";

type Step = "productos" | "ubicacion" | "pago";

export default function StorePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { loading: sessionLoading, user, profile } = useSession();
  const [business, setBusiness] = useState<Business | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  // El carrito sobrevive al registro/inicio de sesión (sessionStorage), para no perder lo que el cliente eligió.
  const [cart, setCart] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`cart:${slug}`) ?? "{}");
    } catch {
      return {};
    }
  });
  // Tras registrarse volvemos directo al paso de ubicación (?paso=ubicacion) con el carrito intacto.
  const [rawStep, setStep] = useState<Step>(() => (search.get("paso") === "ubicacion" ? "ubicacion" : "productos"));
  const [location, setLocation] = useState<PickedLocation>({ point: null, address: "", reference: "" });
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data: b } = await supabase.from("businesses").select("*").eq("slug", slug).eq("active", true).maybeSingle<Business>();
      setBusiness(b);
      if (!b) return;
      const { data: p } = await supabase
        .from("products")
        .select("*")
        .eq("business_id", b.id)
        .eq("active", true)
        .order("sort_order")
        .returns<Product[]>();
      setProducts(p ?? []);
    })();
  }, [slug]);

  if (profile && !prefilled) {
    setPrefilled(true);
    if (profile.lat && profile.lng) {
      setLocation({
        point: { lat: profile.lat, lng: profile.lng },
        address: profile.address_text ?? "",
        reference: profile.reference ?? "",
      });
    }
  }

  const items = useMemo(() => products.filter((p) => cart[p.id] > 0), [products, cart]);
  const total = items.reduce((s, p) => s + Number(p.price) * cart[p.id], 0);
  const count = items.reduce((s, p) => s + cart[p.id], 0);
  const step: Step = count > 0 ? rawStep : "productos";
  const payData: Record<"yape" | "plin" | "otro", string | null | undefined> = {
    yape: business?.yape_number,
    plin: business?.plin_number,
    otro: business?.other_pay_value,
  };
  const methods = (["yape", "plin", "otro", "efectivo"] as PaymentMethod[]).filter(
    (m) => m === "efectivo" || Boolean(payData[m as "yape" | "plin" | "otro"]),
  );
  const methodLabel = (m: PaymentMethod) => (m === "otro" ? business?.other_pay_name || "Otra" : METHOD[m].label);

  const maxFor = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p?.stock == null ? 20 : Math.min(20, p.stock);
  };

  const setQty = (id: string, delta: number) =>
    setCart((c) => {
      const next = { ...c, [id]: Math.max(0, Math.min(maxFor(id), (c[id] ?? 0) + delta)) };
      try {
        sessionStorage.setItem(`cart:${slug}`, JSON.stringify(next));
      } catch {}
      return next;
    });

  function next() {
    setError("");
    if (step === "productos") {
      if (!user) {
        router.push(`/ingresar?next=${encodeURIComponent(`/n/${slug}?paso=ubicacion`)}`);
        return;
      }
      if (profile && !profile.onboarded) {
        router.push(`/bienvenida?next=${encodeURIComponent(`/n/${slug}?paso=ubicacion`)}`);
        return;
      }
      setStep("ubicacion");
    } else if (step === "ubicacion") {
      if (!location.point) return setError("Marca en el mapa dónde entregamos tu pedido");
      if (location.address.trim().length < 4) return setError("Escribe tu dirección");
      setStep("pago");
    }
  }

  async function submit() {
    if (!business || !location.point || !method) return setError("Elige cómo vas a pagar");
    const cash = cashAmount ? Number(cashAmount) : null;
    if (method === "efectivo" && cash !== null && cash < total) return setError("El monto con el que pagas debe cubrir el total");
    setSending(true);
    setError("");
    const { data, error } = await supabaseBrowser().rpc("create_order", {
      p_business_id: business.id,
      p_items: items.map((p) => ({ product_id: p.id, quantity: cart[p.id] })),
      p_payment_method: method,
      p_address_text: location.address,
      p_lat: location.point.lat,
      p_lng: location.point.lng,
      p_reference: location.reference,
      p_cash_amount: cash,
      p_notes: notes,
    });
    if (error) {
      setError(errorMessage(error));
      setSending(false);
      return;
    }
    try {
      sessionStorage.removeItem(`cart:${slug}`);
    } catch {}
    const orderId = (data as { id: string }).id;
    router.replace(`/cliente/pedido/${orderId}?nuevo=1`);
  }

  if (business === undefined || sessionLoading) return <FullLoader />;
  if (!business)
    return (
      <div className="p-4">
        <Empty icon={<Search className="h-12 w-12 text-slate-300" />} title="Negocio no encontrado" text="Revisa el enlace que te compartieron." action={<Link href="/cliente" className="btn-primary">Ver negocios</Link>} />
      </div>
    );

  const grouped = (["gas", "agua", "otro"] as const)
    .map((cat) => ({ cat, list: products.filter((p) => p.category === cat) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={step === "productos" ? business.name : step === "ubicacion" ? "¿Dónde entregamos?" : "¿Cómo pagas?"}
        back={step === "productos" ? (user ? "/cliente" : "/") : undefined}
        right={
          business.phone ? (
            <a href={telLink(business.phone)} className="rounded-full bg-agua-50 p-2 text-agua-700" aria-label="Llamar al negocio">
              <Phone className="h-5 w-5" />
            </a>
          ) : null
        }
      />

      <main className="mx-auto min-h-0 w-full max-w-3xl flex-1 space-y-3 overflow-y-auto p-3 md:p-5">
        {step === "productos" && (
          <>
            <section className="rounded-3xl bg-gradient-to-br from-agua-600 to-agua-500 p-4 text-white shadow-lg [@media(max-height:800px)]:hidden">
              <p className="text-sm opacity-90">Pide y paga al recibir</p>
              <p className="text-2xl font-extrabold">{business.name}</p>
              <p className="mt-2 text-sm opacity-90">Yape · Plin · Efectivo contra-entrega</p>
            </section>
            {grouped.length === 0 && <Empty icon={<Package className="h-12 w-12 text-slate-300" />} title="Sin productos por ahora" />}
            {grouped.map(({ cat, list }) => (
              <section key={cat}>
                <h2 className="mb-2 text-lg font-bold">
                  <span className="inline-flex items-center gap-2"><CategoryIcon category={cat} className="h-5 w-5" />{CATEGORY[cat].label}</span>
                </h2>
                <div className="grid gap-2 md:grid-cols-2">
                  {list.map((p) => (
                    <div key={p.id} className="card flex items-center gap-3 p-3">
                      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${p.category === "gas" ? "bg-gas-50" : "bg-agua-50"}`}>
                        <CategoryIcon category={p.category} className={`h-7 w-7 ${p.category === "gas" ? "text-gas-600" : "text-agua-600"}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold leading-tight">{p.name}</p>
                        {p.description && <p className="truncate text-xs text-slate-500">{p.description}</p>}
                        <p className="mt-1 font-extrabold text-agua-700">{money(p.price)}</p>
                        {p.stock !== null && p.stock > 0 && p.stock <= 5 && <p className="text-xs font-semibold text-orange-700">Quedan {p.stock}</p>}
                      </div>
                      {cart[p.id] ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => setQty(p.id, -1)} className="rounded-full bg-slate-100 p-2" aria-label="Quitar uno">
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-6 text-center text-lg font-bold">{cart[p.id]}</span>
                          <button onClick={() => setQty(p.id, 1)} disabled={cart[p.id] >= maxFor(p.id)} className="rounded-full bg-agua-600 p-2 text-white disabled:opacity-40" aria-label="Agregar uno">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        p.stock === 0 ? (
                          <span className="chip bg-slate-200 text-slate-600">Agotado</span>
                        ) : (
                          <button onClick={() => setQty(p.id, 1)} className="btn-ghost px-4 py-2 text-sm">
                            Agregar
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        {step === "ubicacion" && <LocationPicker value={location} onChange={setLocation} />}

        {step === "pago" && (
          <>
            <section className="card p-5">
              <h2 className="mb-3 font-bold">Tu pedido</h2>
              {items.map((p) => (
                <div key={p.id} className="flex justify-between py-1 text-sm">
                  <span>
                    {cart[p.id]} × {p.name}
                  </span>
                  <span className="font-semibold">{money(Number(p.price) * cart[p.id])}</span>
                </div>
              ))}
              <div className="mt-3 flex justify-between border-t border-dashed pt-3 text-lg font-extrabold">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              <p className="mt-3 text-sm text-slate-600"><MapPin className="mr-1 inline h-4 w-4 -mt-0.5 text-gas-600" />{location.address}</p>
            </section>

            <section>
              <h2 className="mb-3 font-bold">Pagas al recibir con…</h2>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(methods.length, 3)}, minmax(0, 1fr))` }}>
                {methods.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`rounded-3xl border-2 p-4 text-center transition ${method === m ? "border-transparent text-white shadow-lg" : "border-slate-200 bg-white"}`}
                    style={method === m ? { background: METHOD[m].color } : undefined}
                  >
                    <MethodMark method={m} className="mx-auto h-10 w-10 text-lg" />
                    <p className="mt-1 truncate font-bold">{methodLabel(m)}</p>
                  </button>
                ))}
              </div>
              {method === "efectivo" && (
                <div className="mt-4">
                  <label className="label">¿Con cuánto pagas? (para llevar tu vuelto)</label>
                  <input className="input" inputMode="decimal" placeholder={`Ej. ${Math.ceil(total / 10) * 10 || 50}`} value={cashAmount} onChange={(e) => setCashAmount(e.target.value.replace(/[^\d.]/g, ""))} />
                </div>
              )}
              {(method === "yape" || method === "plin" || method === "otro") && (
                <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  Pagarás cuando tu repartidor llegue a la puerta. Ahí te avisaremos y te mostraremos los datos de{" "}
                  <b>{methodLabel(method)}</b> para copiar, y podrás subir tu captura de pago.
                </p>
              )}
            </section>
            <div>
              <label className="label">Nota para el repartidor (opcional)</label>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. tocar el timbre 2 veces" />
            </div>
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </main>

      {count > 0 && (
        <div className="shrink-0 border-t border-slate-200 bg-white p-3">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            {step !== "productos" && (
              <button
                onClick={() => setStep(step === "pago" ? "ubicacion" : "productos")}
                className="btn-ghost shrink-0 px-4"
                aria-label="Volver al paso anterior"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {step === "pago" ? (
              <button onClick={submit} disabled={sending || !method} className="btn-gas flex-1 whitespace-nowrap">
                {sending && <Spinner className="h-5 w-5" />} Confirmar pedido · {money(total)}
              </button>
            ) : (
              <button onClick={next} className="btn-primary flex-1 justify-between gap-3 whitespace-nowrap">
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  {step === "productos" ? `${count} ${count === 1 ? "producto" : "productos"}` : "Continuar"}
                </span>
                <span>
                  {step === "productos" ? "Continuar · " : ""}
                  {money(total)}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
