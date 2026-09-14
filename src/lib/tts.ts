import "server-only";

/**
 * Sprachausgabe über OpenAI, mit Zwischenspeicher für feste Sätze.
 *
 * LiveAvatar liefert im LITE-Modus keine Stimme, sondern erwartet fertiges
 * Audio als PCM 16 Bit / 24 kHz. OpenAI gibt mit `response_format: "pcm"`
 * genau dieses Format aus – es ist also keine Umkodierung nötig.
 */

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
const VOICE = process.env.OPENAI_TTS_VOICE ?? "coral";
const REQUEST_TIMEOUT_MS = 30_000;

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
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        voice: VOICE,
        input: text,
        instructions: VOICE_INSTRUCTIONS,
        response_format: "pcm",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        `OpenAI-TTS fehlgeschlagen (HTTP ${response.status}): ${await response.text()}`
      );
      return null;
    }

    const audio = Buffer.from(await response.arrayBuffer()).toString("base64");

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
