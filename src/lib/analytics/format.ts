/**
 * Zahlen und Zeiten, wie man sie im Deutschen liest. Eine Stelle dafür,
 * damit im Dashboard nicht an einem Ort "2.4 min" und am nächsten
 * "2,4 Minuten" steht.
 */

const NUMBER = new Intl.NumberFormat("de-DE");
const DECIMAL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return NUMBER.format(Math.round(value));
}

export function formatDecimal(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return DECIMAL.format(value);
}

/** Anteile immer gegen eine Bezugsgröße, nie gegen Null. */
export function percent(part: number, whole: number): number | null {
  if (!whole) return null;
  return (part / whole) * 100;
}

export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "–";
  return `${DECIMAL.format(value)} %`;
}

/** Sekunden als "3:42 min" – im Gespräch die lesbarste Form. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "–";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")} min`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (!ms) return "–";
  return `${DECIMAL.format(ms / 1000)} s`;
}

const DATE_SHORT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
});

const DATE_TIME = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateShort(iso: string): string {
  return DATE_SHORT.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/**
 * Veränderung gegenüber dem vorherigen, gleich langen Zeitraum. `null`,
 * wenn es vorher nichts gab – "+100 %" wäre dann eine erfundene Aussage.
 */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export function formatChange(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "";
  const sign = value > 0 ? "+" : "";
  return `${sign}${DECIMAL.format(value)} %`;
}

export const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
