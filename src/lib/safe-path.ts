/**
 * Devuelve `next` solo si es una ruta interna de la app. Evita "open redirect":
 * https://sitio-malo.com, //sitio-malo.com y /\sitio-malo.com (el navegador trata \ como /).
 */
export function safePath(next: string | null | undefined, fallback = "/inicio") {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
