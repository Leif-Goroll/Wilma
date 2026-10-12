/**
 * Zeiträume des Dashboards.
 *
 * Eigene Datei, weil sowohl der Server (Abfrage) als auch die Filterzeile
 * im Browser sie braucht – und der Datenbankzugang daneben nicht im
 * Browser-Bündel landen darf.
 */

export const TIME_ZONE = "Europe/Berlin";

/**
 * `label` beschriftet den Schalter, `long` steht im Fließtext – "Gespräche
 * in 30 Tage" wäre sonst das Ergebnis.
 */
export const RANGES = {
  "24h": { label: "24 Stunden", long: "den letzten 24 Stunden", days: 1 },
  "7d": { label: "7 Tage", long: "den letzten 7 Tagen", days: 7 },
  "30d": { label: "30 Tage", long: "den letzten 30 Tagen", days: 30 },
  "90d": { label: "90 Tage", long: "den letzten 90 Tagen", days: 90 },
} as const;

export type RangeKey = keyof typeof RANGES;

export const DEFAULT_RANGE: RangeKey = "30d";

export function isRangeKey(value: string | undefined): value is RangeKey {
  return Boolean(value && value in RANGES);
}
