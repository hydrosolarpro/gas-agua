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

async function adminExists() {
  const { count } = await supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }).eq("is_admin", true);
  return (count ?? 0) > 0;
}

async function adminPhoneProfile() {
  const { data } = await supabaseAdmin().from("profiles").select("id, full_name").eq("phone", ADMIN_PHONE).maybeSingle();
  return data;
}

// ¿Ya está activado el administrador? ¿Ya existe una cuenta con su celular? (el formulario lo usa para mostrarse)
export async function GET() {
  const existing = await adminPhoneProfile();
  return NextResponse.json({
    activado: await adminExists(),
    existe: Boolean(existing),
    nombre: existing?.full_name ?? "",
    phone: ADMIN_PHONE.slice(0, 3) + " *** " + ADMIN_PHONE.slice(-3),
  });
}

// Activación única del administrador: celular reservado + código secreto de activación + PIN que elige la persona.
// Si ya existe una cuenta con ese celular (p. ej. creada probando), se convierte en administradora.
export async function POST(request: Request) {
  const { fullName, pin, code } = (await request.json().catch(() => ({}))) as { fullName?: string; pin?: string; code?: string };
  const expected = process.env.ADMIN_SETUP_CODE;
  if (!expected) return NextResponse.json({ error: "La activación no está habilitada" }, { status: 503 });
  if (await adminExists()) return NextResponse.json({ error: "El administrador ya fue activado" }, { status: 409 });
  if (await isLocked(LOCK_KEY)) {
    return NextResponse.json({ error: "Demasiados intentos. Espera 15 minutos." }, { status: 429 });
  }
  if (!code || !safeEqual(normalizeCode(code), normalizeCode(expected))) {
    await recordAttempt(LOCK_KEY, false);
    return NextResponse.json({ error: "Código de activación incorrecto" }, { status: 401 });
  }
  const name = fullName?.trim() ?? "";
  if (name.length < 2) return NextResponse.json({ error: "Escribe tu nombre" }, { status: 400 });
  if (!pin || !PIN_RE.test(pin)) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
  if (isWeakPin(pin)) return NextResponse.json({ error: WEAK_PIN_MESSAGE }, { status: 400 });

  const admin = supabaseAdmin();
  const existing = await adminPhoneProfile();
  let userId: string;
  if (existing) {
    // Ya hay una cuenta con este celular: se convierte en administradora y se fija el PIN elegido.
    userId = existing.id;
    const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password: pinPassword(userId, pin) });
    if (pwError) return NextResponse.json({ error: "No se pudo guardar el PIN" }, { status: 500 });
    const { error } = await admin
      .from("profiles")
      .update({ is_admin: true, onboarded: true, has_pin: true, full_name: name })
      .eq("id", userId);
    if (error) return NextResponse.json({ error: "No se pudo activar el administrador" }, { status: 500 });
  } else {
    try {
      userId = await createPinUser(name, ADMIN_PHONE, pin, { allowAdminPhone: true });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    const { error } = await admin.from("profiles").update({ is_admin: true, onboarded: true }).eq("id", userId);
    if (error) {
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "No se pudo activar el administrador" }, { status: 500 });
    }
  }
  await admin.from("platform_settings").update({ admin_name: name, admin_phone: ADMIN_PHONE }).eq("id", 1);
  await recordAttempt(LOCK_KEY, true);

  // Email interno de la cuenta (se obtiene del propio usuario).
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const supabase = await supabaseServer();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: u.user?.email ?? pinEmail(ADMIN_PHONE),
    password: pinPassword(userId, pin),
  });
  if (signInError) return NextResponse.json({ error: "Activado, pero no se pudo iniciar sesión. Ingresa con tu PIN." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
