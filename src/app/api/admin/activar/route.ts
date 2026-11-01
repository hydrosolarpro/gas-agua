import { NextResponse } from "next/server";
import { normalizeCode, safeEqual } from "@/lib/admin";
import {
  ADMIN_PHONE,
  createPinUser,
  isLocked,
  isWeakPin,
  PIN_RE,
  pinEmail,
  pinPassword,
  recordAttempt,
  WEAK_PIN_MESSAGE,
} from "@/lib/pin";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

const LOCK_KEY = "admin-setup";

async function adminProfile() {
  const { data } = await supabaseAdmin().from("profiles").select("id, phone").eq("is_admin", true).maybeSingle();
  return data;
}

async function phoneProfile() {
  const { data } = await supabaseAdmin().from("profiles").select("id, full_name, is_admin").eq("phone", ADMIN_PHONE).maybeSingle();
  return data;
}

// Estado para mostrar el formulario: ¿el administrador ya existe?
export async function GET() {
  const admin = await adminProfile();
  return NextResponse.json({
    activado: Boolean(admin),
    phone: ADMIN_PHONE.slice(0, 3) + " *** " + ADMIN_PHONE.slice(-3),
  });
}

/**
 * Crear un PIN nuevo para el administrador. El celular es siempre el reservado (ADMIN_PHONE) y hace falta
 * el código secreto (ADMIN_SETUP_CODE). Sirve para activar la cuenta la primera vez y para recuperar el acceso.
 */
export async function POST(request: Request) {
  const { pin, code } = (await request.json().catch(() => ({}))) as { pin?: string; code?: string };
  const expected = process.env.ADMIN_SETUP_CODE;
  if (!expected) return NextResponse.json({ error: "Esta función no está habilitada" }, { status: 503 });
  if (await isLocked(LOCK_KEY)) {
    return NextResponse.json({ error: "Demasiados intentos. Espera 15 minutos." }, { status: 429 });
  }
  if (!code || !safeEqual(normalizeCode(code), normalizeCode(expected))) {
    await recordAttempt(LOCK_KEY, false);
    return NextResponse.json({ error: "Código de activación incorrecto" }, { status: 401 });
  }
  if (!pin || !PIN_RE.test(pin)) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
  if (isWeakPin(pin)) return NextResponse.json({ error: WEAK_PIN_MESSAGE }, { status: 400 });

  // Solo puede haber un administrador y siempre es el del celular reservado.
  const current = await adminProfile();
  if (current && current.phone !== ADMIN_PHONE) {
    return NextResponse.json({ error: "No se puede cambiar este administrador" }, { status: 409 });
  }

  const admin = supabaseAdmin();
  const existing = await phoneProfile();
  let userId: string;
  if (existing) {
    userId = existing.id;
    const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password: pinPassword(userId, pin) });
    if (pwError) return NextResponse.json({ error: "No se pudo guardar el PIN" }, { status: 500 });
    const { error } = await admin.from("profiles").update({ is_admin: true, onboarded: true, has_pin: true }).eq("id", userId);
    if (error) return NextResponse.json({ error: "No se pudo guardar el PIN" }, { status: 500 });
  } else {
    try {
      userId = await createPinUser("Administrador", ADMIN_PHONE, pin, { allowAdminPhone: true });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    const { error } = await admin.from("profiles").update({ is_admin: true, onboarded: true }).eq("id", userId);
    if (error) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "No se pudo guardar el PIN" }, { status: 500 });
    }
  }
  await admin.from("platform_settings").update({ admin_phone: ADMIN_PHONE }).eq("id", 1);
  await recordAttempt(LOCK_KEY, true);

  const { data: u } = await admin.auth.admin.getUserById(userId);
  const supabase = await supabaseServer();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: u.user?.email ?? pinEmail(ADMIN_PHONE),
    password: pinPassword(userId, pin),
  });
  if (signInError) return NextResponse.json({ error: "PIN guardado, pero no se pudo iniciar sesión. Ingresa con tu PIN." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
