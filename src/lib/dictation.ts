/**
 * Schickt ein rohes Diktat-Transkript zur Bereinigung an `/api/wilson/transcript`
 * (Füllwörter raus, Dopplungen raus, grammatikalisch klarer Satz). Schlägt der
 * Aufruf fehl, wird der unbereinigte Text zurückgegeben, statt die Diktierfunktion
 * komplett abzubrechen.
 */
export async function cleanTranscript(rawText: string): Promise<string> {
  try {
    const response = await fetch("/api/wilson/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawText }),
    });

    if (!response.ok) {
      return rawText;
    }

    const data = (await response.json()) as { text?: unknown };
    return typeof data.text === "string" && data.text.trim()
      ? data.text
      : rawText;
  } catch {
    return rawText;
  }
}
