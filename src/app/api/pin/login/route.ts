import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { isLocked, PHONE_RE, PIN_RE, pinPassword, recordAttempt } from "@/lib/pin";

const WRONG = "Celular o PIN incorrecto";

export async function POST(request: Request) {
  const { phone, pin } = (await request.json().catch(() => ({}))) as { phone?: string; pin?: string };
  if (!phone || !pin || !PHONE_RE.test(phone) || !PIN_RE.test(pin)) {
    return NextResponse.json({ error: "Ingresa tu celular de 9 dígitos y tu PIN de 4 dígitos" }, { status: 400 });
  }
  if (await isLocked(phone)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." },
      { status: 429 },
    );
  }

  const admin = supabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, has_pin")
    .eq("phone", phone)
    .maybeSingle();
  if (!profile?.has_pin) {
    await recordAttempt(phone, false);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }

  const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
  const email = authUser.user?.email;
  if (!email) {
    await recordAttempt(phone, false);
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password: pinPassword(profile.id, pin) });
  await recordAttempt(phone, !error);
  if (error) return NextResponse.json({ error: WRONG }, { status: 401 });
  return NextResponse.json({ ok: true });
}
