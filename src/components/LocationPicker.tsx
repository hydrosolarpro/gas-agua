"use client";

import { useState } from "react";
import { Crosshair } from "lucide-react";
import Map, { LIMA } from "@/components/map/Map";
import { Spinner } from "@/components/ui";
import { reverseGeocode } from "@/lib/geo";
import { getCurrentPosition } from "@/lib/hooks";
import type { LatLng } from "@/lib/types";

export type PickedLocation = { point: LatLng | null; address: string; reference: string };

/** Elegir el punto de entrega: GPS + pin arrastrable + dirección y referencia. */
export function LocationPicker({ value, onChange }: { value: PickedLocation; onChange: (v: PickedLocation) => void }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [addressTouched, setAddressTouched] = useState(Boolean(value.address));

  async function moveTo(point: LatLng, current: PickedLocation) {
    const next = { ...current, point };
    onChange(next);
    if (!addressTouched) {
      const address = await reverseGeocode(point);
      if (address) onChange({ ...next, address });
    }
  }

  async function useGps() {
    setLocating(true);
    setError("");
    try {
      const p = await getCurrentPosition();
      await moveTo(p, value);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200">
        <Map
          center={value.point ?? LIMA}
          zoom={value.point ? 17 : 12}
          className="h-[clamp(10rem,30dvh,18rem)]"
          onMapClick={(p) => moveTo(p, value)}
          markers={
            value.point
              ? [{ id: "destino", kind: "destino", position: value.point, draggable: true, onDragEnd: (p) => moveTo(p, value) }]
              : []
          }
        />
        <button
          type="button"
          onClick={useGps}
          className="absolute bottom-3 right-3 z-[400] inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-agua-700 shadow-lg"
        >
          {locating ? <Spinner className="h-4 w-4" /> : <Crosshair className="h-4 w-4" />} Usar mi ubicación
        </button>
        {!value.point && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-[400] mx-auto w-fit rounded-full bg-slate-900/80 px-4 py-2 text-xs font-semibold text-white">
            Toca el mapa o usa tu ubicación
          </div>
        )}
      </div>
      {value.point && <p className="-mt-2 text-xs text-slate-500">Arrastra el pin naranja para afinar el punto exacto de entrega.</p>}
      {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
      <div>
        <label className="label">Dirección</label>
        <input
          className="input"
          value={value.address}
          onChange={(e) => {
            setAddressTouched(true);
            onChange({ ...value, address: e.target.value });
          }}
          placeholder="Av. / Jr. / Calle, número, distrito"
        />
      </div>
      <div>
        <label className="label">Referencia</label>
        <input
          className="input"
          value={value.reference}
          onChange={(e) => onChange({ ...value, reference: e.target.value })}
          placeholder="Ej. puerta verde, 2do piso, frente al parque"
        />
      </div>
    </div>
  );
}
