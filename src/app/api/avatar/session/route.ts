import { NextResponse } from "next/server";

/**
 * Mintet ein kurzlebiges LiveAvatar-Session-Token für den Browser.
 *
 * Der HeyGen-API-Key darf den Server niemals verlassen: Er berechtigt zum
 * Verbrauch von Credits (LITE-Modus: 1 Credit ≈ 1 Minute ≈ 0,10–0,12 $).
 * Der Client bekommt ausschließlich das Session-Token, das nur für diese
 * eine Sitzung gilt.
 */

const API_KEY = process.env.HEYGEN_API_KEY;
const AVATAR_ID = process.env.LIVEAVATAR_AVATAR_ID;
const BASE_URL = process.env.LIVEAVATAR_API_URL ?? "https://api.liveavatar.com";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Obergrenze einer Sitzung in Sekunden. Jede Minute kostet ein Credit,
 * deshalb bewusst knapp – per Umgebungsvariable anhebbar, wenn der Plan
 * längere Sitzungen erlaubt (Free: 2 Min, Starter: 5, Essential: 20).
 */
const MAX_SESSION_SECONDS = Number(
  process.env.LIVEAVATAR_MAX_SESSION_SECONDS ?? 120
);

export async function POST() {
  if (!API_KEY || !AVATAR_ID) {
    // Kein 500: Der Sprachmodus ist optional, die UI blendet ihn dann aus.
    return NextResponse.json(
      { error: "Sprachmodus ist nicht konfiguriert." },
      { status: 503 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "LITE",
        avatar_id: AVATAR_ID,
        video_settings: { quality: "high", encoding: "H264" },
        // Harte Obergrenze serverseitig: Selbst wenn der Browser abstürzt
        // oder jemand den Tab offen liegen lässt, endet die Abrechnung
        // hier. Der Free-Plan kappt ohnehin bei 2 Minuten.
        max_session_duration: MAX_SESSION_SECONDS,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(
        `LiveAvatar-Token fehlgeschlagen (HTTP ${response.status}): ${detail}`
      );
      return NextResponse.json(
        { error: "Wilma kann gerade nicht sprechen." },
        { status: 502 }
      );
    }

    // LiveAvatar antwortet als { code, data: { session_token, session_id },
    // message }. Das Root-Objekt wird zusätzlich akzeptiert, falls die API
    // die Hülle in einer späteren Version weglässt.
    const payload = (await response.json()) as Record<string, unknown>;
    const source = (
      payload.data && typeof payload.data === "object" ? payload.data : payload
    ) as Record<string, unknown>;

    if (typeof source.session_token !== "string") {
      console.error("LiveAvatar-Antwort ohne session_token:", payload);
      return NextResponse.json(
        { error: "Wilma kann gerade nicht sprechen." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      sessionToken: source.session_token,
      sessionId:
        typeof source.session_id === "string" ? source.session_id : null,
    });
  } catch (error) {
    console.error("Fehler beim Anlegen der LiveAvatar-Session:", error);
    return NextResponse.json(
      { error: "Wilma kann gerade nicht sprechen." },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
