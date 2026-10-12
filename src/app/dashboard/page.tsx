import { redirect } from "next/navigation";
import { connection } from "next/server";
import Card from "@/components/dashboard/Card";
import BarList from "@/components/dashboard/BarList";
import ClientKeys from "@/components/dashboard/ClientKeys";
import ConversationTable from "@/components/dashboard/ConversationTable";
import DashboardFrame from "@/components/dashboard/DashboardFrame";
import Funnel from "@/components/dashboard/Funnel";
import Heatmap from "@/components/dashboard/Heatmap";
import StatTile from "@/components/dashboard/StatTile";
import TopQuestions from "@/components/dashboard/TopQuestions";
import TrendChart from "@/components/dashboard/TrendChart";
import { isAdmin, readSession, scopedClient } from "@/lib/analytics/auth";
import {
  DEFAULT_RANGE,
  RANGES,
  isRangeKey,
  loadClientKeys,
  loadDashboard,
  type RangeKey,
} from "@/lib/analytics/dashboard";
import { clusterQuestions } from "@/lib/analytics/questions";
import { analyticsConfigured } from "@/lib/analytics/supabase";
import {
  change,
  formatDecimal,
  formatDuration,
  formatLatency,
  formatNumber,
  formatPercent,
  percent,
} from "@/lib/analytics/format";

/**
 * Die Übersicht.
 *
 * Aufbau von oben nach unten entlang der Frage, die man sich zuerst
 * stellt: Wie viel läuft überhaupt? Wo bleiben die Leute hängen? Worüber
 * wird gesprochen? Und zuletzt: Was wurde konkret gesagt?
 */

interface PageProps {
  searchParams: Promise<{ range?: string; client?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  // Diese Seite zeigt den jeweils aktuellen Stand und hängt an der Anmeldung
  // – sie darf nie vorab erzeugt und ausgeliefert werden.
  await connection();

  const session = await readSession();
  if (!session) redirect("/dashboard/login");

  if (!analyticsConfigured()) {
    return <SetupNote />;
  }

  const params = await searchParams;
  const range: RangeKey = isRangeKey(params.range) ? params.range : DEFAULT_RANGE;

  // Ein Kunde sieht ausschließlich seine eigenen Zahlen – der Filter aus
  // der Adresszeile wird für ihn gar nicht erst ausgewertet.
  const forced = scopedClient(session);
  const client = forced ?? params.client ?? null;
  const admin = isAdmin(session);

  const data = await loadDashboard(client, range);
  const keys = admin ? await loadClientKeys().catch(() => []) : [];

  const { kpis, previous } = data;
  const clusters = clusterQuestions(data.questions, 12);
  const query = new URLSearchParams({
    range,
    ...(client ? { client } : {}),
  }).toString();

  const topicTotal = data.topics.reduce((sum, topic) => sum + topic.count, 0);

  return (
    <DashboardFrame
      range={range}
      client={client}
      clients={data.clients}
      canSwitchClient={admin}
    >
      <div className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {/* Die eine Zahl, mit der das Dashboard führt. */}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              Gespräche in {RANGES[range].long}
            </p>
            <p className="mt-3 text-[56px] font-semibold leading-none text-[var(--ink-1)]">
              {formatNumber(kpis.conversations)}
            </p>
            <p className="mt-3 text-[13px] text-[var(--ink-2)]">
              <ChangeNote
                current={kpis.conversations}
                previous={previous.conversations}
              />
            </p>
            <p className="mt-4 border-t border-[var(--border)] pt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
              Gezählt wird ein Gespräch, sobald jemand Wilma mindestens eine
              Frage gestellt hat. Bloßes Öffnen zählt nicht mit.
            </p>
          </section>

          <Card
            title="Vom Besuch zum Termin"
            description="Jede Stufe im Verhältnis zur vorherigen – so ist zu sehen, wo Besucher abspringen."
          >
            <Funnel
              stages={[
                {
                  label: "Wilma war zu sehen",
                  value: kpis.sessions,
                  hint: `${formatNumber(kpis.visitors)} verschiedene Besucher`,
                },
                { label: "Fenster geöffnet", value: kpis.opened },
                { label: "Frage gestellt", value: kpis.conversations },
                { label: "Termin angesehen", value: kpis.bookings },
              ]}
            />
          </Card>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Fragen insgesamt"
            value={formatNumber(kpis.questions)}
            delta={change(kpis.questions, previous.questions)}
          />
          <StatTile
            label="Fragen je Gespräch"
            value={formatDecimal(kpis.avg_questions)}
            delta={change(kpis.avg_questions ?? 0, previous.avg_questions ?? 0)}
          />
          <StatTile
            label="Ø Gesprächsdauer"
            value={formatDuration(kpis.avg_duration)}
            delta={change(kpis.avg_duration ?? 0, previous.avg_duration ?? 0)}
          />
          <StatTile
            label="Terminklicks"
            value={formatNumber(kpis.bookings)}
            hint={`${formatPercent(percent(kpis.bookings, kpis.conversations))} der Gespräche`}
          />
          <StatTile
            label="Öffnungsrate"
            value={formatPercent(percent(kpis.opened, kpis.sessions))}
            hint="geöffnet je Sichtkontakt"
          />
          <StatTile
            label="Ø Antwortzeit"
            value={formatLatency(kpis.avg_latency_ms)}
            upIsGood={false}
            delta={change(kpis.avg_latency_ms ?? 0, previous.avg_latency_ms ?? 0)}
          />
          <StatTile
            label="Sprachmodus"
            value={formatNumber(kpis.voice_conversations)}
            hint={`${formatDecimal(kpis.voice_minutes)} Minuten Video`}
          />
          <StatTile
            label="Diktiert"
            value={formatNumber(kpis.dictation)}
            hint="Besuche mit Mikrofon im Chat"
          />
        </div>

        <Card
          title="Verlauf"
          description="Gespräche und gestellte Fragen je Tag."
        >
          <TrendChart points={data.daily} />
        </Card>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card
            title="Häufigste Fragen"
            description="Ähnliche Formulierungen sind zusammengefasst; zum Nachprüfen eine Zeile anklicken."
          >
            <TopQuestions clusters={clusters} all={data.questions} />
          </Card>

          {/* Die schmale Spalte trägt alles Kurze – so steht neben der
              langen Fragenliste keine leere Fläche. */}
          <div className="space-y-5">
            <Card
              title="Themen"
              description="Regelbasierte Zuordnung der Fragen – nachvollziehbar und jederzeit erweiterbar."
            >
              <BarList
                items={data.topics.map((topic) => ({
                  label: topic.label,
                  count: topic.count,
                }))}
                total={topicTotal}
                emptyNote="Noch keine Fragen im Zeitraum."
              />
            </Card>

            <Card title="Geräte">
              <BarList
                items={data.devices.map((device) => ({
                  label: deviceLabel(device.label),
                  count: device.count,
                }))}
                total={kpis.sessions}
              />
            </Card>

            <Card
              title="Seiten"
              description="Auf welcher Unterseite Wilma angesprochen wurde."
            >
              <BarList items={data.pages} />
            </Card>

            <Card title="Herkunft">
              <BarList items={data.referrers} />
            </Card>

            <Card
              title="Häufigste Begriffe"
              description="Wörter aus den Fragen, ohne Füllwörter."
            >
              {data.keywords.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-[var(--ink-3)]">
                  Noch keine Begriffe.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {data.keywords.slice(0, 24).map((keyword) => (
                    <li
                      key={keyword.word}
                      className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[12px] text-[var(--ink-2)]"
                    >
                      {keyword.word}
                      <span className="ml-1.5 text-[var(--ink-3)]">
                        {keyword.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <Card
          title="Wann wird gefragt"
          description="Gespräche nach Wochentag und Stunde (Zeitzone Berlin)."
        >
          <Heatmap cells={data.heatmap} />
        </Card>

        <Card
          title="Letzte Gespräche"
          description="Zum vollständigen Verlauf eine Zeile anklicken."
        >
          <ConversationTable rows={data.conversations} query={query} />
        </Card>

        {admin && keys.length > 0 && <ClientKeys clients={keys} />}
      </div>
    </DashboardFrame>
  );
}

function ChangeNote({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const delta = change(current, previous);

  if (delta === null) {
    return (
      <span className="text-[var(--ink-3)]">
        Kein Vergleichszeitraum vorhanden.
      </span>
    );
  }

  const rising = delta > 0;
  const flat = Math.abs(delta) < 0.5;

  if (flat) {
    return (
      <span className="text-[var(--ink-3)]">
        unverändert gegenüber dem Zeitraum davor
      </span>
    );
  }

  return (
    <>
      <span
        className="font-semibold"
        style={{ color: rising ? "var(--good)" : "var(--bad)" }}
      >
        <span aria-hidden>{rising ? "▲" : "▼"}</span>{" "}
        {formatDecimal(Math.abs(delta))} %
      </span>{" "}
      <span className="text-[var(--ink-3)]">
        gegenüber dem Zeitraum davor ({formatNumber(previous)})
      </span>
    </>
  );
}

function deviceLabel(value: string): string {
  if (value === "desktop") return "Rechner";
  if (value === "mobile") return "Telefon";
  if (value === "tablet") return "Tablet";
  return value;
}

function SetupNote() {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
      <h1 className="text-[15px] font-semibold text-[var(--ink-1)]">
        Auswertung noch nicht verbunden
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
        Das Dashboard liest aus Supabase. Dafür fehlen noch{" "}
        <code className="text-[var(--accent)]">SUPABASE_URL</code> und{" "}
        <code className="text-[var(--accent)]">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
        in den Umgebungsvariablen. Wilma selbst läuft auch ohne sie weiter –
        es wird dann nur nichts mitgeschrieben.
      </p>
      <p className="mt-3 text-[12px] text-[var(--ink-3)]">
        Die Einrichtung ist in <code>dashboard/README.md</code> beschrieben.
      </p>
    </div>
  );
}
