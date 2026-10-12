import { NextRequest, NextResponse } from "next/server";
import { userAgent } from "next/server";
import { analyticsConfigured, rpc } from "@/lib/analytics/supabase";

/**
 * Nimmt die Ereignisse des Widgets entgegen und schreibt sie in die
 * Auswertungstabellen.
 *
 * Antwortet immer mit 204, auch wenn etwas schiefgeht: Der Besucher wartet
 * nicht auf diese Antwort, und ein Fehler in der Messung darf im Widget
 * nichts auslösen.
 */

const ALLOWED_TYPES = new Set([
  "impression",
  "teaser",
  "open",
  "close",
  "mode",
  "voice_start",
  "voice_end",
  "dictation",
  "booking",
  "end",
  "error",
]);

const MAX_BODY_BYTES = 8_000;

export async function POST(request: NextRequest) {
  if (!analyticsConfigured()) {
    return new NextResponse(null, { status: 204 });
  }

  let body: Record<string, unknown>;
  try {
    // sendBeacon schickt text/plain, normale Aufrufe application/json –
    // deshalb erst als Text lesen und selbst auswerten.
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 });
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const type = typeof body.type === "string" ? body.type : "";
  const session = typeof body.session === "string" ? body.session : "";

  if (!ALLOWED_TYPES.has(type) || !session) {
    return new NextResponse(null, { status: 204 });
  }

  const { device, browser, os } = userAgent(request);

  const payload = {
    session: session.slice(0, 64),
    visitor: str(body.visitor, 64),
    client: str(body.client, 64),
    type,
    mode: str(body.mode, 16),
    value: num(body.value),
    duration: num(body.duration),
    data: isRecord(body.data) ? body.data : {},
    page: pageOf(body.page),
    context: {
      // `userAgent` meldet für Rechner nichts – dort ist "desktop" gemeint.
      device: device.type ?? "desktop",
      browser: browser.name,
      os: os.name,
      language: str(body.language, 16),
      country: countryOf(request),
    },
  };

  try {
    await rpc("wilma_track", { p: payload }, { timeoutMs: 5_000 });
  } catch (error) {
    console.error("Wilma-Tracking fehlgeschlagen:", error);
  }

  return new NextResponse(null, { status: 204 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : undefined;
}

function pageOf(value: unknown) {
  if (!isRecord(value)) return {};
  return {
    url: str(value.url, 500),
    path: str(value.path, 300),
    host: str(value.host, 200),
    referrer: str(value.referrer, 300),
    embedded: value.embedded === true,
  };
}

/**
 * Das Land kommt vom Hoster, nicht aus einer IP-Auswertung im Code – je nach
 * Plattform unter einem anderen Kopfzeilennamen.
 */
function countryOf(request: NextRequest): string | undefined {
  const direct =
    request.headers.get("x-country") ??
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry");
  if (direct) return direct.slice(0, 8);

  const netlifyGeo = request.headers.get("x-nf-geo");
  if (!netlifyGeo) return undefined;

  try {
    const geo = JSON.parse(atob(netlifyGeo)) as { country?: { code?: string } };
    return geo.country?.code;
  } catch {
    return undefined;
  }
}
