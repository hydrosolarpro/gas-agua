import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/** Hash del enlace de invitación (en la base solo se guarda esto, nunca el enlace). */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Normaliza un código tipo "ab12-cd34" → "AB12CD34". */
export function normalizeCode(code: string) {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Exige que quien llama sea el administrador. La verificación se hace con la sesión (cookies) y
 * se consulta el perfil en el servidor: nunca se confía en lo que diga el navegador.
 */
export async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: NextResponse.json({ error: "Inicia sesión primero" }, { status: 401 }) };
  const { data: profile } = await supabaseAdmin()
    .from("profiles")
    .select("id, is_admin")
    .eq("id", data.user.id)
    .single();
  if (!profile?.is_admin) return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  return { userId: data.user.id };
}
