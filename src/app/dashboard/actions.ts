"use server";

import { redirect } from "next/navigation";
import { authenticate, endSession, startSession } from "@/lib/analytics/auth";

/**
 * Anmeldung am Dashboard. Zwei Zugänge, ein Feld: das Kennwort für die
 * Gesamtsicht oder der Schlüssel eines Kunden für dessen eigene Zahlen.
 */

export interface LoginState {
  error?: string;
}

export async function login(
  _previous: LoginState,
  formData: FormData
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const session = await authenticate(password);

  if (!session) {
    // Bewusst ohne Hinweis darauf, was nicht gepasst hat.
    return { error: "Zugang nicht erkannt." };
  }

  await startSession(session);
  redirect("/dashboard");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/dashboard/login");
}
