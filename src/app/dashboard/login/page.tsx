import { redirect } from "next/navigation";
import { connection } from "next/server";
import { dashboardConfigured, readSession } from "@/lib/analytics/auth";
import LoginForm from "@/components/dashboard/LoginForm";

export default async function LoginPage() {
  // Hängt an der Anmeldung, also nichts zum Vorabrendern.
  await connection();

  if (await readSession()) {
    redirect("/dashboard");
  }

  if (!dashboardConfigured()) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-6">
        <h1 className="text-[15px] font-semibold text-[var(--ink-1)]">
          Dashboard noch nicht eingerichtet
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
          Setzen Sie <code className="text-[var(--accent)]">DASHBOARD_PASSWORD</code>{" "}
          in den Umgebungsvariablen. Bis dahin lässt sich hier niemand anmelden –
          auch niemand Fremdes.
        </p>
      </div>
    );
  }

  return <LoginForm />;
}
