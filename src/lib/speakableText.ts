/**
 * Bereitet n8n-Antworttext für die Sprachausgabe auf.
 *
 * Was im Chat gut aussieht, klingt vorgelesen schlecht: `**fett**` würde zu
 * "Sternchen Sternchen", und eine Calendly-URL würde Zeichen für Zeichen
 * buchstabiert. Der sichtbare Text im Chat bleibt davon unberührt – diese
 * Funktion wirkt nur auf dem Weg zur Stimme.
 */

/** Aktionsmarker – werden serverseitig entfernt; hier als zweite Instanz. */
const ACTION_MARKER = /\s*\[ACTION:[a-zA-Z0-9_]+\]\s*/g;

const BOLD = /\*\*([^*]+)\*\*/g;
const URL = /https?:\/\/\S+/g;
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
const LIST_BULLET = /^[ \t]*[-*•]\s+/gm;

// Grobe Emoji-Bereiche. Sprachmodelle stolpern über sie oder lesen sie vor.
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;

export function toSpeakableText(text: string): string {
  return (
    text
      .replace(ACTION_MARKER, " ")
      // Markdown-Link: nur den Linktext sprechen, die URL verschlucken.
      .replace(MARKDOWN_LINK, "$1")
      .replace(BOLD, "$1")
      .replace(LIST_BULLET, "")
      // Nackte URLs kann man nicht vorlesen – auf den Chat verweisen.
      .replace(URL, "den Link, den ich Ihnen einblende")
      .replace(EMOJI, "")
      // Aufzählungen als Sprechpausen statt harter Zeilenumbrüche. Steht
      // schon ein Satzzeichen am Zeilenende, kommt keins dazu – sonst
      // entsteht "Wir bieten:, Voice AI".
      .replace(/\n{2,}/g, ". ")
      .replace(/([:.,!?])\n/g, "$1 ")
      .replace(/\n/g, ", ")
      .replace(/[ \t]{2,}/g, " ")
      // Doppelte Satzzeichen, die durch die Ersetzungen entstehen können.
      .replace(/([.,!?])\s*\1+/g, "$1")
      .replace(/\s+([.,!?])/g, "$1")
      .trim()
  );
}

/**
 * Zerlegt eine Antwort in Stücke, die einzeln vertont werden können.
 *
 * Der Sinn ist Wartezeit: Die Sprachsynthese braucht für einen ganzen
 * Absatz mehrere Sekunden, für den ersten Satz Bruchteile davon. Wilma
 * fängt deshalb an zu sprechen, während der Rest noch erzeugt wird.
 *
 * Zu kleine Stücke wären kontraproduktiv – jede Anfrage kostet Zeit und
 * Geld –, deshalb werden kurze Sätze zusammengefasst.
 */
const MIN_CHUNK_LENGTH = 90;
const MAX_CHUNKS = 6;

export function splitIntoSpeechChunks(text: string): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g);
  if (!sentences) return text.trim() ? [text.trim()] : [];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    current += sentence;
    if (current.trim().length >= MIN_CHUNK_LENGTH) {
      chunks.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Überzählige Stücke hinten anhängen, statt viele Anfragen zu starten.
  if (chunks.length > MAX_CHUNKS) {
    const tail = chunks.splice(MAX_CHUNKS - 1).join(" ");
    chunks.push(tail);
  }

  return chunks;
}
