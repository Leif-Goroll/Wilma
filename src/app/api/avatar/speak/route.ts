import { NextRequest, NextResponse } from "next/server";

/**
 * Wandelt Wilmas Antworttext in Sprache um.
 *
 * LiveAvatar liefert im LITE-Modus selbst keine Sprachausgabe, sondern
 * erwartet fertiges Audio als PCM 16 Bit / 24 kHz. OpenAI kann mit
 * `response_format: "pcm"` genau dieses Format direkt ausgeben – deshalb
 * ist hier keinerlei Umkodierung nötig, die Bytes gehen 1:1 weiter.
 */

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts";
const VOICE = process.env.OPENAI_TTS_VOICE ?? "coral";
const REQUEST_TIMEOUT_MS = 30_000;

/** Schützt vor versehentlich riesigen Anfragen (und deren Kosten). */
const MAX_TEXT_LENGTH = 2_000;

const VOICE_INSTRUCTIONS =
  "Sprich Deutsch als freundliche, professionelle Büroassistentin. " +
  "Ruhiges Tempo, natürliche Betonung, warm aber sachlich – nicht werblich.";

export async function POST(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json(
      { error: "Sprachausgabe ist nicht konfiguriert." },
      { status: 503 }
    );
  }

  let text: string;
  try {
    const body = (await request.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "Text fehlt." }, { status: 400 });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
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
      const detail = await response.text();
      console.error(`OpenAI-TTS fehlgeschlagen (HTTP ${response.status}): ${detail}`);
      return NextResponse.json(
        { error: "Sprachausgabe gerade nicht verfügbar." },
        { status: 502 }
      );
    }

    // LiveAvatar erwartet das Audio als Base64-String im Kommando-Event.
    const pcm = Buffer.from(await response.arrayBuffer());

    return NextResponse.json({
      audio: pcm.toString("base64"),
      sampleRate: 24_000,
    });
  } catch (error) {
    console.error("Fehler bei der Sprachausgabe:", error);
    return NextResponse.json(
      { error: "Sprachausgabe gerade nicht verfügbar." },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
