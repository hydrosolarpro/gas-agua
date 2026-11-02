import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";

// Elimina por completo a un dueño de negocio: su cuenta, su negocio, productos, pedidos, pagos y repartidores.
export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { businessId, confirmName } = (await request.json().catch(() => ({}))) as { businessId?: string; confirmName?: string };
  if (!businessId) return NextResponse.json({ error: "Falta el negocio" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: business } = await db.from("businesses").select("id, name, owner_id").eq("id", businessId).maybeSingle();
  if (!business) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  // Doble confirmación: hay que escribir el nombre del negocio.
  if (!confirmName || confirmName.trim().toLowerCase() !== business.name.trim().toLowerCase()) {
    return NextResponse.json({ error: "El nombre escrito no coincide con el del negocio" }, { status: 400 });
  }

  const { data: owner } = await db.from("profiles").select("id, is_admin").eq("id", business.owner_id).single();
  if (!owner || owner.is_admin || owner.id === guard.userId) {
    return NextResponse.json({ error: "No se puede eliminar esta cuenta" }, { status: 400 });
  }

  // Repartidores que solo trabajan para este negocio (sus cuentas no sirven sin él).
  const { data: members } = await db.from("business_members").select("user_id").eq("business_id", business.id);
  let drivers = 0;
  for (const m of members ?? []) {
    const { count } = await db.from("business_members").select("user_id", { count: "exact", head: true }).eq("user_id", m.user_id);
    const { data: p } = await db.from("profiles").select("role, is_admin").eq("id", m.user_id).single();
    if ((count ?? 0) <= 1 && p?.role === "repartidor" && !p.is_admin) {
      const { error } = await db.auth.admin.deleteUser(m.user_id);
      if (!error) drivers++;
    }
  }

  // Comprobantes de pago guardados (mensualidad y pedidos): se borran para no dejar archivos huérfanos.
  try {
    const bucket = db.storage.from("comprobantes");
    const { data: orders } = await db.from("orders").select("id").eq("business_id", business.id);
    for (const folder of [`subs/${business.id}`, ...(orders ?? []).map((o) => `orders/${o.id}`)]) {
      const { data: files } = await bucket.list(folder, { limit: 100 });
      if (files?.length) await bucket.remove(files.map((f) => `${folder}/${f.name}`));
    }
  } catch {
    // Si el almacenamiento falla no impedimos eliminar la cuenta.
  }

  // Al borrar al dueño se eliminan en cascada su perfil, negocio, productos, pedidos y pagos.
  const { error } = await db.auth.admin.deleteUser(business.owner_id);
  if (error) {
    console.error("deleteUser falló:", error.message);
    return NextResponse.json({ error: `No se pudo eliminar la cuenta: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, repartidoresEliminados: drivers });
}
