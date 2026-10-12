/**
 * Verständigung zwischen dem eingebetteten Widget und dem Lade-Skript auf
 * der Gastgeberseite (`public/widget.js`).
 *
 * Kernproblem der Einbettung: Ein iframe fängt jeden Klick auf seiner
 * Fläche ab, auch auf durchsichtigen Stellen. Es darf deshalb nie größer
 * sein als das, was gerade zu sehen ist. Das Widget meldet nach jeder
 * Änderung seine Maße nach oben, das Lade-Skript schneidet das iframe
 * darauf zu.
 */

/**
 * `collapsed` – nur Blase bzw. Sprechblase: exakt gemessene Maße.
 * `open` – Panel offen: Größe richtet sich nach dem Fenster der
 *   Gastgeberseite, die kennt nur das Lade-Skript.
 * `overlay` – etwas legt sich über die ganze Seite (Calendly).
 */
export type WilmaFrameState = "collapsed" | "open" | "overlay";

export interface WilmaFrameMessage {
  source: "wilma-widget";
  state: WilmaFrameState;
  /** Nur bei `collapsed` gesetzt. */
  width?: number;
  height?: number;
}

/**
 * Abstand des Widgets zur unteren bzw. rechten Kante – siehe
 * `WilmaWidget` (dort `bottom-8 right-4` im eingebetteten Fall). Getrennt,
 * weil beide Werte unterschiedlich sind: Nur der Abstand nach unten wurde
 * vergrößert, seitlich blieb es beim ursprünglichen Wert.
 */
export const EMBED_EDGE_BOTTOM_PX = 32;
export const EMBED_EDGE_RIGHT_PX = 16;

/**
 * Nach oben, links und (zur Sicherheit) rechts etwas Luft, damit der
 * Schlagschatten des Panels nicht an der iframe-Kante abgeschnitten wird.
 */
export const EMBED_SHADOW_PX = 16;

export function isEmbedded(): boolean {
  return typeof window !== "undefined" && window.parent !== window;
}

/**
 * Das Lade-Skript hängt seine eigene Herkunft an die iframe-URL. So geht
 * die Nachricht gezielt dorthin statt an "*".
 */
function parentOrigin(): string {
  try {
    const value = new URLSearchParams(window.location.search).get(
      "parentOrigin",
    );
    // "null" kommt von Seiten ohne Herkunft (file://, sandboxed).
    if (value && value !== "null" && new URL(value).origin === value) {
      return value;
    }
  } catch {
    // Kaputter Parameter – dann eben ungerichtet, es geht nur um Maße.
  }
  return "*";
}

export function postFrameState(
  state: WilmaFrameState,
  size?: { width: number; height: number },
): void {
  if (!isEmbedded()) return;

  const message: WilmaFrameMessage = { source: "wilma-widget", state, ...size };
  window.parent.postMessage(message, parentOrigin());
}
