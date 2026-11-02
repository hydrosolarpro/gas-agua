import { NextResponse } from "next/server";
import { hashToken } from "@/lib/admin";
import { authenticateExisting, createPinUser, isWeakPin, PHONE_RE, PIN_RE, pinEmail, pinPassword, WEAK_PIN_MESSAGE } from "@/lib/pin";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Alta de un dueño de negocio a partir de una invitación. Es la ÚNICA forma de crear un negocio.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    fullName?: string;
    phone?: string;
    pin?: string;
    businessName?: string;
    yape?: string;
    plin?: string;
  };
  const token = body.token ?? "";
  const name = body.fullName?.trim() ?? "";
  const businessName = body.businessName?.trim() ?? "";
  const clean = (v?: string) => (v && PHONE_RE.test(v) ? v : null);

  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "Invitación no válida" }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: "Escribe tu nombre" }, { status: 400 });
  if (businessName.length < 2) return NextResponse.json({ error: "Escribe el nombre de tu negocio" }, { status: 400 });
  if (!body.phone || !PHONE_RE.test(body.phone)) {
    return NextResponse.json({ error: "El celular debe tener 9 dígitos y empezar con 9" }, { status: 400 });
  }
  if (!body.pin || !PIN_RE.test(body.pin)) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: exists } = await db.from("profiles").select("id").eq("phone", body.phone).maybeSingle();
  // Si el celular ya tiene cuenta (p. ej. de cliente), solo su titular puede sumar un negocio: confirma con su PIN actual.
  let existingId: string | null = null;
  if (exists) {
    const auth = await authenticateExisting(body.phone, body.pin);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    existingId = auth.id;
  } else if (isWeakPin(body.pin)) {
    return NextResponse.json({ error: WEAK_PIN_MESSAGE }, { status: 400 });
  }

  // 1) Reclamar la invitación de forma atómica: solo una persona puede usarla.
  const { data: claimed } = await db
    .from("invitations")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token))
    .is("used_at", null)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: "Esta invitación ya fue usada o venció. Pide una nueva." }, { status: 410 });

  const release = () => db.from("invitations").update({ used_at: null, used_by: null }).eq("id", claimed.id);

  // 2) Crear la cuenta (celular + PIN) y 3) el negocio.
  let userId: string;
  if (existingId) {
    userId = existingId;
  } else {
    try {
      userId = await createPinUser(name, body.phone, body.pin);
    } catch (e) {
      await release();
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  const { error: bizError } = await db.rpc("admin_create_business", {
    p_owner_id: userId,
    p_name: businessName,
    p_phone: body.phone,
    p_yape: clean(body.yape),
    p_plin: clean(body.plin),
  });
  if (bizError) {
    if (!existingId) await db.auth.admin.deleteUser(userId);
    await release();
    const yaTiene = /ya tiene un negocio/i.test(bizError.message);
    return NextResponse.json(
      { error: yaTiene ? "Esa cuenta ya tiene un negocio registrado." : "No se pudo crear el negocio. Inténtalo otra vez." },
      { status: yaTiene ? 409 : 500 },
    );
  }
  await db.from("invitations").update({ used_by: userId }).eq("id", claimed.id);

  // 4) Iniciar sesión.
  const supabase = await supabaseServer();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: pinEmail(body.phone),
    password: pinPassword(userId, body.pin),
  });
  if (signInError) return NextResponse.json({ error: "Cuenta creada. Ingresa con tu celular y PIN." }, { status: 200 });
  return NextResponse.json({ ok: true });
}
