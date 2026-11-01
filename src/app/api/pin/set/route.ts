import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { isWeakPin, PIN_RE, pinPassword, WEAK_PIN_MESSAGE } from "@/lib/pin";

// Un usuario con sesión (por ejemplo, entró con Google) crea o cambia su PIN.
export async function POST(request: Request) {
  const { pin } = (await request.json().catch(() => ({}))) as { pin?: string };
  if (!pin || !PIN_RE.test(pin)) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
  if (isWeakPin(pin)) return NextResponse.json({ error: WEAK_PIN_MESSAGE }, { status: 400 });

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Inicia sesión primero" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: profile } = await admin.from("profiles").select("phone").eq("id", data.user.id).single();
  if (!profile?.phone) {
    return NextResponse.json({ error: "Primero registra tu número de celular" }, { status: 400 });
  }

  const { error } = await admin.auth.admin.updateUserById(data.user.id, { password: pinPassword(data.user.id, pin) });
  if (error) return NextResponse.json({ error: "No se pudo guardar el PIN" }, { status: 500 });
  await admin.from("profiles").update({ has_pin: true }).eq("id", data.user.id);
  return NextResponse.json({ ok: true });
}
