import { formatNumber, formatPercent, percent } from "@/lib/analytics/format";

/**
 * Der Weg vom Seitenbesuch zum Termin.
 *
 * Geordnete Stufen, deshalb eine Farbskala statt vier Einzelfarben: Die
 * Reihenfolge ist Teil der Aussage. Jede Stufe nennt ihren Anteil an der
 * Stufe davor – die Zahl, an der man sieht, wo Besucher abspringen.
 */

interface Stage {
  label: string;
  value: number;
  hint?: string;
}

interface FunnelProps {
  stages: Stage[];
}

const RAMP = ["var(--seq-5)", "var(--seq-4)", "var(--seq-3)", "var(--seq-2)"];

export default function Funnel({ stages }: FunnelProps) {
  const top = stages[0]?.value ?? 0;

  return (
    <ol className="space-y-3">
      {stages.map((stage, index) => {
        const share = top ? Math.max((stage.value / top) * 100, stage.value > 0 ? 2 : 0) : 0;
        const previous = index === 0 ? null : stages[index - 1].value;
        const rate = previous === null ? null : percent(stage.value, previous);

        return (
          <li key={stage.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-[var(--ink-2)]">{stage.label}</span>
              <span className="flex items-baseline gap-2">
                <span
                  className="text-[15px] font-semibold text-[var(--ink-1)]"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatNumber(stage.value)}
                </span>
                {rate !== null && (
                  <span className="text-[11px] text-[var(--ink-3)]">
                    {formatPercent(rate)} der Stufe davor
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1.5 h-3 w-full rounded-full bg-[var(--surface-2)]">
              <div
                className="h-3 rounded-full"
                style={{
                  width: `${share}%`,
                  background: RAMP[Math.min(index, RAMP.length - 1)],
                }}
              />
            </div>
            {stage.hint && (
              <p className="mt-1 text-[11px] text-[var(--ink-3)]">{stage.hint}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
