// Sonidos de aviso sintetizados con WebAudio (no hay archivos de audio que descargar).
// Los navegadores solo dejan sonar después de un toque o tecla de la persona, por eso `unlockAudio` se llama en el primer gesto.
// Todos los avisos suenan FUERTE: tonos a volumen alto, con timbres que se oyen en una calle ruidosa, pasados por un
// compresor para que suban de volumen sin distorsionar, y repetidos tres veces para que no se pasen por alto.

export type ChimeKind = "venta" | "derivado" | "demo" | "pago" | "llegada" | "cancelado";

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;
let master: AudioNode | null = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      // Compresor + volumen general: sube el nivel medio del sonido al máximo sin que se corte.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24;
      comp.knee.value = 12;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      const gain = ctx.createGain();
      gain.gain.value = 1.8;
      comp.connect(gain).connect(ctx.destination);
      master = comp;
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {}
}

export const audioReady = () => ctx?.state === "running";

function tone(freq: number, start: number, dur: number, gain = 0.5, type: OscillatorType = "triangle") {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Clic metálico corto, como el cajón de una caja registradora. */
function click(start: number) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + start;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = 0.7;
  src.buffer = buf;
  src.connect(g).connect(master);
  src.start(t0);
}

/** Reproduce el aviso (fuerte y repetido). Devuelve false si el navegador aún no permitió sonido. */
export function playChime(kind: ChimeKind): boolean {
  if (!ctx || !master || ctx.state !== "running") return false;
  if (kind === "venta") {
    // «¡ka-ching!» tipo caja registradora, tres veces
    for (const at of [0, 0.7, 1.4]) {
      click(at);
      tone(1568, at + 0.06, 0.65, 0.55, "square");
      tone(2093, at + 0.06, 0.8, 0.4, "triangle");
      tone(1319, at + 0.2, 0.55, 0.35, "square");
    }
  } else if (kind === "derivado") {
    for (const at of [0, 0.9, 1.8]) {
      tone(660, at, 0.2, 0.55, "square");
      tone(880, at + 0.19, 0.2, 0.55, "square");
      tone(1175, at + 0.38, 0.5, 0.6, "square");
    }
  } else if (kind === "demo") {
    for (const at of [0, 0.8]) {
      tone(988, at, 0.12, 0.5, "square");
      tone(1319, at + 0.12, 0.5, 0.5, "square");
    }
  } else if (kind === "llegada") {
    // Timbre de puerta «ding-dong» insistente, tres veces
    for (const at of [0, 1.0, 2.0]) {
      tone(1319, at, 0.55, 0.6, "triangle");
      tone(1760, at, 0.55, 0.3, "sine");
      tone(988, at + 0.45, 0.8, 0.6, "triangle");
      tone(1319, at + 0.45, 0.8, 0.3, "sine");
    }
  } else if (kind === "cancelado") {
    // Sirena descendente, tres veces
    for (const at of [0, 0.75, 1.5]) {
      tone(1046, at, 0.22, 0.6, "sawtooth");
      tone(784, at + 0.22, 0.22, 0.6, "sawtooth");
      tone(523, at + 0.44, 0.28, 0.6, "sawtooth");
    }
  } else {
    // pago por validar
    for (const at of [0, 0.85, 1.7]) {
      tone(784, at, 0.22, 0.55, "square");
      tone(1047, at + 0.2, 0.55, 0.55, "square");
    }
  }
  return true;
}
