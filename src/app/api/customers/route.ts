import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { randomPassword, SETUP_HOURS } from "@/lib/pin";

// Reiniciar el PIN de un cliente de mi negocio (lo olvidó): vuelve a elegir uno al entrar, durante 72 horas.
export async function PATCH(request: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Inicia sesión primero" }, { status: 401 });

  const db = supabaseAdmin();
  const { data: business } = await db.from("businesses").select("id").eq("owner_id", data.user.id).maybeSingle();
  if (!business) return NextResponse.json({ error: "Solo el dueño del negocio puede reiniciar el PIN de sus clientes" }, { status: 403 });

  const { userId } = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });

  const { data: link } = await db
    .from("business_customers")
    .select("customer_id")
    .eq("business_id", business.id)
    .eq("customer_id", userId)
    .maybeSingle();
  const { data: p } = await db.from("profiles").select("role, is_admin").eq("id", userId).maybeSingle();
  if (!link || !p || p.role !== "cliente" || p.is_admin) {
    return NextResponse.json({ error: "No se puede reiniciar el PIN de esta cuenta" }, { status: 400 });
  }
  // Una cuenta que también administra o reparte para otros negocios no se toca desde aquí.
  const [{ count: owns }, { count: staff }] = await Promise.all([
    db.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", userId),
    db.from("business_members").select("user_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if ((owns ?? 0) > 0 || (staff ?? 0) > 0) {
    return NextResponse.json({ error: "Esta persona también trabaja en otro negocio; debe recuperar su PIN por su cuenta" }, { status: 400 });
  }

  const { error: pwError } = await db.auth.admin.updateUserById(userId, { password: randomPassword() });
  if (pwError) return NextResponse.json({ error: "No se pudo reiniciar el PIN" }, { status: 500 });
  const until = new Date(Date.now() + SETUP_HOURS * 3_600_000).toISOString();
  await db.from("profiles").update({ has_pin: false, pin_setup_until: until }).eq("id", userId);
  return NextResponse.json({ ok: true });
}
