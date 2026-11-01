"use client";

import dynamic from "next/dynamic";
import type { MapCanvasProps } from "./MapCanvas";

export type { MapMarker } from "./MapCanvas";

// Leaflet necesita `window`: se carga solo en el navegador.
const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <div className="h-full min-h-48 w-full animate-pulse bg-slate-200" />,
});

export default function Map(props: MapCanvasProps) {
  return <MapCanvas {...props} />;
}

export const LIMA = { lat: -12.0464, lng: -77.0428 };
