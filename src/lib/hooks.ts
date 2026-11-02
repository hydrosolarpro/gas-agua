"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "./supabase/client";
import { distanceM, fetchRoute, type Route } from "./geo";
import type { AppRole, Business, DriverLocation, LatLng, Order, Profile } from "./types";

/**
 * Una misma cuenta (celular + PIN) puede actuar con varios roles:
 * todos pueden pedir como cliente; el dueño además gestiona su negocio y reparte; el administrador administra.
 */
export const capabilities = (p: Pick<Profile, "role" | "is_admin">): AppRole[] => {
  const caps: AppRole[] = [];
  if (p.is_admin) caps.push("admin");
  if (p.role === "dueno") caps.push("dueno");
  if (p.role === "dueno" || p.role === "repartidor") caps.push("repartidor");
  caps.push("cliente");
  return caps;
};

const ROLE_KEY = "rol_activo";

/** Recuerda con qué rol está trabajando la persona en este dispositivo. */
export function rememberRole(role: AppRole) {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {}
}

/** Rol activo: el último elegido si la cuenta aún lo tiene; si no, el de mayor jerarquía. */
export function preferredRole(p: Pick<Profile, "role" | "is_admin">): AppRole {
  const caps = capabilities(p);
  try {
    const saved = localStorage.getItem(ROLE_KEY) as AppRole | null;
    if (saved && caps.includes(saved)) return saved;
  } catch {}
  return caps[0];
}

/** Pantalla de inicio de cada rol. */
export const homeFor = (role: AppRole) =>
  ({ admin: "/admin", dueno: "/panel", repartidor: "/repartidor", cliente: "/cliente" })[role];

export type Session = {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  business: Business | null;
  reload: () => Promise<void>;
};

/**
 * Carga usuario, perfil y negocio (propio o donde reparte).
 * Si se pasan roles, redirige a quien no tenga sesión o no tenga ese rol.
 */
export function useSession(roles?: AppRole[]): Session {
  const router = useRouter();
  const [state, setState] = useState<Omit<Session, "reload">>({
    loading: true,
    user: null,
    profile: null,
    business: null,
  });
  const rolesKey = roles?.join(",");

  const load = useCallback(async () => {
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) {
      setState({ loading: false, user: null, profile: null, business: null });
      if (rolesKey) {
        const p = location.pathname;
        const rol = p.startsWith("/admin") ? "admin" : p.startsWith("/panel") ? "dueno" : p.startsWith("/repartidor") ? "repartidor" : "";
        router.replace(`/ingresar?next=${encodeURIComponent(p)}${rol ? `&rol=${rol}` : ""}`);
      }
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
    let business: Business | null = null;
    if (profile?.role === "dueno") {
      ({ data: business } = await supabase.from("businesses").select("*").eq("owner_id", user.id).maybeSingle<Business>());
    } else if (profile?.role === "repartidor") {
      const { data: member } = await supabase
        .from("business_members")
        .select("businesses(*)")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle<{ businesses: Business }>();
      business = member?.businesses ?? null;
    }
    setState({ loading: false, user, profile, business });

    if (rolesKey && profile) {
      if (!profile.onboarded) router.replace("/bienvenida");
      else if (!rolesKey.split(",").some((r) => capabilities(profile).includes(r as AppRole))) router.replace("/inicio");
    }
  }, [router, rolesKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de la sesión
    load();
  }, [load]);

  return { ...state, reload: load };
}

/** Un pedido con sus productos, actualizado en vivo. */
export function useOrder(orderId: string | undefined) {
  const [order, setOrder] = useState<Order | null | undefined>(undefined);

  const load = useCallback(async () => {
    if (!orderId) return;
    const { data } = await supabaseBrowser()
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .maybeSingle<Order>();
    setOrder(data);
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`order-${orderId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, (payload) =>
        setOrder((prev) => (prev ? { ...prev, ...(payload.new as Order), order_items: prev.order_items } : prev)),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, load]);

  return { order, setOrder, reload: load };
}

/** Posición del repartidor en vivo (Supabase Realtime). */
export function useDriverLocation(driverId: string | null | undefined) {
  const [location, setLocation] = useState<DriverLocation | null>(null);

  useEffect(() => {
    if (!driverId) return;
    const supabase = supabaseBrowser();
    let alive = true;
    supabase
      .from("driver_locations")
      .select("*")
      .eq("driver_id", driverId)
      .maybeSingle<DriverLocation>()
      .then(({ data }) => alive && setLocation(data));

    const channel = supabase
      .channel(`driver-${driverId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_locations", filter: `driver_id=eq.${driverId}` },
        (payload) => setLocation(payload.new as DriverLocation),
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [driverId]);

  return driverId ? location : null;
}

/** Ruta y tiempo estimado; se recalcula si el origen se movió más de 60 m. */
export function useRoute(from: LatLng | null, to: LatLng | null) {
  const [route, setRoute] = useState<Route | null>(null);
  const lastFrom = useRef<LatLng | null>(null);
  const lastTo = useRef<string>("");

  useEffect(() => {
    if (!from || !to) return;
    const toKey = `${to.lat},${to.lng}`;
    if (lastTo.current === toKey && lastFrom.current && distanceM(lastFrom.current, from) < 60) return;
    lastFrom.current = from;
    lastTo.current = toKey;
    const ctrl = new AbortController();
    fetchRoute(from, to, ctrl.signal).then((r) => r && setRoute(r));
    return () => ctrl.abort();
  }, [from?.lat, from?.lng, to?.lat, to?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return from && to ? route : null;
}

export type ShareState = "apagado" | "activo" | "sin_permiso" | "no_soportado";

/** El repartidor comparte su GPS mientras `active` sea true. */
export function useShareLocation(active: boolean, driverId: string | null | undefined) {
  const [state, setState] = useState<ShareState>("apagado");
  const [position, setPosition] = useState<LatLng | null>(null);
  const lastSent = useRef<{ at: number; p: LatLng } | null>(null);

  useEffect(() => {
    if (!active || !driverId) {
      setState("apagado"); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    if (!("geolocation" in navigator)) {
      setState("no_soportado");
      return;
    }
    const supabase = supabaseBrowser();
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPosition(p);
        setState("activo");
        const now = Date.now();
        const last = lastSent.current;
        // Envía cada 4 s o si avanzó 15 m, lo que ocurra primero.
        if (last && now - last.at < 4000 && distanceM(last.p, p) < 15) return;
        lastSent.current = { at: now, p };
        supabase
          .from("driver_locations")
          .upsert({
            driver_id: driverId,
            lat: p.lat,
            lng: p.lng,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            accuracy: pos.coords.accuracy,
            updated_at: new Date().toISOString(),
          })
          .then();
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "sin_permiso" : "activo"),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [active, driverId]);

  return { state, position };
}

/** Ubicación actual una sola vez (para "Usar mi ubicación"). */
export function getCurrentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("Tu navegador no permite ubicación"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Activa el permiso de ubicación para continuar"
              : "No pudimos obtener tu ubicación",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}
