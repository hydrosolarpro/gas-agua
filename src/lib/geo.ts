import type { LatLng } from "./types";

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export function distanceM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Route = { points: LatLng[]; distanceM: number; durationS: number };

/** Ruta en auto/moto con OSRM (servidor público; cambiar por uno propio en producción). */
export async function fetchRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<Route | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.routes?.[0];
    if (!r) return null;
    return {
      points: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => ({ lat, lng })),
      distanceM: r.distance,
      durationS: r.duration,
    };
  } catch {
    return null;
  }
}

/** Dirección aproximada a partir de coordenadas (OpenStreetMap Nominatim). */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=18&addressdetails=1&accept-language=es`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address ?? {};
    const street = [a.road, a.house_number].filter(Boolean).join(" ");
    const area = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.town || a.city;
    return [street, area].filter(Boolean).join(", ") || data.display_name || null;
  } catch {
    return null;
  }
}

export function formatEta(seconds: number) {
  const min = Math.max(1, Math.round(seconds / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function googleMapsLink(to: LatLng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;
}

export function wazeLink(to: LatLng) {
  return `https://waze.com/ul?ll=${to.lat},${to.lng}&navigate=yes`;
}
