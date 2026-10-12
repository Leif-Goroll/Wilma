"use client";

import { useMemo, useState } from "react";
import { formatDateTime, formatNumber } from "@/lib/analytics/format";
import type { QuestionCluster } from "@/lib/analytics/questions";
import type { QuestionRow } from "@/lib/analytics/types";

/**
 * Die häufigsten Fragen – und darunter die Möglichkeit, in allen Fragen
 * des Zeitraums zu suchen.
 *
 * Aufgeklappt zeigt jede Zeile, welche Formulierungen zusammengefasst
 * wurden. Das ist wichtig: Eine Gruppierung, die man nicht nachprüfen
 * kann, würde man zu Recht nicht glauben.
 */

interface TopQuestionsProps {
  clusters: QuestionCluster[];
  all: QuestionRow[];
}

export default function TopQuestions({ clusters, all }: TopQuestionsProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return all
      .filter((row) => row.text.toLowerCase().includes(term))
      .slice(0, 40);
  }, [all, search]);

  const max = Math.max(...clusters.map((cluster) => cluster.count), 1);

  return (
    <div>
      {clusters.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-[var(--ink-3)]">
          Noch keine Fragen im gewählten Zeitraum.
        </p>
      ) : (
        <ol className="space-y-3">
          {clusters.map((cluster, index) => {
            const isOpen = open === cluster.text;
            return (
              <li key={cluster.text}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : cluster.text)}
                  className="w-full rounded-lg px-1 py-1 text-left transition-colors hover:bg-[var(--surface-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="w-4 shrink-0 text-[12px] text-[var(--ink-3)]">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--ink-2)]">
                      {cluster.text}
                    </span>
                    <span
                      className="shrink-0 text-[13px] font-semibold text-[var(--ink-1)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatNumber(cluster.count)}×
                    </span>
                  </div>
                  <div className="ml-7 mt-1 h-2 overflow-hidden rounded-[2px] bg-[var(--surface-2)]">
                    <div
                      className="h-2 rounded-r-[4px]"
                      style={{
                        width: `${Math.max((cluster.count / max) * 100, 2)}%`,
                        background: "var(--series-1)",
                      }}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="ml-7 mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                    <p className="text-[11px] text-[var(--ink-3)]">
                      In {formatNumber(cluster.sessions)}{" "}
                      {cluster.sessions === 1 ? "Gespräch" : "Gesprächen"} · zuletzt{" "}
                      {formatDateTime(cluster.lastAt)}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {cluster.variants.map((variant) => (
                        <li
                          key={variant.text}
                          className="flex items-baseline gap-2 text-[12px] text-[var(--ink-2)]"
                        >
                          <span className="text-[var(--ink-3)]">–</span>
                          <span className="flex-1">{variant.text}</span>
                          <span className="text-[var(--ink-3)]">
                            {formatNumber(variant.count)}×
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <label
          htmlFor="frage-suche"
          className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]"
        >
          Alle Fragen durchsuchen
        </label>
        <input
          id="frage-suche"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="z. B. Preis, Termin, DSGVO …"
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-[13px] text-[var(--ink-1)] placeholder:text-[var(--ink-3)] focus:border-[var(--accent)] focus:outline-none"
        />

        {search.trim() && (
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {results.length === 0 ? (
              <p className="text-[12px] text-[var(--ink-3)]">
                Keine Frage enthält „{search.trim()}“.
              </p>
            ) : (
              results.map((row) => (
                <div
                  key={row.key}
                  className="flex items-baseline gap-3 border-b border-[var(--border)] pb-2 text-[12px]"
                >
                  <span className="min-w-0 flex-1 text-[var(--ink-2)]">
                    {row.text}
                  </span>
                  <span className="shrink-0 text-[var(--ink-3)]">
                    {formatNumber(row.count)}×
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
