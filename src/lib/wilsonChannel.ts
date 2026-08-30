import type { WilsonAction } from "@/lib/types";

/**
 * Kanal-Adapter für Wilson: kapselt, wie eine Nutzernachricht die Fachlogik
 * erreicht und eine Antwort zurückkommt. Diese Version spricht mit dem
 * Website-Chat-Backend (`/api/wilson`); ein späterer Voice- oder
 * Avatar-Kanal kann dieselbe `sendMessage`-Signatur implementieren.
 */

export interface WilsonReply {
  text: string;
  action?: WilsonAction;
}

const FALLBACK_MESSAGE =
  "Entschuldigung, gerade kann ich nicht antworten. Bitte versuchen Sie es in einem Moment erneut.";

const KNOWN_ACTIONS: readonly WilsonAction[] = [
  "book_appointment",
  "ask_budget",
  "ask_company_size",
  "ask_timeframe",
];

export async function sendMessage(
  text: string,
  sessionId: string
): Promise<WilsonReply> {
  try {
    const response = await fetch("/api/wilson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId }),
    });

    if (!response.ok) {
      return { text: FALLBACK_MESSAGE };
    }

    const data = (await response.json()) as {
      reply?: unknown;
      action?: unknown;
    };

    if (typeof data.reply !== "string" || data.reply.trim() === "") {
      return { text: FALLBACK_MESSAGE };
    }

    const action = KNOWN_ACTIONS.includes(data.action as WilsonAction)
      ? (data.action as WilsonAction)
      : undefined;

    return { text: data.reply, action };
  } catch {
    return { text: FALLBACK_MESSAGE };
  }
}
