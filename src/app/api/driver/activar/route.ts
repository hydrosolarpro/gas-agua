import { NextResponse } from "next/server";
import { isLocked, isWeakPin, PHONE_RE, PIN_RE, pinEmail, pinPassword, recordAttempt, WEAK_PIN_MESSAGE } from "@/lib/pin";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

const NOT_PENDING =
  "No hay un acceso pendiente para este celular. Si ya tienes cuenta con este número (por ejemplo de cliente o dueño), entra por «Ingresar» con tu PIN de siempre y acepta la invitación. Si no, pide a tu negocio que te registre o que reinicie tu PIN.";

// Crear un PIN nuevo (repartidor o cliente): solo se puede mientras el dueño del negocio lo haya registrado o reiniciado, y dentro del plazo.
export async function POST(request: Request) {
  const { phone, pin } = (await request.json().catch(() => ({}))) as { phone?: string; pin?: string };
  if (!phone || !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "El celular debe tener 9 dígitos y empezar con 9" }, { status: 400 });
  }
  if (!pin || !PIN_RE.test(pin)) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
  if (isWeakPin(pin)) return NextResponse.json({ error: WEAK_PIN_MESSAGE }, { status: 400 });

  const key = `setup:${phone}`;
  if (await isLocked(key)) return NextResponse.json({ error: "Demasiados intentos. Espera 15 minutos." }, { status: 429 });

  const db = supabaseAdmin();
  const { data: p } = await db
    .from("profiles")
    .select("id, role, has_pin, is_admin, pin_setup_until")
    .eq("phone", phone)
    .maybeSingle();
  // Repartidor: registrado y aceptado por un negocio. Cliente: está en la lista de algún negocio.
  const { count } = p
    ? p.role === "repartidor"
      ? await db
          .from("business_members")
          .select("user_id", { count: "exact", head: true })
          .eq("user_id", p.id)
          .eq("active", true)
          .eq("accepted", true)
      : p.role === "cliente"
        ? await db.from("business_customers").select("customer_id", { count: "exact", head: true }).eq("customer_id", p.id)
        : { count: 0 }
    : { count: 0 };
  const open =
    p &&
    (p.role === "repartidor" || p.role === "cliente") &&
    !p.has_pin &&
    !p.is_admin &&
    (count ?? 0) > 0 &&
    p.pin_setup_until &&
    new Date(p.pin_setup_until) > new Date();
  if (!open || !p) {
    await recordAttempt(key, false);
    return NextResponse.json({ error: NOT_PENDING }, { status: 404 });
  }

  const { error: pwError } = await db.auth.admin.updateUserById(p.id, { password: pinPassword(p.id, pin) });
  if (pwError) return NextResponse.json({ error: "No se pudo guardar el PIN" }, { status: 500 });
  await db.from("profiles").update({ has_pin: true, pin_setup_until: null }).eq("id", p.id);
  await recordAttempt(key, true);

  const { data: u } = await db.auth.admin.getUserById(p.id);
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: u.user?.email ?? pinEmail(phone), password: pinPassword(p.id, pin) });
  if (error) return NextResponse.json({ error: "PIN guardado. Ingresa con tu celular y tu PIN." }, { status: 200 });
  return NextResponse.json({ ok: true, rol: p.role });
}
