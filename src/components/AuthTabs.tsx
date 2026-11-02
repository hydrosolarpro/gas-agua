import Link from "next/link";

/** Pestañas visibles arriba de Ingresar / Crear cuenta, para que nadie tenga que buscar cómo registrarse. */
export function AuthTabs({ active, next }: { active: "ingresar" | "registro"; next?: string | null }) {
  const qs = next ? `?next=${encodeURIComponent(next)}` : "";
  const base = "flex-1 rounded-xl px-4 py-[clamp(0.4rem,1.2dvh,0.625rem)] text-center text-sm font-bold transition";
  const on = "bg-white text-agua-700 shadow-sm";
  const off = "text-slate-500 hover:text-slate-800";
  return (
    <div className="mb-[clamp(0.4rem,1.6dvh,1.25rem)] flex gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
      <Link href={`/ingresar${qs}`} role="tab" aria-selected={active === "ingresar"} className={`${base} ${active === "ingresar" ? on : off}`}>
        Ingresar
      </Link>
      <Link href={`/registro${qs}`} role="tab" aria-selected={active === "registro"} className={`${base} ${active === "registro" ? on : off}`}>
        Crear cuenta
      </Link>
    </div>
  );
}
