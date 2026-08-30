import { NextRequest, NextResponse } from "next/server";
import { cleanupTranscriptHeuristically } from "@/lib/transcriptCleanup";

const CLEANUP_WEBHOOK_URL = process.env.WILSON_TRANSCRIPT_WEBHOOK_URL;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Bereinigt ein diktiertes Transkript: Füllwörter und Dopplungen raus,
 * grammatikalisch klarer Satz. Ist `WILSON_TRANSCRIPT_WEBHOOK_URL` gesetzt,
 * übernimmt ein n8n-Workflow (z. B. mit einem LLM-Node) die Bereinigung;
 * sonst läuft die einfache lokale Heuristik.
 */
export async function POST(request: NextRequest) {
  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!text) {
    return NextResponse.json({ text: "" });
  }

  if (!CLEANUP_WEBHOOK_URL) {
    return NextResponse.json({ text: cleanupTranscriptHeuristically(text) });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const webhookResponse = await fetch(CLEANUP_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!webhookResponse.ok) {
      throw new Error(
        `Cleanup-Webhook antwortete mit Status ${webhookResponse.status}`
      );
    }

    const cleaned = await extractCleanedText(webhookResponse, text);
    return NextResponse.json({ text: cleaned });
  } catch (error) {
    console.error("Fehler beim Aufruf des Transkript-Cleanup-Webhooks:", error);
    // Lieber die lokale Heuristik als den rohen, ungefilterten Text zeigen.
    return NextResponse.json({ text: cleanupTranscriptHeuristically(text) });
  } finally {
    clearTimeout(timeout);
  }
}

async function extractCleanedText(
  response: Response,
  fallback: string
): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const data: unknown = await response.json();

    if (typeof data === "string") {
      return data;
    }

    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      const source =
        record.output && typeof record.output === "object"
          ? (record.output as Record<string, unknown>)
          : record;
      const candidate = source.text ?? source.reply ?? record.output;
      if (typeof candidate === "string") {
        return candidate;
      }
    }

    return fallback;
  }

  const text = await response.text();
  return text.trim() || fallback;
}
