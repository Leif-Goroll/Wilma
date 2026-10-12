"use client";

/**
 * Nutzungsmessung des Widgets.
 *
 * Grundsatz: Das Messen darf nie im Weg stehen. Jeder Aufruf ist
 * "abschicken und vergessen" – schlägt er fehl, merkt der Besucher nichts,
 * und Wilma antwortet trotzdem.
 *
 * Gespeichert wird bewusst wenig: eine Zufallskennung je Browser (kein
 * Fingerabdruck, keine IP-Adresse), die Seite, auf der Wilma steht, und was
 * im Gespräch passiert ist. Wer die Kennung löscht, ist wieder neu.
 */

export type WilmaEventType =
  | "impression"
  | "teaser"
  | "open"
  | "close"
  | "mode"
  | "voice_start"
  | "voice_end"
  | "dictation"
  | "booking"
  | "end"
  | "error";

export type WilmaMode = "chat" | "voice";

const SESSION_KEY = "wilma-analytics-session";
const SESSION_START_KEY = "wilma-analytics-started";
const VISITOR_KEY = "wilma-visitor";

interface TrackOptions {
  mode?: WilmaMode;
  /** Zahlenwert zum Ereignis, z. B. Sekunden im Sprachmodus. */
  value?: number;
  data?: Record<string, unknown>;
  /** Beim Verlassen der Seite: über sendBeacon, das überlebt den Abbau. */
  beacon?: boolean;
}

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Speicher kann gesperrt sein (privater Modus, iframe mit strengen
 * Einstellungen). Dann läuft die Messung im Arbeitsspeicher weiter – die
 * laufende Sitzung wird gezählt, sie überlebt nur keinen Seitenwechsel.
 */
const memory = new Map<string, string>();

function read(store: "session" | "local", key: string): string | null {
  try {
    const value =
      store === "session"
        ? sessionStorage.getItem(key)
        : localStorage.getItem(key);
    if (value) return value;
  } catch {
    // weiter unten aus dem Arbeitsspeicher
  }
  return memory.get(key) ?? null;
}

function write(store: "session" | "local", key: string, value: string): void {
  memory.set(key, value);
  try {
    if (store === "session") sessionStorage.setItem(key, value);
    else localStorage.setItem(key, value);
  } catch {
    // Arbeitsspeicher muss reichen.
  }
}

/** Kennung der laufenden Sitzung; wird auch an n8n mitgegeben. */
export function analyticsSessionId(): string {
  if (typeof window === "undefined") return "";

  const existing = read("session", SESSION_KEY);
  if (existing) return existing;

  const id = randomId();
  write("session", SESSION_KEY, id);
  write("session", SESSION_START_KEY, String(Date.now()));
  return id;
}

function visitorId(): string {
  if (typeof window === "undefined") return "";

  const existing = read("local", VISITOR_KEY);
  if (existing) return existing;

  const id = randomId();
  write("local", VISITOR_KEY, id);
  return id;
}

function elapsedSeconds(): number {
  const started = Number(read("session", SESSION_START_KEY));
  if (!started) return 0;
  return Math.max(0, Math.round((Date.now() - started) / 1000));
}

function searchParam(name: string): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Welcher Kunde? Im iframe hängt das Lade-Skript `client` an die Adresse
 * (aus `data-client` im Script-Tag). Steht dort nichts, ordnet der Server
 * anhand der Domain zu – dafür muss die Seite der Gastgeberin mitkommen.
 */
export function clientSlug(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    searchParam("client") ??
    process.env.NEXT_PUBLIC_WILMA_CLIENT ??
    undefined
  );
}

interface PageInfo {
  url?: string;
  path?: string;
  host?: string;
  referrer?: string;
  embedded: boolean;
}

/**
 * Im iframe ist `location` die Einbettungsseite `/embed` – die sagt nichts
 * darüber aus, wo Wilma tatsächlich steht. Das Lade-Skript reicht die
 * Adresse der Gastgeberseite deshalb als Parameter durch.
 */
function pageInfo(): PageInfo {
  if (typeof window === "undefined") return { embedded: false };

  const embedded = window.parent !== window;
  const raw = embedded
    ? searchParam("page") ?? searchParam("parentOrigin")
    : window.location.href;

  let url: URL | undefined;
  try {
    if (raw) url = new URL(raw);
  } catch {
    // Kaputter Parameter – dann eben ohne Seitenangabe.
  }

  return {
    url: url?.href,
    path: url?.pathname,
    host: url?.host,
    referrer: embedded ? searchParam("ref") : document.referrer || undefined,
    embedded,
  };
}

/** Host der Seite, auf der Wilma steht – nicht der unserer eigenen App. */
export function pageHost(): string | undefined {
  return pageInfo().host;
}

export function track(type: WilmaEventType, options: TrackOptions = {}): void {
  if (typeof window === "undefined") return;

  const payload = {
    session: analyticsSessionId(),
    visitor: visitorId(),
    client: clientSlug(),
    type,
    mode: options.mode,
    value: options.value,
    data: options.data,
    duration: elapsedSeconds(),
    page: pageInfo(),
    language: navigator.language,
  };

  const body = JSON.stringify(payload);

  if (options.beacon && typeof navigator.sendBeacon === "function") {
    // Der Typ muss text/plain sein, sonst verlangt der Browser eine
    // Vorab-Anfrage (CORS) – die kommt beim Verlassen der Seite nicht mehr an.
    navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain" }));
    return;
  }

  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Messung ist Beiwerk: ein Fehler hier bleibt folgenlos.
  });
}

/**
 * Meldet beim Verlassen der Seite die Gesamtdauer nach. Erst damit sind die
 * Durchschnittswerte im Dashboard brauchbar.
 */
export function trackSessionEnd(): void {
  track("end", { beacon: true });
}
