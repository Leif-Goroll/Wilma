import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { selectRows } from "@/lib/analytics/supabase";

/**
 * Zugang zum Dashboard.
 *
 * Zwei Arten von Zugang, ein Mechanismus:
 *   – das Kennwort aus `DASHBOARD_PASSWORD` öffnet alles (Ihre Sicht),
 *   – der Schlüssel eines Kunden (`wilma_clients.access_key`) öffnet
 *     ausschließlich dessen eigene Zahlen.
 *
 * Bewusst ohne Nutzerverwaltung: Es gibt genau zwei Rollen, und ein
 * Kunde soll einen Link bekommen, keinen Registrierungsvorgang.
 */

const COOKIE_NAME = "wilma_dashboard";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface DashboardSession {
  /** "admin" sieht alle Mandanten, sonst der Slug des eigenen. */
  scope: "admin" | { client: string };
  expiresAt: number;
}

interface ClientRecord {
  slug: string;
  name: string;
}

function secret(): string | undefined {
  return process.env.DASHBOARD_SECRET ?? process.env.DASHBOARD_PASSWORD;
}

export function dashboardConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD);
}

function sign(payload: string): string {
  return createHmac("sha256", secret() ?? "").update(payload).digest("base64url");
}

/** Vergleich in gleichbleibender Zeit – sonst verrät die Dauer den Treffer. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function serialize(session: DashboardSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function deserialize(value: string): DashboardSession | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  if (!equals(sign(payload), signature)) return null;

  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as DashboardSession;
    if (session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function readSession(): Promise<DashboardSession | null> {
  if (!secret()) return null;

  const cookie = (await cookies()).get(COOKIE_NAME);
  if (!cookie?.value) return null;

  return deserialize(cookie.value);
}

/**
 * Prüft ein eingegebenes Kennwort. Gibt die Sitzung zurück oder `null` –
 * ohne zu verraten, welche der beiden Arten nicht gepasst hat.
 */
export async function authenticate(
  password: string
): Promise<DashboardSession | null> {
  const input = password.trim();
  if (!input) return null;

  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const adminPassword = process.env.DASHBOARD_PASSWORD;

  if (adminPassword && equals(input, adminPassword)) {
    return { scope: "admin", expiresAt };
  }

  // Kundenschlüssel: nur Hex-Zeichen, damit nichts Fremdes in die Abfrage
  // gerät, auch wenn PostgREST ohnehin parametrisiert.
  if (!/^[a-f0-9]{16,64}$/i.test(input)) return null;

  try {
    const rows = await selectRows<ClientRecord>(
      "wilma_clients",
      `select=slug,name&access_key=eq.${input}&active=is.true&limit=1`
    );
    if (rows.length === 0) return null;
    return { scope: { client: rows[0].slug }, expiresAt };
  } catch {
    return null;
  }
}

export async function startSession(session: DashboardSession): Promise<void> {
  (await cookies()).set(COOKIE_NAME, serialize(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/dashboard",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_NAME, path: "/dashboard" });
}

/** Der Mandant, auf den eine Sitzung festgelegt ist – `null` heißt: alle. */
export function scopedClient(session: DashboardSession): string | null {
  return session.scope === "admin" ? null : session.scope.client;
}

export function isAdmin(session: DashboardSession): boolean {
  return session.scope === "admin";
}
