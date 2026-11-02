import { NextResponse } from "next/server";
import { hashToken } from "@/lib/admin";
import {
  authenticateExisting,
  createPinUser,
  isWeakPin,
  PHONE_RE,
  PIN_RE,
  pinEmail,
  pinPassword,
  WEAK_PIN_MESSAGE,
} from "@/lib/pin";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Un cliente se registra con el enlace de invitación de un dueño y queda como cliente de ese negocio.
// Si el celular ya tiene cuenta (p. ej. es dueño de otro negocio), se confirma con su PIN actual y conserva su cuenta.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; fullName?: string; phone?: string; pin?: string; soloVincular?: boolean };
  const token = body.token ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "Invitación no válida" }, { status: 400 });
  if (!body.phone || !PHONE_RE.test(body.phone)) {
    return NextResponse.json({ error: "El celular debe tener 9 dígitos y empezar con 9" }, { status: 400 });
  }
  if (!body.soloVincular && (!body.pin || !PIN_RE.test(body.pin))) {
    return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: inv } = await db
    .from("customer_invitations")
    .select("id, business_id, expires_at, revoked, uses, businesses(slug, active, owner_id)")
    .eq("token_hash", hashToken(token))
    .maybeSingle<{
      id: string;
      business_id: string;
      expires_at: string;
      revoked: boolean;
      uses: number;
      businesses: { slug: string; active: boolean; owner_id: string } | null;
    }>();
  if (!inv || inv.revoked || !inv.businesses?.active || new Date(inv.expires_at) <= new Date()) {
    return NextResponse.json({ error: "Esta invitación ya no es válida. Pide una nueva a tu negocio." }, { status: 410 });
  }

  const { data: existing } = await db.from("profiles").select("id, role").eq("phone", body.phone).maybeSingle();
  let userId: string;
  let yaTeniaCuenta = false;
  let vinculadoSinPin = false;
  if (existing && body.soloVincular) {
    // Quien no recuerda su PIN solo queda anotado como cliente del negocio: NO se inicia sesión ni se toca la cuenta.
    userId = existing.id;
    yaTeniaCuenta = true;
    vinculadoSinPin = true;
  } else if (existing) {
    // Cuenta existente: solo su titular puede entrar con ella (PIN actual).
    const auth = await authenticateExisting(body.phone, body.pin!);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    userId = auth.id;
    yaTeniaCuenta = true;
  } else {
    const name = body.fullName?.trim() ?? "";
    if (name.length < 2) return NextResponse.json({ error: "Escribe tu nombre" }, { status: 400 });
    if (!body.pin || !PIN_RE.test(body.pin)) return NextResponse.json({ error: "El PIN debe tener 4 dígitos" }, { status: 400 });
    if (isWeakPin(body.pin)) return NextResponse.json({ error: WEAK_PIN_MESSAGE }, { status: 400 });
    try {
      userId = await createPinUser(name, body.phone, body.pin);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    await db.from("profiles").update({ onboarded: true }).eq("id", userId);
  }

  const { error } = await db
    .from("business_customers")
    .upsert(
      { business_id: inv.business_id, customer_id: userId, invitation_id: inv.id, source: "invitacion" },
      { onConflict: "business_id,customer_id", ignoreDuplicates: true },
    );
  if (error) {
    if (!yaTeniaCuenta) await db.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "No se pudo completar el registro. Inténtalo otra vez." }, { status: 500 });
  }
  await db.from("customer_invitations").update({ uses: inv.uses + 1 }).eq("id", inv.id);
  if (!vinculadoSinPin) await db.from("profiles").update({ last_business_id: inv.business_id }).eq("id", userId);

  if (vinculadoSinPin) {
    return NextResponse.json({ ok: false, vinculado: true, slug: inv.businesses.slug, yaTeniaCuenta: true, esDuenoDeOtro: false });
  }
  const { data: u } = await db.auth.admin.getUserById(userId);
  const supabase = await supabaseServer();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: u.user?.email ?? pinEmail(body.phone),
    password: pinPassword(userId, body.pin!),
  });
  return NextResponse.json({
    ok: !signInError,
    slug: inv.businesses.slug,
    yaTeniaCuenta,
    esDuenoDeOtro: Boolean(existing && existing.role === "dueno" && inv.businesses.owner_id !== userId),
  });
}
