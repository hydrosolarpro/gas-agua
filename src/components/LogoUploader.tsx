"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { BusinessLogo } from "@/components/BusinessBadge";
import { ErrorText, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Recorta al centro (cuadrado) y reduce a 320 px: el logo pesa pocos KB y se ve nítido en cualquier pantalla. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error("No se pudo leer esa imagen. Prueba con otra foto (JPG o PNG)");
  });
  const side = Math.min(bmp.width, bmp.height);
  const out = Math.min(320, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
  if (!blob) throw new Error("No se pudo preparar la imagen");
  return blob;
}

export function LogoUploader({ business, onChanged }: { business: { id: string; name: string; logo_url?: string | null }; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    setMsg("");
    if (!/^image\//.test(file.type)) return setError("Elige una foto o imagen (JPG, PNG o WebP)");
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const blob = await toSquareJpeg(file);
      const path = `${business.id}/logo.jpg`;
      const up = await supabase.storage.from("logos").upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
      if (up.error) throw up.error;
      const { data } = supabase.storage.from("logos").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const { error } = await supabase.from("businesses").update({ logo_url: url }).eq("id", business.id);
      if (error) throw error;
      setMsg("¡Logo actualizado!");
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError("");
    setMsg("");
    const supabase = supabaseBrowser();
    const { error } = await supabase.from("businesses").update({ logo_url: null }).eq("id", business.id);
    if (!error) await supabase.storage.from("logos").remove([`${business.id}/logo.jpg`]);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    onChanged();
  }

  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <p className="label">Logo de tu negocio</p>
      <div className="flex flex-wrap items-center gap-4">
        <BusinessLogo business={business} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="btn-ghost justify-center text-sm font-bold">
            {busy ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-5 w-5" />} {business.logo_url ? "Cambiar logo" : "Subir logo"}
          </button>
          {business.logo_url && (
            <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-rose-600">
              <Trash2 className="h-4 w-4" /> Quitar logo
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <p className="mt-2 text-xs text-slate-500">Lo verán tus clientes y repartidores. Mejor una imagen cuadrada.</p>
      <ErrorText>{error}</ErrorText>
      {msg && <p className="mt-2 text-sm font-semibold text-emerald-700">{msg}</p>}
    </div>
  );
}
