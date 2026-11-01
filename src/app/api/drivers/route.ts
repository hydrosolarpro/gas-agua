import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { createPinUser, PHONE_RE, PIN_RE } from "@/lib/pin";

// El dueño da de alta a un repartidor que entrará con celular + PIN.
export async function POST(request: Request) {
  const { fullName, phone, pin } = (await request.json().catch(() => ({}))) as {
    fullName?: string;
    phone?: string;
    pin?: string;
  };

  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Inicia sesión primero" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data: business } = await admin.from("businesses").select("id").eq("owner_id", data.user.id).maybeSingle();
  if (!business) return NextResponse.json({ error: "Solo el dueño del negocio puede agregar repartidores" }, { status: 403 });

  const name = fullName?.trim() ?? "";
  if (name.length < 2) return NextResponse.json({ error: "Escribe el nombre del repartidor" }, { status: 400 });
  if (!phone || !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "El celular debe tener 9 dígitos y empezar con 9" }, { status: 400 });
  }

  const { data: existing } = await admin.from("profiles").select("id, role").eq("phone", phone).maybeSingle();
  let userId: string;
  if (existing) {
    if (existing.id === data.user.id || existing.role === "dueno") {
      return NextResponse.json({ error: "Ese celular pertenece a un dueño de negocio" }, { status: 400 });
    }
    userId = existing.id;
    await admin.from("profiles").update({ role: "repartidor", onboarded: true }).eq("id", userId);
  } else {
    if (!pin || !PIN_RE.test(pin)) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
    try {
      userId = await createPinUser(name, phone, pin);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    await admin.from("profiles").update({ role: "repartidor", onboarded: true }).eq("id", userId);
  }

  const { error } = await admin
    .from("business_members")
    .upsert({ business_id: business.id, user_id: userId, active: true });
  if (error) return NextResponse.json({ error: "No se pudo agregar al repartidor" }, { status: 500 });
  return NextResponse.json({ ok: true, existing: Boolean(existing) });
}
