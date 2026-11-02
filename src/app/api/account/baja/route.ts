import { NextResponse } from "next/server";
import { isLocked, PIN_RE, recordAttempt, verifyPin } from "@/lib/pin";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// El cliente se da de baja con su PIN. Se cierra la cuenta y se borran sus datos de contacto; los negocios conservan
// el historial de sus pedidos (con el nombre y celular que el cliente dio en cada uno).
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Inicia sesión primero" }, { status: 401 });
  const userId = data.user.id;

  const { pin } = (await request.json().catch(() => ({}))) as { pin?: string };
  if (!pin || !PIN_RE.test(pin)) return NextResponse.json({ error: "Escribe tu PIN de 4 dígitos" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("role, is_admin, full_name, deactivated_at").eq("id", userId).maybeSingle();
  if (!p || p.deactivated_at) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  if (p.role !== "cliente" || p.is_admin) {
    return NextResponse.json({ error: "Esta cuenta también es de dueño, repartidor o administrador. Pide la baja a soporte." }, { status: 400 });
  }
  const [{ count: owns }, { count: staff }, { count: active }] = await Promise.all([
    db.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", userId),
    db.from("business_members").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", userId).in("status", ["pendiente", "aceptado", "en_camino"]),
  ]);
  if ((owns ?? 0) > 0 || (staff ?? 0) > 0) {
    return NextResponse.json({ error: "Tu cuenta tiene un negocio o invitaciones de reparto. Pide la baja a soporte." }, { status: 400 });
  }
  if ((active ?? 0) > 0) {
    return NextResponse.json({ error: "Tienes un pedido en curso. Espera a que termine o cancélalo antes de darte de baja." }, { status: 400 });
  }

  const key = `baja:${userId}`;
  if (await isLocked(key)) return NextResponse.json({ error: "Demasiados intentos. Espera 15 minutos." }, { status: 429 });
  const ok = await verifyPin(userId, pin);
  await recordAttempt(key, ok);
  if (!ok) return NextResponse.json({ error: "El PIN no coincide" }, { status: 401 });

  // Cerrar la cuenta: sin ingreso posible, sin celular ni dirección, y el celular queda libre.
  const { error: authError } = await db.auth.admin.updateUserById(userId, {
    email: `baja-${userId}@pin.aguagasexpress.app`,
    password: crypto.randomUUID() + crypto.randomUUID(),
    ban_duration: "876000h",
  });
  if (authError) return NextResponse.json({ error: "No se pudo completar la baja. Inténtalo otra vez." }, { status: 500 });
  const { error } = await db
    .from("profiles")
    .update({
      onboarded: false,
      phone: null,
      has_pin: false,
      address_text: null,
      reference: null,
      lat: null,
      lng: null,
      last_business_id: null,
      full_name: `${p.full_name} (baja)`,
      deactivated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return NextResponse.json({ error: "No se pudo completar la baja. Escribe a soporte." }, { status: 500 });

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
