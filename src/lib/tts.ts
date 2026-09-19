import "server-only";

/**
 * Sprachausgabe für Wilma, mit Zwischenspeicher für feste Sätze.
 *
 * LiveAvatar liefert im LITE-Modus keine Stimme, sondern erwartet fertiges
 * Audio als PCM 16 Bit / 24 kHz. Alle drei Anbieter können genau dieses
 * Format direkt ausgeben – es ist also keine Umkodierung nötig und der
 * Wechsel bleibt eine Einstellung (`TTS_PROVIDER`).
 *
 * Gemessen mit demselben 64-Zeichen-Satz: ElevenLabs Turbo v2.5 0,35 s,
 * OpenAI 1,4 s, Gemini 3.1 3,9 s. ElevenLabs ist deshalb der Standard,
 * sobald ein Key hinterlegt ist.
 */
type Provider = "elevenlabs" | "openai" | "gemini";

function resolveProvider(): Provider {
  const wanted = process.env.TTS_PROVIDER;
  if (wanted === "elevenlabs" || wanted === "openai" || wanted === "gemini") {
    return wanted;
  }
  return process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "openai";
}

const PROVIDER = resolveProvider();

/**
 * Standardstimme "Sarah – Storyteller": muttersprachlich deutsch, von Leif
 * für Wilma ausgewählt. Wie alle Bibliotheksstimmen braucht sie beim ersten
 * Einsatz nach längerer Pause einen Kaltstart von mehreren Sekunden; den
 * fängt das Vorwärmen beim Gesprächsstart ab, danach liegt sie bei ~0,3 s.
 *
 * Turbo v2.5 statt v3 oder Multilingual: gleiche Sprache, halber Preis pro
 * Zeichen und rund viermal schneller – bei einem Live-Gespräch zählt das
 * erste Wort mehr als die letzte Nuance.
 */
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_MODEL =
  process.env.ELEVENLABS_TTS_MODEL ?? "eleven_turbo_v2_5";
const ELEVENLABS_VOICE =
  process.env.ELEVENLABS_VOICE_ID ?? "XtxuRNfvtd45OyWcp5jr";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
const OPENAI_VOICE = process.env.OPENAI_TTS_VOICE ?? "coral";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL =
  process.env.GEMINI_TTS_MODEL ?? "gemini-3.1-flash-tts-preview";
const GEMINI_VOICE = process.env.GEMINI_TTS_VOICE ?? "Kore";

const REQUEST_TIMEOUT_MS = 30_000;

const SETTINGS: Record<
  Provider,
  { key: string | undefined; model: string; voice: string }
> = {
  elevenlabs: {
    key: ELEVENLABS_KEY,
    model: ELEVENLABS_MODEL,
    voice: ELEVENLABS_VOICE,
  },
  openai: { key: OPENAI_KEY, model: OPENAI_MODEL, voice: OPENAI_VOICE },
  gemini: { key: GEMINI_KEY, model: GEMINI_MODEL, voice: GEMINI_VOICE },
};

const API_KEY = SETTINGS[PROVIDER].key;
const MODEL = SETTINGS[PROVIDER].model;
const VOICE = SETTINGS[PROVIDER].voice;

/**
 * Zwischenspeicher für Vertonungen.
 *
 * Begrüßung und Füllsätze sind bei jedem Gespräch wortgleich; sie werden
 * beim Gesprächsstart vorgewärmt und **angepinnt** – sie fallen nie heraus.
 * Daneben landen kurze Antwortstücke in einem kleinen Bereich, der die
 * ältesten Einträge verdrängt. Ohne die Trennung würden ein paar Antworten
 * die festen Sätze verdrängen, und das Vorwärmen wäre wirkungslos.
 */
const CACHE_MAX_UNPINNED = 24;
const CACHE_MAX_TEXT_LENGTH = 220;
const audioCache = new Map<string, string>();
const pinnedKeys = new Set<string>();

/**
 * Laufende Vertonungen, nach Text. Beim Gesprächsstart wärmt der Server
 * die Begrüßung vor, und fast gleichzeitig fordert der Browser genau diese
 * Begrüßung an. Ohne diese Tabelle würde sie zweimal bezahlt und der
 * zweite Aufruf müsste nicht warten, sondern stünde in Konkurrenz.
 */
const inFlight = new Map<string, Promise<string | null>>();

function remember(key: string, audio: string, pin: boolean) {
  if (pin) pinnedKeys.add(key);

  // Nur nicht angepinnte Einträge zählen gegen die Obergrenze.
  const unpinned = [...audioCache.keys()].filter((k) => !pinnedKeys.has(k));
  if (!pinnedKeys.has(key) && unpinned.length >= CACHE_MAX_UNPINNED) {
    // Map behält die Einfügereihenfolge – der erste ist der älteste.
    audioCache.delete(unpinned[0]);
  }
  audioCache.set(key, audio);
}

export const TTS_CONFIGURED = Boolean(API_KEY);

function cacheKey(text: string) {
  return `${PROVIDER}|${MODEL}|${VOICE}|${text}`;
}

const VOICE_INSTRUCTIONS =
  "Sprich Deutsch als freundliche, professionelle Büroassistentin. " +
  "Ruhiges Tempo, natürliche Betonung, warm aber sachlich – nicht werblich.";

/**
 * Ruft ElevenLabs auf. `output_format=pcm_24000` liefert rohes PCM ohne
 * Header. Eine etwas höhere Stabilität als üblich, weil jede Antwort aus
 * mehreren getrennt vertonten Stücken besteht – schwankt die Betonung
 * zwischen ihnen, hört man die Nahtstellen.
 */
async function synthesizeElevenLabs(
  text: string,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        language_code: "de",
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
        },
      }),
      signal,
    },
  );

  if (!response.ok) {
    console.error(
      `ElevenLabs-TTS fehlgeschlagen (HTTP ${response.status}): ${await response.text()}`,
    );
    return null;
  }

  return Buffer.from(await response.arrayBuffer()).toString("base64");
}

/** Ruft OpenAI auf. `response_format: "pcm"` liefert 24 kHz/16 Bit direkt. */
async function synthesizeOpenAI(
  text: string,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      voice: OPENAI_VOICE,
      input: text,
      instructions: VOICE_INSTRUCTIONS,
      response_format: "pcm",
    }),
    signal,
  });

  if (!response.ok) {
    console.error(
      `OpenAI-TTS fehlgeschlagen (HTTP ${response.status}): ${await response.text()}`,
    );
    return null;
  }

  return Buffer.from(await response.arrayBuffer()).toString("base64");
}

/**
 * Ruft Gemini auf. Die Antwort enthält das Audio bereits als Base64-PCM
 * (24 kHz, 16 Bit, ohne Header) – es kann unverändert weitergereicht
 * werden. Der Sprechstil wird dem Text vorangestellt, Gemini kennt kein
 * eigenes Feld dafür.
 */
async function synthesizeGemini(
  text: string,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${VOICE_INSTRUCTIONS}\n\n${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } },
          },
        },
      }),
      signal,
    },
  );

  if (!response.ok) {
    console.error(
      `Gemini-TTS fehlgeschlagen (HTTP ${response.status}): ${await response.text()}`,
    );
    return null;
  }

  const payload = (await response.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { data?: string } }[] };
    }[];
  };

  const audio =
    payload.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ?? null;

  if (!audio) console.error("Gemini-Antwort ohne Audio:", payload);
  return audio;
}

async function synthesizeUncached(
  text: string,
  { pin = false }: { pin?: boolean } = {},
): Promise<string | null> {
  if (!API_KEY) return null;

  const cacheable = text.length <= CACHE_MAX_TEXT_LENGTH;
  if (cacheable) {
    const key = cacheKey(text);
    const hit = audioCache.get(key);
    if (hit) {
      if (pin) pinnedKeys.add(key);
      return hit;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const synthesize = {
      elevenlabs: synthesizeElevenLabs,
      openai: synthesizeOpenAI,
      gemini: synthesizeGemini,
    }[PROVIDER];
    const audio = await synthesize(text, controller.signal);

    if (!audio) return null;

    if (cacheable) remember(cacheKey(text), audio, pin);

    return audio;
  } catch (error) {
    console.error("Fehler bei der Sprachausgabe:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Liefert Base64-PCM oder null, wenn die Vertonung fehlschlägt. */
export function synthesizeSpeech(
  text: string,
  options: { pin?: boolean } = {},
): Promise<string | null> {
  const key = cacheKey(text);
  const running = inFlight.get(key);
  if (running) {
    if (options.pin) pinnedKeys.add(key);
    return running;
  }

  const request = synthesizeUncached(text, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}

/**
 * Vertont feste Sätze im Hintergrund und pinnt sie an, damit sie später
 * sofort bereitstehen und nicht von Antworten verdrängt werden. Bereits
 * vorhandene Einträge kosten dabei nichts. Fehler bleiben folgenlos – im
 * Ernstfall wird eben doch live vertont.
 */
export function prewarmSpeech(lines: readonly string[]): void {
  for (const line of lines) {
    void synthesizeSpeech(line, { pin: true }).catch(() => undefined);
  }
}
