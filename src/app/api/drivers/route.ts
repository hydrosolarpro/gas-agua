import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { createPendingDriver, PHONE_RE, randomPassword, SETUP_HOURS } from "@/lib/pin";

/** Devuelve el negocio del dueño que llama (comprobado en el servidor con su sesión). */
async function ownerBusiness() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: NextResponse.json({ error: "Inicia sesión primero" }, { status: 401 }) };
  const { data: business } = await supabaseAdmin().from("businesses").select("id").eq("owner_id", data.user.id).maybeSingle();
  if (!business) return { error: NextResponse.json({ error: "Solo el dueño del negocio puede gestionar repartidores" }, { status: 403 }) };
  return { ownerId: data.user.id, businessId: business.id };
}

// El dueño registra un repartidor con solo nombre y celular. Él mismo crea su PIN al entrar por primera vez.
// Si el celular ya tenía cuenta, queda una invitación que esa persona debe aceptar.
export async function POST(request: Request) {
  const guard = await ownerBusiness();
  if (guard.error) return guard.error;
  const { fullName, phone } = (await request.json().catch(() => ({}))) as { fullName?: string; phone?: string };

  const name = fullName?.trim() ?? "";
  if (name.length < 2) return NextResponse.json({ error: "Escribe el nombre del repartidor" }, { status: 400 });
  if (!phone || !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "El celular debe tener 9 dígitos y empezar con 9" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: existing } = await db.from("profiles").select("id, role, is_admin").eq("phone", phone).maybeSingle();

  if (!existing) {
    let userId: string;
    try {
      userId = await createPendingDriver(name, phone);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    const { error } = await db
      .from("business_members")
      .upsert({ business_id: guard.businessId, user_id: userId, active: true, accepted: true });
    if (error) {
      await db.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "No se pudo agregar al repartidor" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, estado: "nuevo" });
  }

  const { data: member } = await db
    .from("business_members")
    .select("accepted")
    .eq("business_id", guard.businessId)
    .eq("user_id", existing.id)
    .maybeSingle();
  if (member) {
    return NextResponse.json({ error: member.accepted ? "Ya está en tu equipo" : "Ya le enviaste la invitación" }, { status: 409 });
  }
  // Cuenta que ya existe (cliente, dueño o administrador): no se le cambia nada hasta que la propia persona acepte.
  // Si es el propio dueño, no hay a quién pedirle permiso: queda en su equipo de inmediato.
  const propio = existing.id === guard.ownerId;
  const { error } = await db
    .from("business_members")
    .insert({ business_id: guard.businessId, user_id: existing.id, active: propio, accepted: propio });
  if (error) return NextResponse.json({ error: "No se pudo enviar la invitación" }, { status: 500 });
  return NextResponse.json({ ok: true, estado: propio ? "nuevo" : "invitado" });
}

// Reiniciar el acceso de un repartidor (olvidó su PIN): vuelve a crear uno al entrar, durante 72 horas.
export async function PATCH(request: Request) {
  const guard = await ownerBusiness();
  if (guard.error) return guard.error;
  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return NextResponse.json({ error: "Falta el repartidor" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: member } = await db
    .from("business_members")
    .select("accepted")
    .eq("business_id", guard.businessId)
    .eq("user_id", userId)
    .maybeSingle();
  const { data: p } = await db.from("profiles").select("role, is_admin").eq("id", userId).maybeSingle();
  if (!member?.accepted || p?.role !== "repartidor" || p.is_admin) {
    return NextResponse.json({ error: "No se puede reiniciar este acceso" }, { status: 400 });
  }
  const { error: pwError } = await db.auth.admin.updateUserById(userId, { password: randomPassword() });
  if (pwError) return NextResponse.json({ error: "No se pudo reiniciar el acceso" }, { status: 500 });
  const until = new Date(Date.now() + SETUP_HOURS * 3_600_000).toISOString();
  await db.from("profiles").update({ has_pin: false, pin_setup_until: until }).eq("id", userId);
  return NextResponse.json({ ok: true });
}

// Quitar a un repartidor del equipo (o anular una invitación pendiente).
export async function DELETE(request: Request) {
  const guard = await ownerBusiness();
  if (guard.error) return guard.error;
  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return NextResponse.json({ error: "Falta el repartidor" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: member } = await db
    .from("business_members")
    .select("user_id")
    .eq("business_id", guard.businessId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Ese repartidor no está en tu equipo" }, { status: 404 });
  await db.from("business_members").delete().eq("business_id", guard.businessId).eq("user_id", userId);

  // Si ya no trabaja en ningún negocio: la cuenta creada solo para repartir se borra; si además tenía pedidos como
  // cliente, se conserva y vuelve a ser cliente.
  const { data: p } = await db.from("profiles").select("role, is_admin").eq("id", userId).maybeSingle();
  const { count } = await db.from("business_members").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
  if (p && p.role === "repartidor" && !p.is_admin && (count ?? 0) === 0) {
    const { count: orders } = await db.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", userId);
    if ((orders ?? 0) === 0) await db.auth.admin.deleteUser(userId);
    else await db.from("profiles").update({ role: "cliente" }).eq("id", userId);
  }
  return NextResponse.json({ ok: true });
}
