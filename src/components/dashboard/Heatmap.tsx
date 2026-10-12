"use client";

import { useMemo, useState } from "react";
import { WEEKDAYS, formatNumber } from "@/lib/analytics/format";
import type { HeatmapCell } from "@/lib/analytics/types";

/**
 * Wann Wilma gebraucht wird: Wochentag über Tagesstunde.
 *
 * Eine Farbe, hell nach dunkel – es geht um eine Größenordnung, nicht um
 * verschiedene Dinge. Leere Felder bleiben in der Kartenfläche, damit
 * "nichts los" auch wie nichts aussieht.
 */

interface HeatmapProps {
  cells: HeatmapCell[];
}

const STEPS = ["var(--seq-1)", "var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)"];

export default function Heatmap({ cells }: HeatmapProps) {
  const [hover, setHover] = useState<{ dow: number; hour: number; count: number } | null>(
    null
  );

  const { lookup, max, busiest } = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of cells) map.set(`${cell.dow}-${cell.hour}`, cell.count);

    const sorted = [...cells].sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      lookup: map,
      max: Math.max(1, ...cells.map((cell) => cell.count)),
      busiest: sorted,
    };
  }, [cells]);

  function color(count: number): string {
    if (count === 0) return "var(--seq-0)";
    const index = Math.min(
      STEPS.length - 1,
      Math.floor((count / max) * STEPS.length - 0.0001)
    );
    return STEPS[Math.max(0, index)];
  }

  if (cells.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-[var(--ink-3)]">
        Noch keine Gespräche in diesem Zeitraum.
      </p>
    );
  }

  return (
    <div>
      <div className="flex min-h-[20px] items-center justify-between text-[11px] text-[var(--ink-3)]">
        <span>
          {hover
            ? `${WEEKDAYS[hover.dow - 1]}, ${String(hover.hour).padStart(2, "0")}–${String(
                hover.hour + 1
              ).padStart(2, "0")} Uhr · ${formatNumber(hover.count)} ${
                hover.count === 1 ? "Gespräch" : "Gespräche"
              }`
            : "Zum Ablesen ein Feld überfahren"}
        </span>
        <span className="flex items-center gap-1">
          weniger
          {STEPS.map((step) => (
            <span
              key={step}
              aria-hidden
              className="block h-2.5 w-3.5 rounded-[2px]"
              style={{ background: step }}
            />
          ))}
          mehr
        </span>
      </div>

      <div className="mt-2 overflow-x-auto">
        <div className="min-w-[30rem]">
          {WEEKDAYS.map((day, rowIndex) => (
            <div key={day} className="flex items-center gap-1.5">
              <span className="w-6 shrink-0 text-[11px] text-[var(--ink-3)]">
                {day}
              </span>
              <div className="flex flex-1 gap-[2px] py-[2px]">
                {Array.from({ length: 24 }, (_, hour) => {
                  const count = lookup.get(`${rowIndex + 1}-${hour}`) ?? 0;
                  return (
                    <div
                      key={hour}
                      className="h-4 flex-1 rounded-[2px] transition-opacity hover:opacity-80"
                      style={{ background: color(count) }}
                      onPointerEnter={() =>
                        setHover({ dow: rowIndex + 1, hour, count })
                      }
                      onPointerLeave={() => setHover(null)}
                      aria-label={`${day} ${hour} Uhr: ${count}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          <div className="mt-1 flex items-center gap-1.5">
            <span className="w-6 shrink-0" />
            <div className="flex flex-1 justify-between text-[10px] text-[var(--ink-3)]">
              <span>0 Uhr</span>
              <span>6</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>
          </div>
        </div>
      </div>

      {busiest.length > 0 && (
        <p className="mt-3 text-[12px] text-[var(--ink-3)]">
          Stärkste Zeiten:{" "}
          <span className="text-[var(--ink-2)]">
            {busiest
              .map(
                (cell) =>
                  `${WEEKDAYS[cell.dow - 1]} ${String(cell.hour).padStart(2, "0")} Uhr (${cell.count})`
              )
              .join(", ")}
          </span>
        </p>
      )}
    </div>
  );
}
