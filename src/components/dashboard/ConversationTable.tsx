import Link from "next/link";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
} from "@/lib/analytics/format";
import type { ConversationRow } from "@/lib/analytics/types";

/**
 * Die letzten Gespräche. Jede Zeile führt zum vollständigen Verlauf –
 * Zahlen sagen, *dass* etwas passiert; erst der Wortlaut sagt, *was*.
 */

interface ConversationTableProps {
  rows: ConversationRow[];
  /** Filter der Seite, damit der Zurück-Weg denselben Ausschnitt zeigt. */
  query: string;
}

const MODE_LABEL: Record<ConversationRow["mode"], string> = {
  chat: "Schreiben",
  voice: "Sprechen",
  beides: "Beides",
};

export default function ConversationTable({
  rows,
  query,
}: ConversationTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-[var(--ink-3)]">
        In diesem Zeitraum wurde noch kein Gespräch geführt.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-left text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            <th className="pb-2 font-semibold">Zeitpunkt</th>
            <th className="pb-2 font-semibold">Erste Frage</th>
            <th className="pb-2 font-semibold">Modus</th>
            <th className="pb-2 text-right font-semibold">Fragen</th>
            <th className="pb-2 text-right font-semibold">Dauer</th>
            <th className="pb-2 text-right font-semibold">Termin</th>
          </tr>
        </thead>
        <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-t border-[var(--border)] transition-colors hover:bg-[var(--surface-2)]"
            >
              <td className="py-2 align-top text-[var(--ink-3)]">
                {formatDateTime(row.started_at)}
              </td>
              <td className="max-w-[20rem] py-2 align-top">
                <Link
                  href={`/dashboard/gespraech/${encodeURIComponent(row.id)}?${query}`}
                  className="text-[var(--ink-2)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
                >
                  {row.first_question ?? "(ohne Frage)"}
                </Link>
              </td>
              <td className="py-2 align-top text-[var(--ink-3)]">
                {MODE_LABEL[row.mode]}
              </td>
              <td className="py-2 text-right align-top text-[var(--ink-2)]">
                {formatNumber(row.questions)}
              </td>
              <td className="py-2 text-right align-top text-[var(--ink-2)]">
                {formatDuration(row.duration)}
              </td>
              <td className="py-2 text-right align-top">
                {row.booked ? (
                  <span style={{ color: "var(--good)" }}>
                    <span aria-hidden>✓</span> ja
                  </span>
                ) : (
                  <span className="text-[var(--ink-3)]">–</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
