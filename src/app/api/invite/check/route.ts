import { NextResponse } from "next/server";
import { hashToken } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";

// Valida un enlace de invitación y devuelve solo lo que la página de bienvenida necesita mostrar.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ valid: false });

  const db = supabaseAdmin();
  const { data: inv } = await db
    .from("invitations")
    .select("note, expires_at, used_at, revoked")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  const valid = Boolean(inv && !inv.used_at && !inv.revoked && new Date(inv.expires_at) > new Date());
  if (!valid) return NextResponse.json({ valid: false });

  const { data: s } = await db.from("platform_settings").select("monthly_fee, admin_name, admin_phone").eq("id", 1).single();
  return NextResponse.json({
    valid: true,
    note: inv!.note,
    fee: s?.monthly_fee ?? null,
    adminName: s?.admin_name ?? null,
    adminPhone: s?.admin_phone ?? null,
  });
}
