"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "@/lib/types";

export type MapMarker = {
  id: string;
  position: LatLng;
  kind: "destino" | "repartidor" | "negocio" | "pedido";
  label?: string;
  /** Etiqueta siempre visible (no solo al pasar el dedo o el mouse). */
  permanent?: boolean;
  heading?: number | null;
  draggable?: boolean;
  onDragEnd?: (p: LatLng) => void;
  onClick?: () => void;
};

export type MapCanvasProps = {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  route?: LatLng[];
  /** Cambia este valor para volver a encuadrar todos los puntos. */
  fitKey?: string;
  onMapClick?: (p: LatLng) => void;
  className?: string;
};

function icon(m: MapMarker) {
  const base = "display:flex;align-items:center;justify-content:center;border-radius:9999px;";
  switch (m.kind) {
    case "repartidor":
      return L.divIcon({
        className: "",
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        html: `<div class="marker-pulse" style="${base}width:44px;height:44px;background:#0891b2;border:3px solid #fff;box-shadow:0 4px 14px rgba(8,145,178,.45);">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l7 17-7-4-7 4z"/></svg>
        </div>`,
      });
    case "negocio":
      return L.divIcon({
        className: "",
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        html: `<div style="${base}width:38px;height:38px;background:#0f172a;border:3px solid #fff">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>
        </div>`,
      });
    case "pedido":
      return L.divIcon({
        className: "",
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        html: `<div style="${base}width:34px;height:34px;background:#f97316;border:3px solid #fff;color:#fff;font-weight:800;font-size:12px;box-shadow:0 4px 10px rgba(249,115,22,.4)">${m.label ?? ""}</div>`,
      });
    default:
      return L.divIcon({
        className: "",
        iconSize: [40, 48],
        iconAnchor: [20, 46],
        html: `<svg width="40" height="48" viewBox="0 0 40 48"><path d="M20 47s16-15.6 16-27A16 16 0 0 0 4 20c0 11.4 16 27 16 27z" fill="#ea580c" stroke="#fff" stroke-width="3"/><circle cx="20" cy="20" r="7" fill="#fff"/></svg>`,
      });
  }
}

function FitBounds({ points, fitKey }: { points: LatLng[]; fitKey?: string }) {
  const map = useMap();
  useEffect(() => {
    if (!fitKey || points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], Math.max(map.getZoom(), 16));
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [48, 48], maxZoom: 17 });
    // Solo se re-encuadra cuando cambia fitKey, no con cada movimiento del repartidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

function ClickHandler({ onMapClick }: { onMapClick?: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Recenter({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng]);
  }, [center.lat, center.lng, map]);
  return null;
}

export default function MapCanvas({
  center,
  zoom = 15,
  markers = [],
  route,
  fitKey,
  onMapClick,
  className = "h-72",
}: MapCanvasProps) {
  const points = useMemo(() => markers.map((m) => m.position), [markers]);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      zoomControl={false}
      attributionControl
      className={`w-full ${className}`}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {route && route.length > 1 && (
        <>
          <Polyline positions={route.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#0e7490", weight: 9, opacity: 0.25 }} />
          <Polyline positions={route.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#0891b2", weight: 5 }} />
        </>
      )}
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.position.lat, m.position.lng]}
          icon={icon(m)}
          draggable={m.draggable}
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              m.onDragEnd?.({ lat: p.lat, lng: p.lng });
            },
            click: () => m.onClick?.(),
          }}
        >
          {m.label && m.kind !== "pedido" && (
            <Tooltip direction="top" offset={[0, -24]} permanent={m.permanent} className={m.permanent ? "eta-tip" : undefined}>
              {m.label}
            </Tooltip>
          )}
        </Marker>
      ))}
      <FitBounds points={points} fitKey={fitKey} />
      {onMapClick && <ClickHandler onMapClick={onMapClick} />}
      {!fitKey && <Recenter center={center} />}
    </MapContainer>
  );
}
