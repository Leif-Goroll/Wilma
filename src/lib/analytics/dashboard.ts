import "server-only";
import { rpc, selectRows } from "@/lib/analytics/supabase";
import type { ConversationDetail, DashboardData } from "@/lib/analytics/types";
import { RANGES, TIME_ZONE, type RangeKey } from "@/lib/analytics/ranges";

/**
 * Die Datenbeschaffung fürs Dashboard: eine Abfrage je Seitenaufruf.
 * Gerechnet wird in der Datenbank – das hält die Seite schnell und die
 * Zahlen an einer einzigen Stelle definiert.
 */

export { DEFAULT_RANGE, RANGES, TIME_ZONE, isRangeKey } from "@/lib/analytics/ranges";
export type { RangeKey } from "@/lib/analytics/ranges";

export async function loadDashboard(
  client: string | null,
  range: RangeKey
): Promise<DashboardData> {
  const to = new Date();
  const from = new Date(to.getTime() - RANGES[range].days * 24 * 60 * 60 * 1000);

  return rpc<DashboardData>(
    "wilma_dashboard",
    {
      p_client: client,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_tz: TIME_ZONE,
    },
    { timeoutMs: 15_000 }
  );
}

export async function loadConversation(
  sessionId: string,
  client: string | null
): Promise<ConversationDetail> {
  return rpc<ConversationDetail>("wilma_conversation", {
    p_session: sessionId,
    p_client: client,
  });
}

export interface ClientKey {
  slug: string;
  name: string;
  access_key: string;
  origins: string[];
  auto_created: boolean;
}

/**
 * Die Zugangsschlüssel der Kunden – nur für die Gesamtsicht. Damit lässt
 * sich jedem Kunden ein eigener Link auf seine eigenen Zahlen geben, ohne
 * ein zweites Konto anzulegen.
 */
export async function loadClientKeys(): Promise<ClientKey[]> {
  return selectRows<ClientKey>(
    "wilma_clients",
    "select=slug,name,access_key,origins,auto_created&active=is.true&order=name.asc"
  );
}
