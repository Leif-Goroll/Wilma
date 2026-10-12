import { formatNumber } from "@/lib/analytics/format";

/**
 * Rangliste mit Balken – für Themen, Seiten, Geräte, Herkunft.
 *
 * Eine Reihe, eine Farbe: Die Balkenlänge trägt die Größe bereits. Sie
 * zusätzlich über die Farbe abzustufen, verbrauchte den einzigen freien
 * Kanal für eine Information, die schon im Bild steht.
 */

interface BarListItem {
  label: string;
  count: number;
  /** Optionaler Verweis, z. B. auf die Seite der Gastgeberin. */
  href?: string;
}

interface BarListProps {
  items: BarListItem[];
  emptyNote?: string;
  /** Bezugsgröße für den Anteil in Klammern; ohne sie nur Absolutwerte. */
  total?: number;
}

export default function BarList({ items, emptyNote, total }: BarListProps) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-[var(--ink-3)]">
        {emptyNote ?? "Noch keine Daten."}
      </p>
    );
  }

  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-2)]">
              {item.label}
            </span>
            <span
              className="shrink-0 text-[13px] font-semibold text-[var(--ink-1)]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatNumber(item.count)}
              {total ? (
                <span className="ml-1 font-normal text-[var(--ink-3)]">
                  ({Math.round((item.count / total) * 100)} %)
                </span>
              ) : null}
            </span>
          </div>
          {/* Balken an der Grundlinie eckig, am Datenende gerundet. */}
          <div className="mt-1 h-2 w-full overflow-hidden rounded-[2px] bg-[var(--surface-2)]">
            <div
              className="h-2 rounded-r-[4px]"
              style={{
                width: `${Math.max((item.count / max) * 100, 2)}%`,
                background: "var(--series-1)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
