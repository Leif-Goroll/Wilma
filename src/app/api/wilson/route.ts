import { NextRequest, NextResponse } from "next/server";

const WEBHOOK_URL = process.env.WILSON_WEBHOOK_URL;
const REQUEST_TIMEOUT_MS = 20_000;

interface WilsonRequestBody {
  message?: unknown;
  sessionId?: unknown;
}

export async function POST(request: NextRequest) {
  if (!WEBHOOK_URL) {
    console.error("WILSON_WEBHOOK_URL ist nicht gesetzt.");
    return NextResponse.json(
      { error: "Wilson ist derzeit nicht konfiguriert." },
      { status: 500 }
    );
  }

  let body: WilsonRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "Nachricht fehlt." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const webhookResponse = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId }),
      signal: controller.signal,
    });

    if (!webhookResponse.ok) {
      throw new Error(
        `n8n-Webhook antwortete mit Status ${webhookResponse.status}`
      );
    }

    const extracted = await extractReply(webhookResponse);
    const { reply, action } = stripActionMarker(extracted.reply);
    return NextResponse.json({ reply, action: action ?? extracted.action });
  } catch (error) {
    console.error("Fehler beim Aufruf des Wilson-Webhooks:", error);
    return NextResponse.json(
      { error: "Wilson ist gerade nicht erreichbar." },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

interface ExtractedReply {
  reply: string;
  action?: string;
}

/**
 * n8n kann den Antworttext in unterschiedlicher Form liefern (reines JSON-
 * Feld oder Klartext) und optional ein `action`-Feld setzen, um z. B. den
 * Terminbuchungs-Button auszulösen (`action: "book_appointment"`). Der
 * "Respond to Webhook"-Node verschachtelt die Felder dabei oft eine Ebene
 * tiefer unter `output` (z. B. `{"output":{"reply":"…","action":"…"}}`),
 * je nachdem, welches Feld im Workflow zurückgegeben wird.
 */
async function extractReply(response: Response): Promise<ExtractedReply> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data: unknown = await response.json();
    return parseReplyPayload(data);
  }

  return { reply: await response.text() };
}

function parseReplyPayload(data: unknown): ExtractedReply {
  if (typeof data === "string") {
    return { reply: data };
  }

  if (!data || typeof data !== "object") {
    return { reply: JSON.stringify(data) };
  }

  const record = data as Record<string, unknown>;

  // Falls die eigentlichen Felder unter "output" verschachtelt sind, dort
  // weitersuchen; ansonsten direkt im Root-Objekt.
  const source =
    record.output && typeof record.output === "object"
      ? (record.output as Record<string, unknown>)
      : record;

  const candidate = source.reply ?? source.text ?? source.message;

  if (typeof candidate === "string") {
    return {
      reply: candidate,
      action: typeof source.action === "string" ? source.action : undefined,
    };
  }

  // "output" selbst ist der Antworttext (z. B. { output: "…" }).
  if (typeof record.output === "string") {
    return {
      reply: record.output,
      action: typeof record.action === "string" ? record.action : undefined,
    };
  }

  return { reply: JSON.stringify(data) };
}

const ACTION_MARKER_REGEX = /\s*\[ACTION:([a-zA-Z0-9_]+)\]\s*/g;

/**
 * Der n8n-Agent signalisiert Aktionen aktuell als Textmarker am Ende der
 * Antwort (z. B. "…zur Verfügung? [ACTION:ask_budget]"), nicht als
 * separates JSON-Feld. Diese Funktion entfernt *alle* Marker aus dem
 * sichtbaren Text und gibt den ersten als Aktion zurück.
 *
 * Es müssen wirklich alle verschwinden: Im Sprachmodus geht dieser Text an
 * die Sprachausgabe, und ein übersehener Marker würde vorgelesen.
 */
function stripActionMarker(text: string): {
  reply: string;
  action?: string;
} {
  const matches = [...text.matchAll(ACTION_MARKER_REGEX)];
  if (matches.length === 0) {
    return { reply: text };
  }

  // Ersatz durch ein Leerzeichen, sonst kleben die Sätze zusammen
  // ("Budget?Und Ihr Zeitrahmen?"); überzählige Leerzeichen danach weg.
  const reply = text
    .replace(ACTION_MARKER_REGEX, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { reply, action: matches[0][1] };
}
