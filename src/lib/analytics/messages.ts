import "server-only";
import { analyticsConfigured, rpc } from "@/lib/analytics/supabase";

/**
 * Schreibt eine Frage oder eine Antwort in die Auswertung.
 *
 * Absichtlich serverseitig und nicht im Browser: Nur hier sind Antwortzeit
 * und die von n8n gesetzte Aktion bekannt, und nur hier lässt sich das
 * Mitschreiben nicht von außen fälschen.
 */

export interface MessageLogEntry {
  session: string;
  client?: string;
  host?: string;
  mode?: string;
  role: "user" | "wilma";
  content: string;
  action?: string;
  latencyMs?: number;
}

export async function logMessage(entry: MessageLogEntry): Promise<void> {
  if (!analyticsConfigured() || !entry.session || !entry.content.trim()) return;

  try {
    await rpc(
      "wilma_log_message",
      {
        p: {
          session: entry.session,
          client: entry.client,
          host: entry.host,
          mode: entry.mode,
          role: entry.role,
          content: entry.content,
          action: entry.action,
          latency_ms: entry.latencyMs,
        },
      },
      { timeoutMs: 5_000 }
    );
  } catch (error) {
    console.error("Wilma-Nachricht konnte nicht protokolliert werden:", error);
  }
}
