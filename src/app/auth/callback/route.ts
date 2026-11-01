import { NextResponse } from "next/server";
import { safePath } from "@/lib/safe-path";
import { supabaseServer } from "@/lib/supabase/server";

// Regreso desde Google: canjea el código por una sesión.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = safePath(next);

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin));
  }
  return NextResponse.redirect(new URL("/ingresar?error=google", url.origin));
}
