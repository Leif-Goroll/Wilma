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
 * Der Sinn ist Wartezeit: Die Vertonung dauert ungefähr proportional zur
 * Textlänge (gemessen: 36 Zeichen ≈ 2,8 s, 155 Zeichen ≈ 6,5 s). Wilma
 * fängt deshalb mit einem kurzen ersten Stück an zu sprechen, während der
 * Rest noch entsteht.
 *
 * Die folgenden Stücke dürfen größer sein – sie werden erzeugt, während sie
 * redet, und jede zusätzliche Anfrage kostet Zeit und Geld.
 */
const FIRST_CHUNK_TARGET = 90;
const FIRST_CHUNK_MIN = 35;
const MIN_CHUNK_LENGTH = 140;
const MAX_CHUNKS = 6;

/**
 * Sucht in einem zu langen Auftakt eine natürliche Sprechpause (Komma,
 * Semikolon, Gedankenstrich), um dort zu trennen. Findet sich keine, bleibt
 * das Stück ganz – mitten im Wort zu schneiden wäre hörbar.
 */
function splitAtClause(text: string): [string, string] | null {
  const window = text.slice(0, FIRST_CHUNK_TARGET + 40);
  // Die letzte Pause *vor* der Zielmarke ist die beste; nur wenn es davor
  // keine gibt, wird die erste dahinter genommen.
  let cut = -1;
  for (const match of window.matchAll(/[,;:–—]\s/g)) {
    const at = match.index + 1;
    if (at < FIRST_CHUNK_MIN) continue;
    if (at <= FIRST_CHUNK_TARGET) {
      cut = at;
    } else if (cut < FIRST_CHUNK_MIN) {
      cut = at;
      break;
    } else {
      break;
    }
  }
  if (cut < FIRST_CHUNK_MIN) return null;
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

export function splitIntoSpeechChunks(text: string): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g);
  if (!sentences) return text.trim() ? [text.trim()] : [];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    current += sentence;
    const minimum = chunks.length === 0 ? FIRST_CHUNK_MIN : MIN_CHUNK_LENGTH;
    if (current.trim().length >= minimum) {
      chunks.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Ist der Auftakt trotzdem lang geraten (ein einzelner langer Satz), an
  // einer Sprechpause teilen, damit sie früher loslegt.
  if (chunks[0] && chunks[0].length > FIRST_CHUNK_TARGET + 40) {
    const split = splitAtClause(chunks[0]);
    if (split) chunks.splice(0, 1, split[0], split[1]);
  }

  // Überzählige Stücke hinten anhängen, statt viele Anfragen zu starten.
  if (chunks.length > MAX_CHUNKS) {
    const tail = chunks.splice(MAX_CHUNKS - 1).join(" ");
    chunks.push(tail);
  }

  return chunks;
}
