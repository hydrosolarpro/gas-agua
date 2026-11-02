"use client";

import { useEffect, useRef } from "react";
import { Wallet } from "lucide-react";

// Recorrido de ejemplo del negocio (A) a la casa del cliente (B), con esquinas redondeadas como calles reales.
const ROUTE = "M50 205 H110 Q130 205 130 185 V140 Q130 120 150 120 H230 Q250 120 250 100 V75 Q250 55 270 55 H350";
const TRIP_MS = 9000; // lo que dura el viaje en pantalla
const HOLD_MS = 2200; // pausa al llegar antes de repetir

/**
 * Demostración del seguimiento en vivo: el repartidor avanza del punto A al B dejando su rastro,
 * el tiempo estimado baja y al llegar se marca como entregado. Al tocarlo o pasar el mouse se pausa.
 */
export function LiveMapDemo() {
  const routeRef = useRef<SVGPathElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const riderRef = useRef<SVGGElement>(null);
  const arrowRef = useRef<SVGGElement>(null);
  const etaRef = useRef<HTMLSpanElement>(null);
  const etaLabelRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    const route = routeRef.current;
    const trail = trailRef.current;
    const rider = riderRef.current;
    const arrow = arrowRef.current;
    if (!route || !trail || !rider || !arrow) return;

    const length = route.getTotalLength();
    trail.style.strokeDasharray = String(length);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let elapsed = reduceMotion ? TRIP_MS * 0.55 : 0; // sin movimiento: se muestra una posición fija a mitad de camino
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current && !reduceMotion) elapsed = (elapsed + dt) % (TRIP_MS + HOLD_MS);

      const t = Math.min(1, elapsed / TRIP_MS);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // arranca y frena suave
      const p = route.getPointAtLength(length * eased);
      const ahead = route.getPointAtLength(Math.min(length, length * eased + 3));
      const angle = (Math.atan2(ahead.y - p.y, ahead.x - p.x) * 180) / Math.PI + 90;

      rider.setAttribute("transform", `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
      if (t < 1) arrow.setAttribute("transform", `rotate(${angle.toFixed(1)})`);
      trail.style.strokeDashoffset = String(length * (1 - eased));

      const arrived = t >= 1;
      if (etaRef.current) etaRef.current.textContent = arrived ? "¡Llegó!" : `${Math.max(1, Math.ceil((1 - eased) * 6))} min`;
      if (etaLabelRef.current) etaLabelRef.current.textContent = arrived ? "Tu pedido" : "Llega en";
      if (chipRef.current) {
        chipRef.current.textContent = arrived ? "Entregado" : "En camino";
        chipRef.current.dataset.done = String(arrived);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="card relative overflow-hidden p-[clamp(0.75rem,2dvh,1.25rem)]"
      onPointerEnter={() => (pausedRef.current = true)}
      onPointerLeave={() => (pausedRef.current = false)}
    >
      <div className="flex items-center justify-between">
        <p className="font-bold">Pedido #A7F3C2</p>
        <span
          ref={chipRef}
          data-done="false"
          className="chip bg-indigo-100 text-indigo-800 transition-colors duration-300 data-[done=true]:bg-emerald-100 data-[done=true]:text-emerald-800"
        >
          En camino
        </span>
      </div>

      <div className="mt-[clamp(0.4rem,1.2dvh,1rem)] overflow-hidden rounded-2xl ring-1 ring-slate-200">
        <svg viewBox="0 0 400 260" className="mx-auto block h-auto max-h-[clamp(5rem,16dvh,22rem)] w-full select-none" role="img" aria-label="Mapa de ejemplo: el repartidor avanza del negocio a tu casa">
          <defs>
            <pattern id="grain" width="8" height="8" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.6" fill="#cbd8e6" opacity="0.5" />
            </pattern>
          </defs>

          {/* Terreno */}
          <rect width="400" height="260" fill="#eef3f9" />
          <rect width="400" height="260" fill="url(#grain)" />
          <path d="M-10 70 C 60 40, 120 95, 190 70 S 330 20, 410 60" fill="none" stroke="#cfe6f6" strokeWidth="26" strokeLinecap="round" />
          <rect x="268" y="150" width="96" height="66" rx="14" fill="#d9efe1" />
          <circle cx="292" cy="172" r="7" fill="#bfe3cd" />
          <circle cx="318" cy="190" r="9" fill="#bfe3cd" />
          <circle cx="344" cy="168" r="6" fill="#bfe3cd" />

          {/* Manzanas */}
          {[
            [18, 142, 96, 50], [18, 214, 96, 34], [146, 140, 84, 52], [146, 214, 100, 34],
            [150, 88, 80, 20], [270, 88, 112, 20], [16, 88, 96, 20], [268, 224, 112, 24],
          ].map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} rx="8" fill="#dde7f2" />
          ))}

          {/* Calles */}
          <g stroke="#ffffff" strokeLinecap="round" strokeWidth="9" fill="none">
            <path d="M10 205 H390" />
            <path d="M10 120 H390" />
            <path d="M10 55 H390" />
            <path d="M130 10 V250" />
            <path d="M250 10 V250" />
            <path d="M330 120 V250" strokeWidth="7" />
          </g>

          {/* Recorrido: base y rastro ya recorrido */}
          <path ref={routeRef} d={ROUTE} fill="none" stroke="#9ec9d9" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
          <path ref={trailRef} d={ROUTE} fill="none" stroke="#0891b2" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDashoffset: 1000 }} />

          {/* A: el negocio */}
          <g transform="translate(50 205)">
            <circle r="15" fill="#0f172a" stroke="#fff" strokeWidth="3" />
            <g transform="translate(-8.4 -8.4) scale(0.7)" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
            </g>
          </g>
          <text x="50" y="240" textAnchor="middle" className="fill-slate-600" fontSize="15" fontWeight="700" stroke="#eef3f9" strokeWidth="4" paintOrder="stroke">
            Tu negocio
          </text>

          {/* B: la casa del cliente */}
          <g transform="translate(350 55)">
            <circle r="10" className="dest-ring" fill="#f97316" />
            <path d="M0 0c0 0 -13 -13 -13 -24a13 13 0 1 1 26 0c0 11 -13 24 -13 24z" fill="#ea580c" stroke="#fff" strokeWidth="3" />
            <circle cy="-24" r="5" fill="#fff" />
          </g>
          <text x="350" y="90" textAnchor="middle" className="fill-slate-600" fontSize="15" fontWeight="700" stroke="#eef3f9" strokeWidth="4" paintOrder="stroke">
            Tu casa
          </text>

          {/* Repartidor */}
          <g ref={riderRef} transform="translate(50 205)" style={{ filter: "drop-shadow(0 3px 5px rgba(8,145,178,.45))" }}>
            <circle r="24" fill="#0891b2" opacity="0.16" />
            <circle r="16" fill="#fff" stroke="#0891b2" strokeWidth="3" />
            <g ref={arrowRef}>
              <path d="M0 -8 L7 7 L0 3.5 L-7 7 Z" fill="#0891b2" stroke="#0891b2" strokeWidth="1.5" strokeLinejoin="round" />
            </g>
          </g>
        </svg>
      </div>

      <div className="mt-[clamp(0.4rem,1.2dvh,1rem)] flex items-center justify-between rounded-2xl bg-slate-50 p-[clamp(0.4rem,1.2dvh,0.75rem)]">
        <div>
          <span ref={etaLabelRef} className="block text-sm text-slate-500">
            Llega en
          </span>
          <span ref={etaRef} className="block text-[clamp(1.1rem,3dvh,1.5rem)] font-extrabold leading-tight text-agua-700 tabular-nums">
            6 min
          </span>
        </div>
        <p className="flex items-center gap-2 font-bold">
          <Wallet className="h-5 w-5 text-agua-600" /> Pagas al recibir
        </p>
      </div>
    </div>
  );
}
