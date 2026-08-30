/**
 * Einfache, regelbasierte Bereinigung eines diktierten Textes: Füllwörter
 * raus, direkte Wort-/Phrasendopplungen raus, Satzzeichen und Großschreibung
 * aufgeräumt. Dient als schneller lokaler Fallback, falls kein
 * LLM-gestützter Cleanup-Webhook (`WILSON_TRANSCRIPT_WEBHOOK_URL`)
 * konfiguriert ist.
 */

const FILLER_WORDS = [
  "äh",
  "ähm",
  "öhm",
  "ähh",
  "ahm",
  "hm",
  "hmm",
  "mhm",
  "halt",
  "quasi",
  "sozusagen",
];

const FILLER_REGEX = new RegExp(`\\b(?:${FILLER_WORDS.join("|")})\\b`, "gi");

// Erkennt direkt aufeinanderfolgende, wiederholte Wörter oder kurze
// Wortgruppen (bis zu 4 Wörter), z. B. "ich ich wollte" oder
// "wir müssen wir müssen das".
const REPEATED_PHRASE_REGEX =
  /\b((?:\w+\s+){0,3}\w+)\b(?:\s+\1\b)+/gi;

export function cleanupTranscriptHeuristically(text: string): string {
  let result = text;

  result = result.replace(FILLER_REGEX, " ");
  result = result.replace(REPEATED_PHRASE_REGEX, "$1");

  result = result
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();

  if (result) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  return result;
}
