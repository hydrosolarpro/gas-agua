import { NextResponse } from "next/server";
import { hashToken } from "@/lib/admin";
import { PHONE_RE } from "@/lib/pin";
import { supabaseAdmin } from "@/lib/supabase/server";

// Con un enlace de invitación válido, dice si el celular ya tiene cuenta para pedir el PIN de siempre en vez de uno nuevo.
// Solo responde a quien tiene un enlace vigente, para no servir de consulta libre de celulares.
export async function POST(request: Request) {
  const { token, kind, phone } = (await request.json().catch(() => ({}))) as { token?: string; kind?: string; phone?: string };
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !phone || !PHONE_RE.test(phone)) return NextResponse.json({ existe: false });

  const db = supabaseAdmin();
  const hash = hashToken(token);
  let valid = false;
  if (kind === "dueno") {
    const { data } = await db.from("invitations").select("expires_at, used_at, revoked").eq("token_hash", hash).maybeSingle();
    valid = Boolean(data && !data.used_at && !data.revoked && new Date(data.expires_at) > new Date());
  } else if (kind === "cliente") {
    const { data } = await db.from("customer_invitations").select("expires_at, revoked").eq("token_hash", hash).maybeSingle();
    valid = Boolean(data && !data.revoked && new Date(data.expires_at) > new Date());
  }
  if (!valid) return NextResponse.json({ existe: false });

  const { data: p } = await db.from("profiles").select("id, has_pin").eq("phone", phone).maybeSingle();
  return NextResponse.json({ existe: Boolean(p?.has_pin) });
}
