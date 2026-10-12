/**
 * Die Form dessen, was `wilma_dashboard` in der Datenbank zurückgibt.
 * Eine Abfrage, ein Objekt – die Seite rechnet nichts nach, sie zeigt nur an.
 */

export interface WilmaKpis {
  /** Wie oft das Widget überhaupt zu sehen war. */
  sessions: number;
  visitors: number;
  /** Wie oft es geöffnet wurde. */
  opened: number;
  /** Geöffnet *und* mindestens eine Frage gestellt. */
  conversations: number;
  questions: number;
  answers: number;
  avg_questions: number | null;
  avg_duration: number | null;
  bookings: number;
  voice_conversations: number;
  chat_conversations: number;
  voice_minutes: number;
  avg_latency_ms: number | null;
  dictation: number;
}

export interface DailyPoint {
  date: string;
  sessions: number;
  conversations: number;
  questions: number;
  bookings: number;
}

export interface HeatmapCell {
  /** 1 = Montag … 7 = Sonntag. */
  dow: number;
  hour: number;
  count: number;
}

export interface LabelCount {
  label: string;
  count: number;
}

export interface TopicCount {
  slug: string;
  label: string;
  count: number;
}

export interface QuestionRow {
  text: string;
  key: string;
  count: number;
  sessions: number;
  last_at: string;
}

export interface KeywordRow {
  word: string;
  count: number;
}

export interface ConversationRow {
  id: string;
  started_at: string;
  questions: number;
  duration: number;
  mode: "chat" | "voice" | "beides";
  booked: boolean;
  device: string | null;
  page: string | null;
  first_question: string | null;
}

export interface ClientRow {
  slug: string;
  name: string;
  conversations: number;
}

export interface DashboardData {
  kpis: WilmaKpis;
  previous: WilmaKpis;
  daily: DailyPoint[];
  heatmap: HeatmapCell[];
  devices: LabelCount[];
  pages: LabelCount[];
  referrers: LabelCount[];
  topics: TopicCount[];
  questions: QuestionRow[];
  keywords: KeywordRow[];
  conversations: ConversationRow[];
  clients: ClientRow[];
  range: { from: string; to: string; tz: string };
}

export interface ConversationDetail {
  session: {
    id: string;
    client_slug: string;
    started_at: string;
    duration_seconds: number;
    user_messages: number;
    wilma_messages: number;
    booking_clicked: boolean;
    device: string | null;
    browser: string | null;
    page_url: string | null;
    page_path: string | null;
    referrer: string | null;
    used_voice: boolean;
    used_chat: boolean;
    voice_seconds: number;
  } | null;
  messages: {
    role: "user" | "wilma";
    content: string;
    mode: string | null;
    action: string | null;
    latency_ms: number | null;
    created_at: string;
  }[];
}
