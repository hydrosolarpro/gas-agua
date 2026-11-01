import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export const PHONE_RE = /^9\d{8}$/;
export const PIN_RE = /^\d{4}$/;
const MAX_FAILS = 5;
const WINDOW_MIN = 15;

/** Contraseña larga derivada del PIN: el PIN nunca se guarda tal cual. */
export function pinPassword(userId: string, pin: string) {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error("Falta PIN_PEPPER en las variables de entorno");
  return createHmac("sha256", pepper).update(`${userId}:${pin}`).digest("hex");
}

export function pinEmail(phone: string) {
  return `${phone}@pin.aguagasexpress.app`;
}

export function randomPassword() {
  return randomBytes(32).toString("hex");
}

export async function isLocked(phone: string) {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count } = await supabaseAdmin()
    .from("pin_attempts")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .eq("success", false)
    .gte("created_at", since);
  return (count ?? 0) >= MAX_FAILS;
}

export async function recordAttempt(phone: string, success: boolean) {
  await supabaseAdmin().from("pin_attempts").insert({ phone, success });
}

/** Crea una cuenta que entra con celular + PIN. Devuelve el id del usuario. */
export async function createPinUser(fullName: string, phone: string, pin: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: pinEmail(phone),
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(error?.message ?? "No se pudo crear la cuenta");
  const id = data.user.id;
  await admin.auth.admin.updateUserById(id, { password: pinPassword(id, pin) });
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, phone, has_pin: true })
    .eq("id", id);
  if (profileError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error("Ese celular ya está registrado");
  }
  return id;
}
