/**
 * Erzeugt eine zufällige ID für Nachrichten und Sitzungen.
 *
 * Nicht direkt im Render aufrufen – der Wert muss über Re-Renders stabil
 * bleiben. Entweder als träger Initialwert (`useState(() => createId())`)
 * oder einmalig in einem Effect verwenden.
 */
export function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
