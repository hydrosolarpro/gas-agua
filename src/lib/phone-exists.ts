/** Con un enlace de invitación vigente: ¿este celular ya tiene cuenta con PIN? */
export async function phoneExists(token: string, kind: "cliente" | "dueno", phone: string): Promise<boolean> {
  try {
    const res = await fetch("/api/invite/phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, kind, phone }),
    });
    const data = (await res.json()) as { existe?: boolean };
    return Boolean(data.existe);
  } catch {
    return false;
  }
}
