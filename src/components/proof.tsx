"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

const BUCKET = "comprobantes";
const MAX_SIDE = 1600;

/** Reduce la foto del celular (varios MB) a un JPEG liviano antes de subirla. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
  if (!blob) throw new Error("No se pudo preparar la imagen");
  return blob;
}

/** Sube la imagen al almacenamiento privado y devuelve su ruta (`subs/<negocio>/…` u `orders/<pedido>/…`). */
export async function uploadProof(kind: "subs" | "orders", id: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Elige una imagen (captura o foto)");
  const blob = await compress(file);
  const path = `${kind}/${id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabaseBrowser().storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw new Error("No se pudo subir la imagen. Inténtalo de nuevo.");
  return path;
}

/** Botón para elegir la captura o foto del pago, con vista previa. */
export function ProofPicker({ file, onChange, label = "Comprobante de pago" }: { file: File | null; onChange: (f: File | null) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null); // eslint-disable-line react-hooks/set-state-in-effect
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <label className="label">{label}</label>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      {file && preview ? (
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Vista previa del comprobante" className="h-20 w-20 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <button type="button" onClick={() => input.current?.click()} className="text-sm font-bold text-agua-700">
              Cambiar imagen
            </button>
          </div>
          <button type="button" onClick={() => onChange(null)} className="rounded-full p-2 text-slate-500" aria-label="Quitar imagen">
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-5 font-semibold text-slate-600 active:scale-[0.99]"
        >
          <Camera className="h-5 w-5" /> Subir captura o foto
        </button>
      )}
    </div>
  );
}

/** Miniatura del comprobante (enlace firmado temporal); al tocarla se ve en grande. */
export function ProofView({ path, caption }: { path: string | null | undefined; caption?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [big, setBig] = useState(false);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    supabaseBrowser()
      .storage.from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  if (!path) return null;
  if (failed) return <span className="text-xs text-slate-400">Comprobante no disponible</span>;
  if (!url) return <span className="inline-block h-16 w-16 animate-pulse rounded-xl bg-slate-100" aria-label="Cargando comprobante" />;

  return (
    <>
      <button type="button" onClick={() => setBig(true)} className="group relative inline-block overflow-hidden rounded-xl border border-slate-200" aria-label={caption ? `Ver comprobante: ${caption}` : "Ver comprobante"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Comprobante de pago" className="h-16 w-16 object-cover transition group-active:scale-95" />
        <span className="absolute bottom-0.5 right-0.5 rounded-full bg-slate-900/70 p-1 text-white">
          <ImageIcon className="h-3 w-3" />
        </span>
      </button>
      {big && (
        <div className="sheet-backdrop fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-slate-950/85 p-4" onClick={() => setBig(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Comprobante de pago" className="max-h-[80dvh] max-w-full rounded-2xl object-contain" />
          {caption && <p className="text-sm font-semibold text-white">{caption}</p>}
          <div className="flex gap-3">
            <a href={url} target="_blank" rel="noreferrer" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-slate-900" onClick={(e) => e.stopPropagation()}>
              Abrir imagen
            </a>
            <button type="button" className="rounded-full bg-white/15 px-5 py-2.5 text-sm font-bold text-white" onClick={() => setBig(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
