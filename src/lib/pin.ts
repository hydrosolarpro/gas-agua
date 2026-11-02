import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";

export const PHONE_RE = /^9\d{8}$/;
export const PIN_RE = /^\d{4}$/;
const MAX_FAILS = 5;
const MAX_FAILS_DAY = 15;
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

/**
 * Bloqueo escalonado contra fuerza bruta (un PIN de 4 dígitos tiene solo 10 000 combinaciones):
 * 5 fallos en 15 min → espera de 15 min; 15 fallos en 24 h → bloqueo hasta que pasen 24 h.
 */
export async function isLocked(phone: string) {
  const db = supabaseAdmin();
  const fails = async (minutes: number) => {
    const since = new Date(Date.now() - minutes * 60_000).toISOString();
    const { count } = await db
      .from("pin_attempts")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("success", false)
      .gte("created_at", since);
    return count ?? 0;
  };
  return (await fails(WINDOW_MIN)) >= MAX_FAILS || (await fails(24 * 60)) >= MAX_FAILS_DAY;
}

const WEAK_PINS = new Set(["1234", "4321", "1212", "2580", "0852", "1004", "2000", "1122", "6969", "1357", "2468"]);

/** PIN fácil de adivinar: repetidos (1111), secuencias (1234, 4321) o los más comunes. */
export function isWeakPin(pin: string) {
  if (WEAK_PINS.has(pin)) return true;
  if (/^(\d)\1{3}$/.test(pin)) return true;
  const d = pin.split("").map(Number);
  const step = d[1] - d[0];
  return Math.abs(step) === 1 && d.every((v, i) => i === 0 || v - d[i - 1] === step);
}

export const WEAK_PIN_MESSAGE = "Ese PIN es muy fácil de adivinar. Elige otro (evita 1234, 0000 o números repetidos).";

export async function recordAttempt(phone: string, success: boolean) {
  await supabaseAdmin().from("pin_attempts").insert({ phone, success });
}

/** Celular reservado para el administrador: nadie más puede registrarlo por las rutas públicas. */
export const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "960442025";

/** Crea una cuenta que entra con celular + PIN. Devuelve el id del usuario. */
export async function createPinUser(
  fullName: string,
  phone: string,
  pin: string,
  opts: { allowAdminPhone?: boolean } = {},
) {
  if (phone === ADMIN_PHONE && !opts.allowAdminPhone) throw new Error("Ese número no está disponible");
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

/** ¿Este PIN abre esta cuenta? (se comprueba contra Supabase Auth, sin tocar la sesión actual) */
export async function verifyPin(userId: string, pin: string) {
  const { data } = await supabaseAdmin().auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (!email) return false;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await anon.auth.signInWithPassword({ email, password: pinPassword(userId, pin) });
  return !error;
}

/**
 * Comprueba el PIN de una cuenta que ya existe, con el mismo bloqueo por intentos que el ingreso.
 * Sirve para sumar un rol (dueño o cliente de un negocio) a un celular ya registrado con consentimiento de su titular.
 */
export async function authenticateExisting(
  phone: string,
  pin: string,
): Promise<{ id: string } | { error: string; status: number }> {
  if (await isLocked(phone)) return { error: "Demasiados intentos. Espera 15 minutos.", status: 429 };
  const { data: p } = await supabaseAdmin().from("profiles").select("id, has_pin").eq("phone", phone).maybeSingle();
  const ok = p?.has_pin ? await verifyPin(p.id, pin) : false;
  await recordAttempt(phone, ok);
  if (!ok || !p) {
    return { error: "Ese celular ya tiene cuenta y el PIN no coincide. Si ya tienes cuenta, escribe tu PIN actual.", status: 401 };
  }
  return { id: p.id };
}

/** Horas que tiene un repartidor nuevo para crear su PIN antes de que el dueño deba reiniciar su acceso. */
export const SETUP_HOURS = 72;

/** Cuenta de repartidor sin PIN: la persona crea el suyo al entrar por primera vez (solo hacen falta nombre y celular). */
export async function createPendingDriver(fullName: string, phone: string) {
  if (phone === ADMIN_PHONE) throw new Error("Ese número no está disponible");
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: pinEmail(phone),
    password: randomPassword(),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(error?.message ?? "No se pudo crear la cuenta");
  const id = data.user.id;
  const until = new Date(Date.now() + SETUP_HOURS * 3_600_000).toISOString();
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName, phone, role: "repartidor", onboarded: true, has_pin: false, pin_setup_until: until })
    .eq("id", id);
  if (profileError) {
    await admin.auth.admin.deleteUser(id);
    throw new Error("Ese celular ya está registrado");
  }
  return id;
}