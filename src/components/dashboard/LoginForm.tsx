"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/dashboard/actions";

/**
 * Ein Feld, zwei Zugänge: Ihr Kennwort öffnet alles, der Schlüssel eines
 * Kunden nur dessen eigene Zahlen. Welcher von beiden nicht gepasst hat,
 * verrät die Rückmeldung bewusst nicht.
 */

const INITIAL: LoginState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, INITIAL);

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
      <h1 className="text-[15px] font-semibold text-[var(--ink-1)]">Anmelden</h1>
      <p className="mt-1 text-[12px] text-[var(--ink-3)]">
        Kennwort oder Kundenschlüssel eingeben.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          autoFocus
          aria-label="Kennwort oder Kundenschlüssel"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-[14px] text-[var(--ink-1)] focus:border-[var(--accent)] focus:outline-none"
        />

        {state.error && (
          <p role="alert" className="text-[12px]" style={{ color: "var(--bad)" }}>
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-[14px] font-semibold text-[var(--surface-0)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Wird geprüft …" : "Weiter"}
        </button>
      </form>
    </div>
  );
}
