/**
 * Einrichtung des Sprachmodus nach einem LiveAvatar-Upgrade.
 *
 * Nach dem Upgrade genügt: neuen API-Key in .env.local eintragen und
 *
 *   npm run avatar:setup
 *
 * Das Skript prüft den Key, sucht den eigenen Avatar (z. B. "Wilma"),
 * schreibt dessen ID in .env.local und meldet Guthaben und Grenzen.
 * Mit --dry-run wird nur berichtet, nichts geschrieben.
 */

import { readFileSync, writeFileSync } from "node:fs";

const API_KEY = process.env.HEYGEN_API_KEY;
const BASE_URL = process.env.LIVEAVATAR_API_URL ?? "https://api.liveavatar.com";
const ENV_FILE = ".env.local";
const DRY_RUN = process.argv.includes("--dry-run");
/** Nach diesem Namen wird gesucht; sonst erster eigener Avatar. */
const WANTED = process.env.LIVEAVATAR_AVATAR_NAME ?? "wilma";

if (!API_KEY) {
  console.error(
    `HEYGEN_API_KEY fehlt in ${ENV_FILE}.\n` +
      "Key holen: app.liveavatar.com → Developers → API Key\n" +
      "Achtung: Ein HeyGen-Key funktioniert hier NICHT."
  );
  process.exit(1);
}

async function call(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-API-KEY": API_KEY, Accept: "application/json" },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
}

/** Findet die Avatar-Liste, egal wie die API sie verschachtelt. */
function collect(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["results", "data", "avatars", "items"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = collect(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

const name = (a) => String(a.avatar_name ?? a.name ?? "");
const id = (a) => a.avatar_id ?? a.id ?? null;

console.log(`LiveAvatar-Konto prüfen (${BASE_URL}) …\n`);

const own = await call("/v1/avatars");
if (!own.ok) {
  console.error(`✗ Zugriff fehlgeschlagen (HTTP ${own.status})`);
  console.error(JSON.stringify(own.body, null, 2).slice(0, 800));
  if (own.status === 401 || own.status === 403) {
    console.error(
      "\n→ Key ungültig oder ohne LiveAvatar-Zugang. Stammt er wirklich\n" +
        "  von app.liveavatar.com/developers und nicht von HeyGen?"
    );
  }
  process.exit(1);
}

const avatars = collect(own.body);
console.log(`✓ Key gültig – ${avatars.length} eigene Avatare\n`);

for (const avatar of avatars) {
  console.log(`  • ${name(avatar) || "(ohne Namen)"}  →  ${id(avatar)}`);
}

const match =
  avatars.find((a) => name(a).toLowerCase().includes(WANTED.toLowerCase())) ??
  avatars[0];

const credits = await call("/v1/users/credits");
const left = credits.ok ? credits.body?.data?.credits_left : null;
if (left !== null && left !== undefined) {
  console.log(
    `\nGuthaben: ${left} Credits (LITE-Modus: 1 Credit ≈ 1 Gesprächsminute)`
  );
}

if (!match) {
  console.log(
    "\n✗ Noch kein eigener Avatar vorhanden.\n" +
      "  In app.liveavatar.com einen Custom Avatar aus dem Foto anlegen\n" +
      "  (public/Wilma-Avatar.png). Das braucht mindestens den\n" +
      "  Essential-Plan – Free und Starter haben nur Preset-Avatare.\n" +
      "  Bis dahin läuft der Sprachmodus mit dem eingetragenen Preset."
  );
  process.exit(0);
}

const avatarId = id(match);
console.log(`\n✓ Gewählt: „${name(match)}“  →  ${avatarId}`);

if (DRY_RUN) {
  console.log(`\n(--dry-run: ${ENV_FILE} bleibt unverändert)`);
  process.exit(0);
}

let env = readFileSync(ENV_FILE, "utf8");
const line = `LIVEAVATAR_AVATAR_ID=${avatarId}`;

if (/^LIVEAVATAR_AVATAR_ID=.*$/m.test(env)) {
  const before = env.match(/^LIVEAVATAR_AVATAR_ID=(.*)$/m)[1];
  if (before === avatarId) {
    console.log(`\n${ENV_FILE} ist bereits aktuell – nichts zu tun.`);
    process.exit(0);
  }
  env = env.replace(/^LIVEAVATAR_AVATAR_ID=.*$/m, line);
  console.log(`\n${ENV_FILE} aktualisiert (vorher: ${before})`);
} else {
  env = `${env.trimEnd()}\n${line}\n`;
  console.log(`\n${ENV_FILE} ergänzt`);
}

writeFileSync(ENV_FILE, env);
console.log("→ Dev-Server neu starten, dann spricht Wilma mit ihrem Gesicht.");
