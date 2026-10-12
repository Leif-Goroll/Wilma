import { formatChange } from "@/lib/analytics/format";

/**
 * Eine Kennzahl. Kein Diagramm – bei einer einzelnen Zahl ist die Zahl
 * selbst die klarste Darstellung.
 *
 * Die Veränderung trägt nie nur Farbe: Pfeil und Text stehen immer dabei,
 * damit sie auch ohne Farbwahrnehmung zu lesen ist.
 */

interface StatTileProps {
  label: string;
  value: string;
  /** Veränderung gegenüber dem gleich langen Zeitraum davor, in Prozent. */
  delta?: number | null;
  /** Bei Antwortzeiten ist ein Anstieg schlecht – das kehrt die Wertung um. */
  upIsGood?: boolean;
  hint?: string;
}

export default function StatTile({
  label,
  value,
  delta = null,
  upIsGood = true,
  hint,
}: StatTileProps) {
  const rising = delta !== null && delta > 0;
  const flat = delta === null || Math.abs(delta) < 0.5;
  const positive = rising === upIsGood;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
        {label}
      </p>
      <p className="mt-2 text-[26px] font-semibold leading-none text-[var(--ink-1)]">
        {value}
      </p>

      <div className="mt-2 flex min-h-[18px] items-center gap-1.5 text-[12px]">
        {!flat && (
          <span
            className="font-semibold"
            style={{ color: positive ? "var(--good)" : "var(--bad)" }}
          >
            <span aria-hidden>{rising ? "▲" : "▼"}</span> {formatChange(delta)}
          </span>
        )}
        {hint && <span className="text-[var(--ink-3)]">{hint}</span>}
        {!hint && !flat && (
          <span className="text-[var(--ink-3)]">ggü. Vorzeitraum</span>
        )}
      </div>
    </div>
  );
}
