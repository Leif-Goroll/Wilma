import { NextRequest, NextResponse } from "next/server";
import { TTS_CONFIGURED, prewarmSpeech, synthesizeSpeech } from "@/lib/tts";
import { PREWARM_LINES } from "@/lib/voiceLines";

/**
 * Wandelt Wilmas Antworttext in Sprache um.
 *
 * Die eigentliche Arbeit macht `src/lib/tts.ts` – dieselbe Funktion wärmt
 * beim Gesprächsstart die festen Sätze vor, damit Begrüßung und Füllsätze
 * später ohne Wartezeit bereitstehen.
 */

/** Schützt vor versehentlich riesigen Anfragen (und deren Kosten). */
const MAX_TEXT_LENGTH = 2_000;

export async function POST(request: NextRequest) {
  if (!TTS_CONFIGURED) {
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

  // „Nur Stimme“ hat keinen Sitzungsaufbau, der die festen Sätze vorwärmt
  // (wie /api/avatar/session für den Avatar). Bereits Vorhandenes kostet
  // dabei nichts.
  prewarmSpeech(PREWARM_LINES);

  const audio = await synthesizeSpeech(text.slice(0, MAX_TEXT_LENGTH));

  if (!audio) {
    return NextResponse.json(
      { error: "Sprachausgabe gerade nicht verfügbar." },
      { status: 502 }
    );
  }

  return NextResponse.json({ audio, sampleRate: 24_000 });
}
