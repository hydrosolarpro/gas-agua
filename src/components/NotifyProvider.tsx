"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bell, Bike, CircleDollarSign, Store, Volume2, VolumeX, X } from "lucide-react";
import { audioReady, playChime, unlockAudio, type ChimeKind } from "@/lib/sound";

export type Notice = { kind: ChimeKind; title: string; body?: string; href?: string };
type Toast = Notice & { id: number; silent: boolean };

type Ctx = {
  notify: (n: Notice) => void;
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  test: () => void;
};

const NotifyCtx = createContext<Ctx>({ notify: () => {}, soundOn: true, setSoundOn: () => {}, test: () => {} });
export const useNotify = () => useContext(NotifyCtx);

const STORE_KEY = "avisos_sonido";
const LIFETIME_MS = 10_000;

const LOOK: Record<ChimeKind, { bg: string; Icon: typeof Bell }> = {
  venta: { bg: "from-emerald-600 to-teal-500", Icon: CircleDollarSign },
  pago: { bg: "from-orange-600 to-amber-500", Icon: CircleDollarSign },
  derivado: { bg: "from-indigo-600 to-sky-500", Icon: Bike },
  demo: { bg: "from-fuchsia-600 to-orange-500", Icon: Store },
};

/** Avisos al estilo «venta realizada»: tarjeta que entra desde arriba, sonido, vibración y notificación del navegador. */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [soundOn, setSoundOnState] = useState(true);
  const seq = useRef(0);
  const soundRef = useRef(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY) !== "0";
      soundRef.current = saved;
      setSoundOnState(saved); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {}
    const unlock = () => unlockAudio();
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, unlock, { once: true, passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, unlock));
  }, []);

  const setSoundOn = useCallback((v: boolean) => {
    soundRef.current = v;
    setSoundOnState(v);
    try {
      localStorage.setItem(STORE_KEY, v ? "1" : "0");
    } catch {}
  }, []);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (n: Notice) => {
      const id = ++seq.current;
      const played = soundRef.current ? playChime(n.kind) : true;
      const silent = soundRef.current && !played && !audioReady();
      setToasts((t) => [{ ...n, id, silent }, ...t].slice(0, 4));
      setTimeout(() => dismiss(id), LIFETIME_MS);
      try {
        if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([200, 100, 200]);
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          new Notification(n.title, { body: n.body });
        }
      } catch {}
    },
    [dismiss],
  );

  const test = useCallback(() => {
    unlockAudio();
    // Un instante para que el contexto de audio termine de activarse tras el toque
    setTimeout(() => notify({ kind: "venta", title: "¡Así sonarán tus avisos!", body: "Prueba de sonido" }), 80);
  }, [notify]);

  const value = useMemo(() => ({ notify, soundOn, setSoundOn, test }), [notify, soundOn, setSoundOn, test]);

  return (
    <NotifyCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] mx-auto flex w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-3 sm:left-auto sm:mx-0" aria-live="polite">
        {toasts.map((t) => {
          const { bg, Icon } = LOOK[t.kind];
          const inner = (
            <>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20">
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold leading-tight">{t.title}</span>
                {t.body && <span className="line-clamp-2 text-sm opacity-95">{t.body}</span>}
                {t.silent && <span className="mt-0.5 block text-[11px] opacity-80">Toca la pantalla una vez para activar el sonido</span>}
              </span>
            </>
          );
          return (
            <div key={t.id} role="status" className={`toast-in pointer-events-auto flex items-center gap-3 rounded-2xl bg-gradient-to-r ${bg} p-3 text-white shadow-2xl ring-1 ring-black/5`}>
              {t.href ? (
                <Link href={t.href} onClick={() => dismiss(t.id)} className="flex min-w-0 flex-1 items-center gap-3">
                  {inner}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
              )}
              <button onClick={() => dismiss(t.id)} className="shrink-0 rounded-full p-1.5 text-white/80 hover:bg-white/15" aria-label="Cerrar aviso">
                <X className="h-5 w-5" />
              </button>
            </div>
          );
        })}
      </div>
    </NotifyCtx.Provider>
  );
}

/** Interruptor de sonido para Mi cuenta. */
export function SoundSwitch() {
  const { soundOn, setSoundOn, test } = useNotify();
  return (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-agua-50 p-2 text-agua-700">{soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Avisos con sonido</p>
          <p className="text-sm text-slate-500">Pedidos nuevos, pedidos asignados y negocios nuevos.</p>
        </div>
        <button
          role="switch"
          aria-checked={soundOn}
          onClick={() => setSoundOn(!soundOn)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${soundOn ? "bg-agua-600" : "bg-slate-300"}`}
          aria-label="Activar o silenciar avisos"
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${soundOn ? "left-[1.375rem]" : "left-0.5"}`} />
        </button>
      </div>
      <button onClick={test} className="btn-outline mt-3 w-full !py-2 text-sm">
        <Bell className="h-4 w-4" /> Probar sonido
      </button>
    </section>
  );
}
