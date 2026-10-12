"use client";

import { useState } from "react";
import Card from "@/components/dashboard/Card";
import type { ClientKey } from "@/lib/analytics/dashboard";

/**
 * Zugänge für die Kunden. Jeder Kunde hat einen eigenen Schlüssel; damit
 * meldet er sich an und sieht ausschließlich seine eigenen Zahlen.
 *
 * Neue Domains legen sich beim ersten Besuch selbst an – sie stehen hier
 * also schon drin, bevor Sie etwas eingerichtet haben.
 */

interface ClientKeysProps {
  clients: ClientKey[];
}

export default function ClientKeys({ clients }: ClientKeysProps) {
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(client: ClientKey) {
    const link = `${window.location.origin}/dashboard/login`;
    try {
      await navigator.clipboard.writeText(
        `${link}\nSchlüssel: ${client.access_key}`
      );
      setCopied(client.slug);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Zwischenablage gesperrt – dann bleibt das Einblenden und Abtippen.
      setShown(client.slug);
    }
  }

  return (
    <Card
      title="Zugänge für Kunden"
      description="Nur in Ihrer Gesamtsicht sichtbar. Ein Schlüssel öffnet genau einen Mandanten."
    >
      <ul className="space-y-2">
        {clients.map((client) => (
          <li
            key={client.slug}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-2 last:border-0"
          >
            <div className="min-w-0">
              <p className="text-[13px] text-[var(--ink-2)]">
                {client.name}
                {client.auto_created && (
                  <span className="ml-2 text-[11px] text-[var(--ink-3)]">
                    automatisch erkannt
                  </span>
                )}
              </p>
              <p className="text-[11px] text-[var(--ink-3)]">
                {client.origins.length > 0
                  ? client.origins.join(", ")
                  : `Kennung: ${client.slug}`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <code
                className="rounded bg-[var(--surface-2)] px-2 py-1 text-[11px] text-[var(--ink-2)]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {shown === client.slug
                  ? client.access_key
                  : "••••••••••••••••"}
              </code>
              <button
                type="button"
                onClick={() =>
                  setShown(shown === client.slug ? null : client.slug)
                }
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--ink-2)] hover:border-[var(--accent)]"
              >
                {shown === client.slug ? "verbergen" : "zeigen"}
              </button>
              <button
                type="button"
                onClick={() => copy(client)}
                className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--ink-2)] hover:border-[var(--accent)]"
              >
                {copied === client.slug ? "kopiert" : "Link kopieren"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
