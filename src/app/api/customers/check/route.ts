import { NextResponse } from "next/server";
import { hashToken } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";

// Valida el enlace con el que un dueño invita a un cliente y devuelve solo lo que la pantalla necesita mostrar.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ valid: false });

  const { data: inv } = await supabaseAdmin()
    .from("customer_invitations")
    .select("note, expires_at, revoked, businesses(name, slug, active)")
    .eq("token_hash", hashToken(token))
    .maybeSingle<{ note: string | null; expires_at: string; revoked: boolean; businesses: { name: string; slug: string; active: boolean } | null }>();
  const valid = Boolean(inv && !inv.revoked && inv.businesses?.active && new Date(inv.expires_at) > new Date());
  if (!valid || !inv?.businesses) return NextResponse.json({ valid: false });
  return NextResponse.json({ valid: true, note: inv.note, business: inv.businesses.name, slug: inv.businesses.slug });
}
