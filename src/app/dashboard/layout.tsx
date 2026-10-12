import type { Metadata } from "next";
import type { ReactNode } from "react";
import { logout } from "@/app/dashboard/actions";
import { isAdmin, readSession, scopedClient } from "@/lib/analytics/auth";
import "./dashboard.css";

/**
 * Rahmen des Dashboards: Kopfzeile, Breite, Abmelden.
 *
 * Die Auswertung gehört nicht in Suchmaschinen – `robots` steht deshalb
 * für den ganzen Bereich hier und nicht in jeder einzelnen Seite.
 */

export const metadata: Metadata = {
  title: "Wilma Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await readSession();

  return (
    <div className="wilma-dash min-h-full bg-[var(--surface-0)]">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-[80rem] items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="block h-7 w-1 rounded-full bg-[var(--accent)]"
            />
            <div>
              <p className="text-[15px] font-bold text-[var(--ink-1)]">
                Wilma Dashboard
              </p>
              <p className="text-[11px] text-[var(--ink-3)]">
                {session
                  ? isAdmin(session)
                    ? "Gesamtsicht über alle Kunden"
                    : `Ansicht für ${scopedClient(session)}`
                  : "Nutzung, Fragen und Ergebnisse von Wilma"}
              </p>
            </div>
          </div>

          {session && (
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)]"
              >
                Abmelden
              </button>
            </form>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[80rem] px-5 py-6">{children}</main>
    </div>
  );
}
