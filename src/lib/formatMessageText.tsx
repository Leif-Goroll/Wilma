import type { ReactNode } from "react";

/**
 * Wandelt einfaches `**fett**`-Markdown aus der n8n-Antwort in <strong>-
 * Elemente um. Bewusst kein vollwertiger Markdown-Renderer und kein
 * `dangerouslySetInnerHTML` – die Antwort bleibt reiner Text, es wird nur
 * an den Sternchen-Grenzen in JSX-Knoten aufgeteilt.
 */
export function formatMessageText(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((part) => part !== "");

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
