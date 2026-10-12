/**
 * n8n Code-Node "Lauf-Fakten" – hängt hinter "Respond to Webhook1".
 *
 * Zieht aus einem Durchlauf alles, was NUR im Workflow bekannt ist, und
 * baut daraus den Körper für den anschließenden HTTP-Request-Node auf
 * `wilma_log_run` (siehe dashboard/sql/004_agent_run.sql).
 *
 * Bewusst NICHT dabei:
 *
 *   – Frage und Antwort im Wortlaut. Die schreibt die App schon mit
 *     (/api/wilson → wilma_messages); ein zweiter Schreiber hieße, jeden
 *     Text doppelt zu speichern. Wer ihn hier trotzdem braucht, setzt
 *     MIT_WORTLAUT auf true.
 *   – Gesprächsdauer und Anzahl der Fragen. Ein Durchlauf ist ein
 *     Schlagabtausch; wie lang das ganze Gespräch ging, weiß nur die
 *     Sitzung – und die rechnet das Dashboard bereits aus.
 *   – Kosten in Euro. Preise ändern sich; aus tokens_in/tokens_out lässt
 *     sich das jederzeit nachrechnen, ohne dass hier etwas veraltet.
 *
 * Läuft im Modus "Run Once for All Items".
 */

// Node-Namen aus dem Workflow. Nur hier anpassen, wenn umbenannt wird.
const WEBHOOK_NODE = "Webhook";
const AGENT_NODE = "Wilma1";

// Frage und Antwort zusätzlich im Wortlaut mitschicken. Standard: aus,
// weil die App das bereits tut.
const MIT_WORTLAUT = false;

/**
 * Dieselbe Reihenfolge und dieselben Wörter wie die Tabelle wilma_topics –
 * so widersprechen sich Workflow und Dashboard nicht. Erstes passendes
 * Thema gewinnt.
 */
const THEMEN = [
  { slug: "preis", woerter: ["preis", "kostet", "kosten", "teuer", "tarif", "budget", "euro", "abo", "monatlich"] },
  { slug: "termin", woerter: ["termin", "beratung", "gespraech", "anruf", "calendly", "demo", "kennenlern", "meeting"] },
  { slug: "leistung", woerter: ["leistung", "angebot", "dienstleist", "unterstuetz", "bietet", "was macht"] },
  { slug: "technik", woerter: ["integration", "einbinden", "website", "wordpress", "api", "schnittstelle", "installation", "einrichten", "technisch", "crm"] },
  { slug: "datenschutz", woerter: ["datenschutz", "dsgvo", "sicher", "server", "speicher"] },
  { slug: "dauer", woerter: ["wie lange", "dauer", "zeitraum", "frist", "schnell"] },
  { slug: "kontakt", woerter: ["kontakt", "telefon", "email", "erreich", "ansprechpartner", "adresse", "oeffnungszeit"] },
  { slug: "support", woerter: ["problem", "funktioniert nicht", "fehler", "support", "hilfe", "stoerung"] },
];

/**
 * Sätze, mit denen Wilma ausweicht. Treffer heißt: Die Wissensbasis hat
 * nicht getragen – das ist der wertvollste Eintrag im ganzen Datensatz,
 * denn daraus werden die Lücken sichtbar.
 */
const AUSWEICHSAETZE = [
  "kann ich ihnen leider nicht",
  "kann ich leider nicht",
  "dazu liegen mir keine",
  "keine informationen",
  "weiss ich nicht",
  "nicht beantworten",
  "wenden sie sich",
  "kann ich nicht sagen",
  "steht mir nicht zur verfuegung",
];

/** Gleiche Normalisierung wie wilma_normalize in der Datenbank. */
function normalisiere(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** Aktionsmarker am Ende der Antwort, z. B. "[ACTION:book_appointment]". */
function aktionAus(text) {
  const treffer = String(text ?? "").match(/\[ACTION:([a-zA-Z0-9_]+)\]/);
  return treffer ? treffer[1] : null;
}

/**
 * Die Beobachtung eines Werkzeugs kann alles sein: ein JSON-Array von
 * Dokumenten, ein einzelnes Objekt oder schlicht Text. Alle drei Fälle
 * zählen als "Wissen benutzt", nur Dokumentenobjekte liefern Titel.
 */
function dokumenteAus(beobachtung) {
  let wert = beobachtung;

  if (typeof wert === "string") {
    const roh = wert.trim();
    if (!roh.startsWith("[") && !roh.startsWith("{")) {
      return { dokumente: [], zeichen: roh.length };
    }
    try {
      wert = JSON.parse(roh);
    } catch {
      return { dokumente: [], zeichen: roh.length };
    }
  }

  if (Array.isArray(wert)) {
    return { dokumente: wert.filter((e) => e && typeof e === "object"), zeichen: 0 };
  }
  if (wert && typeof wert === "object") {
    return { dokumente: [wert], zeichen: 0 };
  }
  return { dokumente: [], zeichen: 0 };
}

/** Sucht die Token-Abrechnung, egal wie tief der Agent sie verschachtelt. */
function tokenNutzung(objekt, tiefe = 0) {
  if (!objekt || typeof objekt !== "object" || tiefe > 4) return null;

  const schluessel = Object.keys(objekt);
  if (schluessel.some((k) => /^(prompt|completion|total|input|output)_?[Tt]okens$/.test(k))) {
    return objekt;
  }

  for (const wert of Object.values(objekt)) {
    const treffer = tokenNutzung(wert, tiefe + 1);
    if (treffer) return treffer;
  }
  return null;
}

function zahl(...kandidaten) {
  for (const wert of kandidaten) {
    if (typeof wert === "number" && Number.isFinite(wert)) return wert;
  }
  return null;
}

// --------------------------------------------------------------------

const webhook = $(WEBHOOK_NODE).first().json ?? {};
// Je nach Webhook-Einstellung liegen die Felder unter `body` oder direkt.
const anfrage = webhook.body && typeof webhook.body === "object" ? webhook.body : webhook;

const analytics = anfrage.analytics ?? {};
const session = String(analytics.session ?? "").trim();

// Ohne Besuchskennung lässt sich der Lauf niemandem zuordnen – dann lieber
// gar nichts schreiben, als eine Zeile ohne Bezug zu erzeugen.
if (!session) return [];

let lauf;

try {
  const agent = $(AGENT_NODE).first().json ?? {};
  const frage = String(anfrage.message ?? "").trim();
  const antwortRoh = String(agent.output ?? agent.text ?? agent.reply ?? "").trim();
  const antwort = antwortRoh.replace(/\s*\[ACTION:[a-zA-Z0-9_]+\]\s*/g, " ").trim();

  // Zwischenschritte gibt es nur, wenn am Agent-Node
  // "Return Intermediate Steps" eingeschaltet ist. Ohne sie bleiben
  // Werkzeuge und Quellen leer – der Rest stimmt trotzdem.
  const schritte = Array.isArray(agent.intermediateSteps) ? agent.intermediateSteps : [];

  const werkzeuge = [...new Set(schritte.map((s) => s?.action?.tool).filter(Boolean))];

  const quellen = [];
  let wissensZeichen = 0;

  for (const schritt of schritte) {
    const { dokumente, zeichen } = dokumenteAus(schritt?.observation);
    wissensZeichen += zeichen;

    for (const dokument of dokumente) {
      const meta = dokument.metadata ?? {};
      quellen.push({
        titel: meta.titel ?? meta.title ?? meta.source ?? meta.file_name ?? null,
        id: meta.id ?? dokument.id ?? null,
        score: typeof dokument.score === "number" ? Number(dokument.score.toFixed(3)) : null,
      });
      wissensZeichen += String(dokument.pageContent ?? dokument.content ?? "").length;
    }
  }

  const normFrage = normalisiere(frage);
  const normAntwort = normalisiere(antwort);

  const themen = THEMEN
    .filter((thema) => thema.woerter.some((wort) => normFrage.includes(wort)))
    .map((thema) => thema.slug);

  const ausweichend = AUSWEICHSAETZE.some((satz) => normAntwort.includes(satz));

  const nutzung = tokenNutzung(agent) ?? {};

  lauf = {
    // Das Wichtigste zuerst: Hat Wilma wirklich geantwortet?
    answered: antwort.length > 0 && !ausweichend,
    evaded: ausweichend,
    knowledge_used: quellen.length > 0 || wissensZeichen > 0,

    intent: themen[0] ?? "sonstiges",
    topics: themen,
    action: aktionAus(antwortRoh),

    tools: werkzeuge,
    sources: quellen.slice(0, 10),
    source_count: quellen.length,
    knowledge_chars: wissensZeichen,
    steps: schritte.length,

    tokens_in: zahl(nutzung.promptTokens, nutzung.prompt_tokens, nutzung.input_tokens),
    tokens_out: zahl(nutzung.completionTokens, nutzung.completion_tokens, nutzung.output_tokens),
    tokens_total: zahl(nutzung.totalTokens, nutzung.total_tokens),

    question_chars: frage.length,
    answer_chars: antwort.length,

    n8n_session: String(anfrage.sessionId ?? "") || null,
    workflow: $workflow.name,
    execution_id: String($execution.id),
    error: null,
  };

  if (MIT_WORTLAUT) {
    lauf.question = frage;
    lauf.answer = antwort;
  }
} catch (fehler) {
  // Ein Fehler beim Auswerten darf nie den Lauf beenden – lieber ein
  // dünner Datensatz als gar keiner, und der Fehler steht mit drin.
  lauf = {
    answered: null,
    error: String(fehler && fehler.message ? fehler.message : fehler),
    workflow: $workflow.name,
    execution_id: String($execution.id),
  };
}

return [
  {
    json: {
      p: {
        session,
        client: analytics.client || null,
        mode: analytics.mode || null,
        run: lauf,
      },
    },
  },
];
