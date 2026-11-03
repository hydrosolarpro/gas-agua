import { NextResponse } from "next/server";
import { isLocked, PIN_RE, recordAttempt, verifyPin } from "@/lib/pin";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

const IN_PROGRESS = ["pendiente", "aceptado", "en_camino"];

// Cualquier persona (cliente, dueño de negocio o repartidor) se da de baja con su PIN. La cuenta se cierra y el celular
// queda libre; los registros se conservan marcados como «dado de baja»:
//  - cliente: su negocio sigue viéndolo en Mis Clientes y conserva sus pedidos;
//  - repartidor: su negocio lo ve en Mi equipo y conserva sus entregas;
//  - dueño: el negocio queda inactivo (los clientes ya no pueden pedir) y el administrador lo ve como dado de baja.
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Inicia sesión primero" }, { status: 401 });
  const userId = data.user.id;

  const { pin } = (await request.json().catch(() => ({}))) as { pin?: string };
  if (!pin || !PIN_RE.test(pin)) return NextResponse.json({ error: "Escribe tu PIN de 4 dígitos" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("role, is_admin, full_name, phone, deactivated_at").eq("id", userId).maybeSingle();
  if (!p || p.deactivated_at) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
  if (p.is_admin) return NextResponse.json({ error: "La cuenta de administrador no se da de baja desde aquí." }, { status: 400 });
  if (p.role !== "cliente" && p.role !== "dueno" && p.role !== "repartidor") {
    return NextResponse.json({ error: "No se puede dar de baja esta cuenta. Escribe a soporte." }, { status: 400 });
  }

  let businessId: string | null = null;
  if (p.role === "dueno") {
    const { data: b } = await db.from("businesses").select("id").eq("owner_id", userId).maybeSingle();
    businessId = b?.id ?? null;
    if (businessId) {
      const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", IN_PROGRESS);
      if ((count ?? 0) > 0) {
        return NextResponse.json({ error: "Tienes pedidos en curso. Termínalos o cancélalos antes de darte de baja." }, { status: 400 });
      }
    }
  } else {
    const { count } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("status", IN_PROGRESS)
      .eq(p.role === "cliente" ? "customer_id" : "driver_id", userId);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: p.role === "cliente" ? "Tienes un pedido en curso. Espera a que termine o cancélalo antes de darte de baja." : "Tienes entregas en curso. Termínalas antes de darte de baja." },
        { status: 400 },
      );
    }
  }

  const key = `baja:${userId}`;
  if (await isLocked(key)) return NextResponse.json({ error: "Demasiados intentos. Espera 15 minutos." }, { status: 429 });
  const ok = await verifyPin(userId, pin);
  await recordAttempt(key, ok);
  if (!ok) return NextResponse.json({ error: "El PIN no coincide" }, { status: 401 });

  const now = new Date().toISOString();

  // Cierre del negocio (dueño): queda inactivo y su equipo deja de repartir, pero todo el historial se conserva.
  if (businessId) {
    // Si la columna de registro aún no existe en la base, igual se cierra el negocio.
    let { error } = await db.from("businesses").update({ active: false, deactivated_at: now }).eq("id", businessId);
    if (error) ({ error } = await db.from("businesses").update({ active: false }).eq("id", businessId));
    if (error) return NextResponse.json({ error: "No se pudo completar la baja. Escribe a soporte." }, { status: 500 });
    await db.from("business_members").update({ active: false }).eq("business_id", businessId);
  }
  // Repartidor: deja de repartir en todos sus negocios (el registro queda para el historial); invitaciones sin aceptar se anulan.
  if (p.role !== "dueno") {
    await db.from("business_members").delete().eq("user_id", userId).eq("accepted", false);
    if (p.role === "repartidor") await db.from("business_members").update({ active: false }).eq("user_id", userId);
  }

  // Cerrar la cuenta: sin ingreso posible, sin celular ni dirección, y el celular queda libre.
  const { error: authError } = await db.auth.admin.updateUserById(userId, {
    email: `baja-${userId}@pin.aguagasexpress.app`,
    password: crypto.randomUUID() + crypto.randomUUID(),
    ban_duration: "876000h",
  });
  if (authError) return NextResponse.json({ error: "No se pudo completar la baja. Inténtalo otra vez." }, { status: 500 });
  const closed = {
      onboarded: false,
      phone: null,
      has_pin: false,
      address_text: null,
      reference: null,
      lat: null,
      lng: null,
      last_business_id: null,
      full_name: `${p.full_name} (baja)`,
      deactivated_at: now,
  };
  let { error } = await db.from("profiles").update({ ...closed, deactivated_phone: p.phone }).eq("id", userId);
  if (error) ({ error } = await db.from("profiles").update(closed).eq("id", userId));
  if (error) return NextResponse.json({ error: "No se pudo completar la baja. Escribe a soporte." }, { status: 500 });

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
