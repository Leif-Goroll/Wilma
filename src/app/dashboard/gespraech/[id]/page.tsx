import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Card from "@/components/dashboard/Card";
import { readSession, scopedClient } from "@/lib/analytics/auth";
import { loadConversation } from "@/lib/analytics/dashboard";
import { analyticsConfigured } from "@/lib/analytics/supabase";
import {
  formatDateTime,
  formatDuration,
  formatLatency,
  formatNumber,
} from "@/lib/analytics/format";

/**
 * Ein Gespräch im Wortlaut.
 *
 * Die Zahlen auf der Übersicht sagen, dass etwas passiert ist. Hier steht,
 * was tatsächlich gefragt und geantwortet wurde – daran erkennt man, ob
 * Wilma gut geantwortet hat, und findet die Lücken in ihrem Wissen.
 */

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; client?: string }>;
}

export default async function ConversationPage({
  params,
  searchParams,
}: PageProps) {
  const session = await readSession();
  if (!session) redirect("/dashboard/login");
  if (!analyticsConfigured()) redirect("/dashboard");

  const { id } = await params;
  const query = new URLSearchParams(
    Object.entries(await searchParams).filter(([, value]) => Boolean(value)) as [
      string,
      string,
    ][]
  ).toString();

  // Ein Kunde kommt nur an seine eigenen Gespräche – die Prüfung liegt in
  // der Datenbankfunktion, nicht in der Adresszeile.
  const data = await loadConversation(id, scopedClient(session));

  if (!data.session) {
    notFound();
  }

  const meta = data.session;

  return (
    <div className="wilma-dash space-y-5">
      <Link
        href={`/dashboard${query ? `?${query}` : ""}`}
        className="inline-flex items-center gap-1 text-[13px] text-[var(--ink-3)] hover:text-[var(--accent)]"
      >
        <span aria-hidden>←</span> Zurück zur Übersicht
      </Link>

      <Card
        title="Gespräch"
        description={`${formatDateTime(meta.started_at)} · ${formatDuration(
          meta.duration_seconds
        )} · ${formatNumber(meta.user_messages)} Fragen`}
      >
        <dl className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          <Detail label="Modus" value={modeLabel(meta)} />
          <Detail label="Gerät" value={meta.device ?? "unbekannt"} />
          <Detail label="Seite" value={meta.page_path ?? "–"} />
          <Detail
            label="Termin angesehen"
            value={meta.booking_clicked ? "ja" : "nein"}
          />
        </dl>
      </Card>

      <Card title="Verlauf">
        <ol className="space-y-3">
          {data.messages.map((message, index) => (
            <li
              key={`${message.created_at}-${index}`}
              className={
                message.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={`max-w-[46rem] rounded-xl px-4 py-2.5 ${
                  message.role === "user"
                    ? "bg-[var(--surface-2)]"
                    : "border border-[var(--border)] bg-[var(--surface-0)]"
                }`}
              >
                <p className="text-[11px] text-[var(--ink-3)]">
                  {message.role === "user" ? "Besucher" : "Wilma"}
                  {message.latency_ms
                    ? ` · ${formatLatency(message.latency_ms)}`
                    : ""}
                  {message.action ? ` · ${message.action}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--ink-2)]">
                  {message.content}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--ink-3)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--ink-2)]">{value}</dd>
    </div>
  );
}

function modeLabel(meta: { used_voice: boolean; used_chat: boolean }): string {
  if (meta.used_voice && meta.used_chat) return "Schreiben und Sprechen";
  if (meta.used_voice) return "Sprechen";
  return "Schreiben";
}
