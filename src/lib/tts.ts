import "server-only";

/**
 * Sprachausgabe über OpenAI, mit Zwischenspeicher für feste Sätze.
 *
 * LiveAvatar liefert im LITE-Modus keine Stimme, sondern erwartet fertiges
 * Audio als PCM 16 Bit / 24 kHz. OpenAI gibt mit `response_format: "pcm"`
 * genau dieses Format aus – es ist also keine Umkodierung nötig.
 */

/**
 * Anbieter der Sprachausgabe. Beide liefern PCM 16 Bit / 24 kHz – genau
 * das Format, das LiveAvatar erwartet –, es ist also keine Umkodierung
 * nötig und der Wechsel bleibt eine Einstellung.
 */
type Provider = "openai" | "gemini";

const PROVIDER: Provider =
  process.env.TTS_PROVIDER === "gemini" ? "gemini" : "openai";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
const OPENAI_VOICE = process.env.OPENAI_TTS_VOICE ?? "coral";

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-3.1-flash-tts-preview";
const GEMINI_VOICE = process.env.GEMINI_TTS_VOICE ?? "Kore";

const REQUEST_TIMEOUT_MS = 30_000;

const API_KEY = PROVIDER === "gemini" ? GEMINI_KEY : OPENAI_KEY;
const MODEL = PROVIDER === "gemini" ? GEMINI_MODEL : OPENAI_MODEL;
const VOICE = PROVIDER === "gemini" ? GEMINI_VOICE : OPENAI_VOICE;

/**
 * Begrüßung und Füllsätze sind bei jedem Gespräch wortgleich. Sie jedes Mal
 * neu zu vertonen kostet zwei Sekunden und Geld – beides ohne Gegenwert.
 * Nur kurze Texte kommen hinein; lange Antworten sind ohnehin jedes Mal
 * anders und würden den Speicher nur füllen.
 */
const CACHE_MAX_ENTRIES = 12;
const CACHE_MAX_TEXT_LENGTH = 220;
const audioCache = new Map<string, string>();

export const TTS_CONFIGURED = Boolean(API_KEY);

function cacheKey(text: string) {
  return `${MODEL}|${VOICE}|${text}`;
}

const VOICE_INSTRUCTIONS =
  "Sprich Deutsch als freundliche, professionelle Büroassistentin. " +
  "Ruhiges Tempo, natürliche Betonung, warm aber sachlich – nicht werblich.";

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

/** Liefert Base64-PCM oder null, wenn die Vertonung fehlschlägt. */
export async function synthesizeSpeech(text: string): Promise<string | null> {
  if (!API_KEY) return null;

  const cacheable = text.length <= CACHE_MAX_TEXT_LENGTH;
  if (cacheable) {
    const hit = audioCache.get(cacheKey(text));
    if (hit) return hit;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const audio =
      PROVIDER === "gemini"
        ? await synthesizeGemini(text, controller.signal)
        : await synthesizeOpenAI(text, controller.signal);

    if (!audio) return null;

    if (cacheable) {
      // Ältesten Eintrag verdrängen (Map behält die Einfügereihenfolge).
      if (audioCache.size >= CACHE_MAX_ENTRIES) {
        const oldest = audioCache.keys().next().value;
        if (oldest !== undefined) audioCache.delete(oldest);
      }
      audioCache.set(cacheKey(text), audio);
    }

    return audio;
  } catch (error) {
    console.error("Fehler bei der Sprachausgabe:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Vertont feste Sätze im Hintergrund, damit sie später sofort bereitstehen.
 * Fehler bleiben folgenlos – im Ernstfall wird eben doch live vertont.
 */
export function prewarmSpeech(lines: readonly string[]): void {
  for (const line of lines) {
    void synthesizeSpeech(line).catch(() => undefined);
  }
}
