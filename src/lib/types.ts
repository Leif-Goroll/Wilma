export type MessageRole = "user" | "wilson";

/**
 * Aktionen, die n8n über das `action`-Feld der Webhook-Antwort auslösen
 * kann. Die UI-Schicht jedes Kanals entscheidet selbst, wie sie eine Aktion
 * darstellt (Chat: Buchungs-Button/Regler, Voice: z. B. gesprochener
 * Hinweis).
 */
export type WilsonAction =
  | "book_appointment"
  | "ask_budget"
  | "ask_company_size"
  | "ask_timeframe";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: number;
  action?: WilsonAction;
}
