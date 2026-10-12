import type { QuestionRow } from "@/lib/analytics/types";

/**
 * Fasst gleichbedeutende Fragen zusammen.
 *
 * Die Datenbank gruppiert nur exakt gleiche Formulierungen. "Was kostet
 * das?" und "Wie viel kostet das denn?" wären damit zwei Einträge – als
 * Antwort auf "Was sind die häufigsten Fragen?" wäre das wertlos. Deshalb
 * hier ein zweiter Durchgang: Füllwörter raus, und was sich in den
 * verbleibenden Wörtern stark überschneidet, landet in einer Gruppe.
 *
 * Bewusst ohne Sprachmodell: Das Ergebnis muss bei gleichen Daten immer
 * gleich aussehen, jederzeit nachvollziehbar sein und nichts kosten.
 */

const STOPWORDS = new Set([
  "aber", "alle", "alles", "als", "also", "am", "an", "auch", "auf", "aus",
  "bei", "bin", "bis", "bist", "bitte", "brauche", "braucht", "da", "dann",
  "danke", "das", "dass", "dem", "den", "denn", "der", "des", "die", "dir",
  "doch", "dort", "du", "durch", "ein", "eine", "einem", "einen", "einer",
  "eines", "er", "es", "etwas", "euer", "fuer", "geht", "gerne", "gern",
  "gibt", "guten", "habe", "haben", "habt", "hallo", "hast", "hat", "hatte",
  "hier", "ich", "ihr", "ihre", "ihren", "ihrer", "im", "in", "ist", "ja",
  "kann", "keine", "koennen", "koennt", "koennte", "machen", "macht", "mal",
  "man", "mehr", "mein", "meine", "mich", "mir", "mit", "moechte",
  "moechten", "muss", "muessen", "nach", "nein", "nicht", "noch", "nur",
  "ob", "oder", "ohne", "schon", "sehr", "sein", "seit", "sich", "sie",
  "sind", "so", "soll", "sollen", "tag", "ueber", "um", "und", "uns",
  "unser", "unsere", "unter", "viel", "viele", "vom", "von", "vor", "war",
  "waren", "was", "wenn", "werden", "wie", "wieso", "will", "wir", "wird",
  "wo", "wollen", "wuerde", "wuerden", "zu", "zum", "zur",
  // Wilmas eigener Name steht in vielen Fragen und trennt deshalb nichts.
  "wilma",
]);

export interface QuestionCluster {
  /** Die häufigste Formulierung – sie steht stellvertretend für die Gruppe. */
  text: string;
  count: number;
  sessions: number;
  lastAt: string;
  /** Alle Formulierungen der Gruppe, für die Aufklappansicht. */
  variants: { text: string; count: number }[];
}

function tokenize(key: string): Set<string> {
  return new Set(
    key
      .split(" ")
      .filter((word) => word.length > 2 && !STOPWORDS.has(word) && !/^\d+$/.test(word))
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;

  // Jaccard, aber gegen die kleinere Menge gemessen: "Preis?" soll zu
  // "Was ist denn der Preis für das Paket?" gehören, obwohl die längere
  // Frage viele Wörter mehr hat.
  return shared / Math.min(a.size, b.size);
}

const SIMILARITY_THRESHOLD = 0.6;

export function clusterQuestions(
  rows: QuestionRow[],
  limit = 12
): QuestionCluster[] {
  const clusters: (QuestionCluster & { tokens: Set<string> })[] = [];

  // Absteigend nach Häufigkeit: Die geläufigste Formulierung eröffnet die
  // Gruppe und gibt ihr damit auch den Namen.
  const sorted = [...rows].sort((a, b) => b.count - a.count);

  for (const row of sorted) {
    const tokens = tokenize(row.key);
    if (tokens.size === 0) continue;

    const match = clusters.find(
      (cluster) => overlap(cluster.tokens, tokens) >= SIMILARITY_THRESHOLD
    );

    if (match) {
      match.count += row.count;
      match.sessions += row.sessions;
      match.variants.push({ text: row.text, count: row.count });
      if (row.last_at > match.lastAt) match.lastAt = row.last_at;
      continue;
    }

    clusters.push({
      text: row.text,
      count: row.count,
      sessions: row.sessions,
      lastAt: row.last_at,
      variants: [{ text: row.text, count: row.count }],
      tokens,
    });
  }

  return clusters
    .sort((a, b) => b.count - a.count || b.sessions - a.sessions)
    .slice(0, limit)
    .map((cluster) => ({
      text: cluster.text,
      count: cluster.count,
      sessions: cluster.sessions,
      lastAt: cluster.lastAt,
      variants: cluster.variants.sort((a, b) => b.count - a.count),
    }));
}
