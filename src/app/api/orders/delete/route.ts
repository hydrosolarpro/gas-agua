import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// El cliente borra de su lista pedidos ya cerrados (entregados o cancelados).
//  - Se eliminan de la base de datos los comprobantes de pago que subió (filas e imágenes), que es lo que más espacio ocupa.
//  - El pedido desaparece de su lista; el negocio conserva el registro (monto, productos, fecha) para sus estadísticas y su
//    contabilidad, porque ese dato también es del negocio.
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Inicia sesión primero" }, { status: 401 });
  const userId = data.user.id;

  const { orderIds } = (await request.json().catch(() => ({}))) as { orderIds?: string[] };
  const ids = [...new Set((orderIds ?? []).filter((x) => typeof x === "string"))].slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ error: "No hay pedidos para borrar" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: mine } = await db
    .from("orders")
    .select("id")
    .eq("customer_id", userId)
    .in("id", ids)
    .in("status", ["entregado", "cancelado"]);
  const okIds = (mine ?? []).map((o) => o.id as string);
  if (okIds.length === 0) return NextResponse.json({ error: "Solo se pueden borrar pedidos ya entregados o cancelados" }, { status: 400 });

  // Comprobantes: imágenes del almacenamiento y filas de la tabla.
  const { data: proofs } = await db.from("order_proofs").select("proof_path, extra_paths").in("order_id", okIds);
  const paths = (proofs ?? []).flatMap((p) => [p.proof_path as string | null, ...((p.extra_paths as string[] | null) ?? [])]).filter((x): x is string => Boolean(x));
  if (paths.length) await db.storage.from("comprobantes").remove(paths);
  await db.from("order_proofs").delete().in("order_id", okIds);

  const { error } = await db.from("orders").update({ customer_hidden_at: new Date().toISOString() }).in("id", okIds);
  if (error) return NextResponse.json({ error: "No se pudo borrar. Inténtalo otra vez." }, { status: 500 });
  return NextResponse.json({ ok: true, borrados: okIds.length });
}
