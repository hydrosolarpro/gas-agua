// Sonidos de aviso sintetizados con WebAudio (no hay archivos de audio que descargar).
// Los navegadores solo dejan sonar después de un toque o tecla de la persona, por eso `unlockAudio` se llama en el primer gesto.

export type ChimeKind = "venta" | "derivado" | "demo" | "pago";

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

export function unlockAudio() {
  try {
    if (!ctx) {
      const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {}
}

export const audioReady = () => ctx?.state === "running";

function tone(freq: number, start: number, dur: number, gain = 0.18, type: OscillatorType = "sine") {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Clic metálico corto, como el cajón de una caja registradora. */
function click(start: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  g.gain.value = 0.25;
  src.buffer = buf;
  src.connect(g).connect(ctx.destination);
  src.start(t0);
}

/** Reproduce el aviso. Devuelve false si el navegador aún no permitió sonido. */
export function playChime(kind: ChimeKind): boolean {
  if (!ctx || ctx.state !== "running") return false;
  if (kind === "venta") {
    // «¡ka-ching!»: clic + campanas brillantes, dos veces para que se note
    for (const at of [0, 0.55]) {
      click(at);
      tone(1568, at + 0.06, 0.8, 0.2);
      tone(2093, at + 0.06, 1.0, 0.12);
      tone(1319, at + 0.2, 0.7, 0.1);
    }
  } else if (kind === "derivado") {
    tone(660, 0, 0.18, 0.2, "triangle");
    tone(880, 0.17, 0.18, 0.2, "triangle");
    tone(1175, 0.34, 0.6, 0.22, "triangle");
  } else if (kind === "demo") {
    tone(988, 0, 0.1, 0.16, "square");
    tone(1319, 0.1, 0.55, 0.16, "square");
  } else {
    tone(784, 0, 0.2, 0.2);
    tone(1047, 0.18, 0.55, 0.2);
  }
  return true;
}
