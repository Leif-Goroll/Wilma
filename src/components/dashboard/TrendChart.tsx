"use client";

import { useMemo, useState } from "react";
import { formatDateShort, formatNumber } from "@/lib/analytics/format";
import type { DailyPoint } from "@/lib/analytics/types";

/**
 * Verlauf über die Zeit: Gespräche und Fragen je Tag.
 *
 * Zwei Reihen auf einer gemeinsamen Achse – beides sind Anzahlen, also
 * gehören sie auf dieselbe Skala. Zwei Achsen wären bequemer und würden
 * einen Zusammenhang behaupten, den die Daten nicht hergeben.
 *
 * Die Werte sind auf drei Wegen erreichbar: beschriftete Endpunkte, der
 * Hinweiskasten beim Überfahren (auch per Tastatur) und die Tabelle
 * darunter. Der Hinweiskasten ergänzt also, er ist nie der einzige Weg.
 */

const WIDTH = 760;
const HEIGHT = 230;
const PAD = { top: 18, right: 54, bottom: 26, left: 40 };

const SERIES = [
  { key: "conversations" as const, label: "Gespräche", color: "var(--series-1)" },
  { key: "questions" as const, label: "Fragen", color: "var(--series-2)" },
];

interface TrendChartProps {
  points: DailyPoint[];
}

export default function TrendChart({ points }: TrendChartProps) {
  const [active, setActive] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const max = Math.max(
      1,
      ...points.map((point) => Math.max(point.conversations, point.questions))
    );
    const plotWidth = WIDTH - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const step = points.length > 1 ? plotWidth / (points.length - 1) : 0;

    const x = (index: number) =>
      points.length > 1 ? PAD.left + index * step : PAD.left + plotWidth / 2;
    const y = (value: number) =>
      PAD.top + plotHeight - (value / max) * plotHeight;

    return { max, x, y, plotHeight, plotWidth };
  }, [points]);

  if (points.length === 0) {
    return <EmptyNote />;
  }

  const { max, x, y } = geometry;

  function linePath(key: (typeof SERIES)[number]["key"]): string {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point[key])}`)
      .join(" ");
  }

  function areaPath(key: (typeof SERIES)[number]["key"]): string {
    const base = HEIGHT - PAD.bottom;
    return `${linePath(key)} L${x(points.length - 1)},${base} L${x(0)},${base} Z`;
  }

  const ticks = [0, max / 2, max];
  const lastIndex = points.length - 1;

  // Beschriftet wird sparsam: der letzte Wert je Reihe. Eine Zahl an jedem
  // Punkt liest niemand, sie macht das Diagramm nur unruhig.
  const labelled = SERIES.map((series) => ({
    ...series,
    value: points[lastIndex][series.key],
  }));

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const position = ratio * WIDTH;
    const index = points.reduce(
      (best, _point, current) =>
        Math.abs(x(current) - position) < Math.abs(x(best) - position)
          ? current
          : best,
      0
    );
    setActive(index);
  }

  function handleKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = active ?? lastIndex;
    const next = event.key === "ArrowLeft" ? current - 1 : current + 1;
    setActive(Math.min(lastIndex, Math.max(0, next)));
  }

  const activePoint = active === null ? null : points[active];

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {SERIES.map((series) => (
          <span
            key={series.key}
            className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]"
          >
            <span
              aria-hidden
              className="block h-[2px] w-4 rounded-full"
              style={{ background: series.color }}
            />
            {series.label}
          </span>
        ))}
      </div>

      <div
        tabIndex={0}
        role="group"
        aria-label="Verlauf: Gespräche und Fragen je Tag. Mit den Pfeiltasten durch die Tage gehen."
        onKeyDown={handleKey}
        onBlur={() => setActive(null)}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full"
          onPointerMove={handleMove}
          onPointerLeave={() => setActive(null)}
          role="img"
          aria-label={`Verlauf über ${points.length} Tage`}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="grid-line"
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="axis-label"
                x={PAD.left - 8}
                y={y(tick) + 4}
                textAnchor="end"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatNumber(tick)}
              </text>
            </g>
          ))}

          {SERIES.map((series) => (
            <path
              key={`area-${series.key}`}
              d={areaPath(series.key)}
              fill={series.color}
              opacity={0.1}
            />
          ))}

          {SERIES.map((series) => (
            <path
              key={`line-${series.key}`}
              d={linePath(series.key)}
              fill="none"
              stroke={series.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Endpunkte mit Ring in Flächenfarbe: Sie bleiben lesbar, auch wo
              sich die Reihen überlagern. */}
          {labelled.map((series) => (
            <g key={`end-${series.key}`}>
              <circle
                cx={x(lastIndex)}
                cy={y(series.value)}
                r={4}
                fill={series.color}
                stroke="var(--surface-1)"
                strokeWidth={2}
              />
              <text
                x={x(lastIndex) + 10}
                y={y(series.value) + 4}
                className="axis-label"
                style={{ fill: "var(--ink-2)", fontWeight: 600 }}
              >
                {formatNumber(series.value)}
              </text>
            </g>
          ))}

          {activePoint && active !== null && (
            <g>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="var(--ink-3)"
                strokeWidth={1}
              />
              {SERIES.map((series) => (
                <circle
                  key={`active-${series.key}`}
                  cx={x(active)}
                  cy={y(activePoint[series.key])}
                  r={4}
                  fill={series.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}

          <XLabels points={points} x={x} />
        </svg>
      </div>

      {activePoint && active !== null && (
        <Tooltip
          point={activePoint}
          left={(x(active) / WIDTH) * 100}
          alignRight={active > points.length / 2}
        />
      )}

      <details className="mt-3 text-[12px] text-[var(--ink-3)]">
        <summary className="cursor-pointer select-none hover:text-[var(--ink-2)]">
          Zahlen als Tabelle
        </summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="text-[var(--ink-3)]">
              <tr>
                <th className="py-1 font-medium">Tag</th>
                <th className="py-1 text-right font-medium">Gespräche</th>
                <th className="py-1 text-right font-medium">Fragen</th>
                <th className="py-1 text-right font-medium">Termine</th>
              </tr>
            </thead>
            <tbody
              className="text-[var(--ink-2)]"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {points.map((point) => (
                <tr key={point.date} className="border-t border-[var(--border)]">
                  <td className="py-1">{formatDateShort(point.date)}</td>
                  <td className="py-1 text-right">{formatNumber(point.conversations)}</td>
                  <td className="py-1 text-right">{formatNumber(point.questions)}</td>
                  <td className="py-1 text-right">{formatNumber(point.bookings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function XLabels({
  points,
  x,
}: {
  points: DailyPoint[];
  x: (index: number) => number;
}) {
  // Nur Anfang, Mitte und Ende: Bei 90 Tagen überlappt sonst alles.
  const indexes = [...new Set([0, Math.floor(points.length / 2), points.length - 1])];

  return (
    <>
      {indexes.map((index) => (
        <text
          key={index}
          className="axis-label"
          x={x(index)}
          y={HEIGHT - 8}
          textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
        >
          {formatDateShort(points[index].date)}
        </text>
      ))}
    </>
  );
}

function Tooltip({
  point,
  left,
  alignRight,
}: {
  point: DailyPoint;
  left: number;
  alignRight: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute top-8 z-10 min-w-[9.5rem] rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 shadow-xl shadow-black/40"
      style={{
        left: `${left}%`,
        transform: alignRight ? "translateX(-100%)" : "translateX(0)",
      }}
    >
      <p className="text-[11px] text-[var(--ink-3)]">
        {formatDateShort(point.date)}
      </p>
      {SERIES.map((series) => (
        <p key={series.key} className="mt-1 flex items-center gap-2">
          <span
            aria-hidden
            className="block h-[2px] w-3 rounded-full"
            style={{ background: series.color }}
          />
          <span
            className="text-[13px] font-semibold text-[var(--ink-1)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatNumber(point[series.key])}
          </span>
          <span className="text-[11px] text-[var(--ink-3)]">{series.label}</span>
        </p>
      ))}
    </div>
  );
}

function EmptyNote() {
  return (
    <p className="py-10 text-center text-sm text-[var(--ink-3)]">
      Für diesen Zeitraum liegen noch keine Zahlen vor.
    </p>
  );
}
