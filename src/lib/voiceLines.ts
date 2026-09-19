/**
 * Feste Sätze, die Wilma im Sprachmodus spricht.
 *
 * Sie stehen hier gemeinsam, weil sie an zwei Stellen gebraucht werden:
 * Der Browser spricht sie, und der Server wärmt ihre Vertonung vor, sobald
 * ein Gespräch beginnt. Wortgleich bleiben müssen sie deshalb auch – nur
 * dann greift der Zwischenspeicher.
 *
 * Wilma siezt durchgehend – wie im Chat und in den Antworten aus n8n.
 */

export const GREETING =
  "Hallo, hier ist Wilma. Ich bin die digitale Assistentin von Future AI " +
  "Solutions. Wie kann ich Ihnen heute weiterhelfen?";

/**
 * Überbrücken die Denkpause des n8n-Agenten. Mehrere Varianten, damit es
 * im Gespräch nicht wie eine Bandansage klingt.
 */
export const THINKING_CUES = [
  "Einen Moment, ich schaue kurz nach.",
  "Einen Augenblick, das prüfe ich kurz.",
  "Lassen Sie mich kurz überlegen.",
];

/** Alles, was sich vorab vertonen lässt. */
export const PREWARM_LINES = [GREETING, ...THINKING_CUES];
