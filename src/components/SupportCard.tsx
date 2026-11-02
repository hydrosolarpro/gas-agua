"use client";

import { useEffect, useState } from "react";
import { Headset, Mail, MessageCircle } from "lucide-react";
import { waLink } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

// Datos de respaldo por si el administrador aún no completó los suyos en «Datos de cobro».
const FALLBACK = { name: "Soporte AguaGasExpress", email: "productosaas2026@gmail.com", phone: "960442025" };

/** Datos de contacto del administrador para que el dueño pida ayuda. */
export function SupportCard({ compact = false }: { compact?: boolean }) {
  const [s, setS] = useState(FALLBACK);

  useEffect(() => {
    supabaseBrowser()
      .from("platform_settings")
      .select("admin_name, admin_email, admin_phone")
      .eq("id", 1)
      .maybeSingle<{ admin_name: string | null; admin_email: string | null; admin_phone: string | null }>()
      .then(({ data }) => {
        if (data) setS({ name: data.admin_name || FALLBACK.name, email: data.admin_email || FALLBACK.email, phone: data.admin_phone || FALLBACK.phone });
      });
  }, []);

  const wa = waLink(s.phone, "Hola, soy dueño de un negocio en AguaGasExpress y necesito ayuda.");

  if (compact) {
    return (
      <div className="mb-2 space-y-1.5 rounded-2xl bg-slate-50 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-bold text-slate-700">
          <Headset className="h-4 w-4" /> Soporte
        </p>
        <a href={`mailto:${s.email}`} className="flex items-center gap-1.5 truncate text-slate-600 hover:text-agua-700">
          <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{s.email}</span>
        </a>
        <a href={wa} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-semibold text-emerald-700">
          <MessageCircle className="h-3.5 w-3.5 shrink-0" /> +51 {s.phone.replace(/^51/, "")} · WhatsApp
        </a>
      </div>
    );
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-agua-50 p-2 text-agua-700">
          <Headset className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-bold">Soporte</h2>
          <p className="text-sm text-slate-500">{s.name}</p>
        </div>
      </div>
      <a href={`mailto:${s.email}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 font-semibold">
        <Mail className="h-5 w-5 text-slate-500" /> <span className="min-w-0 truncate">{s.email}</span>
      </a>
      <a href={wa} target="_blank" rel="noreferrer" className="btn-success w-full">
        <MessageCircle className="h-5 w-5" /> Escribir por WhatsApp · +51 {s.phone.replace(/^51/, "")}
      </a>
    </section>
  );
}
