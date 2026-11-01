import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { createPinUser, isWeakPin, PHONE_RE, PIN_RE, pinEmail, pinPassword, WEAK_PIN_MESSAGE } from "@/lib/pin";

export async function POST(request: Request) {
  const { fullName, phone, pin } = (await request.json().catch(() => ({}))) as {
    fullName?: string;
    phone?: string;
    pin?: string;
  };
  const name = fullName?.trim() ?? "";
  if (name.length < 2) return NextResponse.json({ error: "Escribe tu nombre" }, { status: 400 });
  if (!phone || !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "El celular debe tener 9 dígitos y empezar con 9" }, { status: 400 });
  }
  if (!pin || !PIN_RE.test(pin)) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
  if (isWeakPin(pin)) return NextResponse.json({ error: WEAK_PIN_MESSAGE }, { status: 400 });

  const { data: existing } = await supabaseAdmin().from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Ese celular ya tiene cuenta. Ingresa con tu PIN." }, { status: 409 });
  }

  let userId: string;
  try {
    userId = await createPinUser(name, phone, pin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: pinEmail(phone),
    password: pinPassword(userId, pin),
  });
  if (error) return NextResponse.json({ error: "Cuenta creada, pero no se pudo iniciar sesión" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
