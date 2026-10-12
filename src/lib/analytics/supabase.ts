import "server-only";

/**
 * Schmaler Zugang zu Supabase für die Auswertung.
 *
 * Bewusst ohne SDK: Gebraucht werden nur RPC-Aufrufe, und dafür reicht ein
 * `fetch` auf die REST-Schnittstelle. Das spart eine Abhängigkeit, die sonst
 * in jedem Netlify-Bundle mitliefe.
 *
 * Der Service-Role-Schlüssel darf ausschließlich hier landen: Mit ihm gilt
 * keine Zeilensicherheit, er hat vollen Zugriff auf die Datenbank. Deshalb
 * `server-only` – der Import schlägt fehl, sobald diese Datei versehentlich
 * in Client-Code gezogen wird.
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Ohne Zugangsdaten läuft Wilma weiter, nur eben ohne Auswertung. Das ist
 * Absicht: Ein fehlender Schlüssel darf niemals den Chat lahmlegen.
 */
export function analyticsConfigured(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

export class AnalyticsNotConfiguredError extends Error {
  constructor() {
    super(
      "SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen – die Auswertung ist nicht eingerichtet."
    );
    this.name = "AnalyticsNotConfiguredError";
  }
}

interface RpcOptions {
  timeoutMs?: number;
}

export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
  { timeoutMs = 10_000 }: RpcOptions = {}
): Promise<T> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new AnalyticsNotConfiguredError();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(args),
      signal: controller.signal,
      // Zahlen sollen aktuell sein, nicht aus dem Zwischenspeicher kommen.
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Supabase-RPC ${name} antwortete mit ${response.status}: ${detail.slice(0, 300)}`
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Einfache Leseabfrage über PostgREST, für die Fälle, in denen keine
 * eigene Datenbankfunktion nötig ist (z. B. Kundenliste).
 */
export async function selectRows<T>(
  table: string,
  query: string
): Promise<T[]> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new AnalyticsNotConfiguredError();
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Supabase-Abfrage auf ${table} antwortete mit ${response.status}`
    );
  }

  return (await response.json()) as T[];
}
