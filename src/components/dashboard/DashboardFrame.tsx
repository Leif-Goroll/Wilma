"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RANGES, type RangeKey } from "@/lib/analytics/ranges";
import type { ClientRow } from "@/lib/analytics/types";

/**
 * Die Filterzeile und alles, was sie betrifft.
 *
 * Die Filter stehen in einer Zeile über dem Inhalt und gelten für alles
 * darunter – nie in einzelnen Karten, sonst widersprechen sich die Zahlen
 * auf derselben Seite. Während neu geladen wird, bleibt das alte Bild
 * stehen und wird nur blasser: kein Platzhalter, kein Springen.
 */

interface DashboardFrameProps {
  range: RangeKey;
  client: string | null;
  clients: ClientRow[];
  canSwitchClient: boolean;
  children: ReactNode;
}

export default function DashboardFrame({
  range,
  client,
  clients,
  canSwitchClient,
  children,
}: DashboardFrameProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(next: { range?: RangeKey; client?: string | null }) {
    const params = new URLSearchParams();
    params.set("range", next.range ?? range);

    const target = next.client === undefined ? client : next.client;
    if (target) params.set("client", target);

    startTransition(() => {
      router.push(`/dashboard?${params.toString()}`);
    });
  }

  return (
    <div className="wilma-dash" data-pending={pending}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Zeitraum"
          className="flex rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1"
        >
          {(Object.keys(RANGES) as RangeKey[]).map((key) => {
            const active = key === range;
            return (
              <button
                key={key}
                type="button"
                onClick={() => navigate({ range: key })}
                aria-pressed={active}
                className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-[var(--accent)] font-semibold text-[var(--surface-0)]"
                    : "text-[var(--ink-2)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {RANGES[key].label}
              </button>
            );
          })}
        </div>

        {canSwitchClient && (
          <label className="flex items-center gap-2 text-[13px] text-[var(--ink-3)]">
            Kunde
            <select
              value={client ?? ""}
              onChange={(event) =>
                navigate({ client: event.target.value || null })
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-[13px] text-[var(--ink-1)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="">Alle Kunden</option>
              {clients.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name} ({entry.conversations})
                </option>
              ))}
            </select>
          </label>
        )}

        {pending && (
          <span className="text-[12px] text-[var(--ink-3)]">wird geladen …</span>
        )}
      </div>

      <div className="dash-content">{children}</div>
    </div>
  );
}
