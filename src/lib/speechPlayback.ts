"use client";

/**
 * Spielt Wilmas Stimme im Modus „Nur Stimme“ ab – ohne LiveAvatar.
 *
 * `/api/avatar/speak` liefert dasselbe wie für den Avatar: PCM 16 Bit, mono,
 * 24 kHz als Base64. Der Browser kann das nicht direkt abspielen, deshalb
 * wird es hier in einen AudioBuffer umgerechnet und über die Web Audio API
 * ausgegeben.
 *
 * Äußerungen werden der Reihe nach gespielt (wie LiveAvatar sie reiht): ein
 * Zwischenruf wird zu Ende gesprochen, bevor die Antwort beginnt.
 * `stopSpeech()` bricht alles ab, was läuft oder wartet – zum Dazwischenreden.
 */

let context: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
/** Zählt Abbrüche – wartende Äußerungen merken daran, dass sie verfallen sind. */
let generation = 0;
let queue: Promise<void> = Promise.resolve();

function audioContext(): AudioContext | null {
  if (context) return context;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/**
 * Muss im Klick des Besuchers aufgerufen werden: Browser geben Ton erst nach
 * einer Nutzeraktion frei. Ohne das bliebe die Begrüßung stumm.
 */
export function unlockSpeech(): void {
  const ctx = audioContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function toBuffer(ctx: AudioContext, base64: string, sampleRate: number) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const samples = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
  return buffer;
}

async function fetchSpeech(text: string) {
  const response = await fetch("/api/avatar/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { audio?: unknown; sampleRate?: unknown };
  if (typeof data.audio !== "string" || !data.audio) return null;
  return {
    audio: data.audio,
    sampleRate: typeof data.sampleRate === "number" ? data.sampleRate : 24_000,
  };
}

interface SpeakOptions {
  /** Kurz vor dem Abspielen geprüft: true heißt, diese Äußerung entfällt. */
  skipIf?: () => boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Vertont `text` und spielt ihn, sobald alles davor Gesprochene fertig ist.
 * Löst auf, wenn er zu Ende gespielt, übersprungen oder abgebrochen ist –
 * nie mit Fehler: Schlägt die Vertonung fehl, bleibt Wilma eben stumm und
 * der Text steht trotzdem auf dem Bildschirm.
 */
export function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  const myGeneration = generation;
  // Die Vertonung startet sofort, nicht erst wenn die Vorgängerin fertig ist –
  // so liegt die Antwort meist schon bereit, wenn der Zwischenruf endet.
  const speech = fetchSpeech(text).catch(() => null);

  const run = async () => {
    const data = await speech;
    const ctx = audioContext();
    if (!data || !ctx || myGeneration !== generation || options.skipIf?.()) return;

    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    const source = ctx.createBufferSource();
    source.buffer = toBuffer(ctx, data.audio, data.sampleRate);
    source.connect(ctx.destination);

    await new Promise<void>((resolve) => {
      source.onended = () => {
        if (current === source) current = null;
        options.onEnd?.();
        resolve();
      };
      current = source;
      options.onStart?.();
      source.start();
    });
  };

  queue = queue.then(run, run);
  return queue;
}

/** Bricht die laufende und alle wartenden Äußerungen ab. */
export function stopSpeech(): void {
  generation++;
  if (current) {
    try {
      current.stop();
    } catch {
      // schon beendet
    }
    current = null;
  }
}
