# Wilson – KI-Büroassistent (v0.1, Website-Chat)

Erste Ausbaustufe von Wilson, dem KI-Büroassistenten von Future AI Solutions.
Diese Version deckt ausschließlich den Website-Chat-Kanal ab: Ein Next.js-Chat-Interface
im Corporate Design, das jede Nutzernachricht an einen n8n-Workflow schickt und dessen
Antwort im Chat anzeigt.

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Trage in `.env.local` die n8n-Webhook-URL und den Calendly-Terminlink ein:

```
WILSON_WEBHOOK_URL=https://n8n.srv1410863.hstgr.cloud/webhook/wilson
NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/leifgoroll/30min
```

Danach den Dev-Server starten:

```bash
npm run dev
```

Die App läuft unter [http://localhost:3000](http://localhost:3000).

## Wichtiger Hinweis zur Webhook-URL

`WILSON_WEBHOOK_URL` wird **ausschließlich serverseitig** in
[`src/app/api/wilson/route.ts`](src/app/api/wilson/route.ts) gelesen. Der Browser ruft nie
n8n direkt auf, sondern immer die eigene API-Route `/api/wilson` – so landet die
Webhook-URL nie im Frontend-Bundle und CORS ist kein Thema. Die Umgebungsvariable darf
deshalb **nicht** mit dem `NEXT_PUBLIC_`-Präfix versehen werden.

## Architektur

```
src/
  app/
    api/wilson/route.ts   # Proxy: Next.js → n8n-Webhook
    page.tsx               # Chat-Seite
    layout.tsx, globals.css
  components/
    ChatWindow.tsx          # State & Orchestrierung
    ChatHeader.tsx
    MessageBubble.tsx
    ChatInput.tsx
    TypingIndicator.tsx
  lib/
    wilsonChannel.ts        # sendMessage(text, sessionId) – Kanal-Adapter
    types.ts
```

`lib/wilsonChannel.ts` kapselt den Aufruf der Fachlogik hinter einer einzigen Funktion
(`sendMessage(text, sessionId)`). Ein späterer Voice- oder Avatar-Kanal kann dieselbe
Signatur implementieren, ohne die Chat-UI oder die API-Route anzufassen.

## Aktionen aus n8n auslösen (Termin-Button, Regler)

n8n kann Wilson signalisieren, dass zur Antwort ein UI-Element gehört (Buchungs-Button,
Regler). Zwei Wege werden unterstützt:

1. **Textmarker am Ende der Antwort** (das, was der Agent aktuell tatsächlich sendet):

   ```
   Wie viel Budget haben Sie für so eine Lösung eingeplant? [ACTION:ask_budget]
   ```

   Die API-Route [`src/app/api/wilson/route.ts`](src/app/api/wilson/route.ts) erkennt das
   Muster `[ACTION:xyz]`, entfernt es aus dem sichtbaren Text und wertet `xyz` als Aktion
   aus. Kein Umbau in n8n nötig – der Agent muss nur diesen Marker ans Ende seiner
   Antwort anhängen, wenn ein UI-Element erscheinen soll.

2. **Separates JSON-Feld** (Alternative, falls der Workflow strukturierte Ausgaben liefert),
   direkt im Root oder – wie beim n8n-Node "Respond to Webhook" mit einem
   AI-Agent-Output üblich – eine Ebene tiefer unter `output` verschachtelt:

   ```json
   { "reply": "Gerne! Hier können Sie direkt einen Termin auswählen:", "action": "book_appointment" }
   ```

   ```json
   { "output": { "reply": "Wie sieht dein ungefähres Budget aus?", "action": "ask_budget" } }
   ```

   Beide Formen werden von `parseReplyPayload()` in
   [`src/app/api/wilson/route.ts`](src/app/api/wilson/route.ts) automatisch erkannt.

Bei `action: "book_appointment"` zeigt Wilson einen „Termin auswählen“-Button, der das
Calendly-Buchungsformular als Overlay öffnet – der Nutzer bleibt dabei im Chat auf der
Website. Der Zielkalender wird über `NEXT_PUBLIC_CALENDLY_URL` konfiguriert. Unbekannte
oder fehlende `action`-Werte werden ignoriert, sodass n8n einfach keinen Marker/kein Feld
setzen muss, wenn keine Aktion nötig ist.

Die Terminfindung, -qualifizierung und -buchung selbst laufen vollständig in n8n bzw. bei
Calendly – das Frontend zeigt nur den Einstiegspunkt an.

## Qualifizierungs-Regler (Budget, Firmengröße, Zeitraum)

Fragt der n8n-Agent nach Budget, Unternehmensgröße oder Zeitraum, kann er statt einer
reinen Textfrage einen passenden Regler in der UI auslösen – über dasselbe
`action`-Feld:

| `action`            | Regler                                    |
| -------------------- | ------------------------------------------ |
| `ask_budget`          | 0 € – 20.000 €+ (500 €-Schritte)           |
| `ask_company_size`    | 0 – 100+ Mitarbeitende                     |
| `ask_timeframe`       | sofort / 1–3 / 3–6 / 6–12 / >12 Monate     |

```json
{
  "reply": "Welches Budget steht ungefähr zur Verfügung?",
  "action": "ask_budget"
}
```

Der Nutzer stellt den Regler ein und bestätigt. Der gewählte Wert wird danach als ganz
normale Chat-Nachricht an n8n geschickt (z. B. „Unser Budget liegt bei etwa 20.000 €.“) –
n8n muss also nichts Neues verarbeiten, es bekommt einfach eine Antwort im Fließtext wie
sonst auch. Konfiguration der Regler (Bereich, Schrittgröße, Formatierung) liegt in
[`src/lib/qualificationSliders.ts`](src/lib/qualificationSliders.ts).

## Diktierfunktion

Im Eingabefeld erscheint ein Mikrofon-Button (nur in Browsern, die die Web Speech API
unterstützen, z. B. Chrome/Edge – sonst wird der Button einfach ausgeblendet). Klick
startet die Aufnahme, ein erneuter Klick beendet sie:

1. Während der Aufnahme läuft die Zwischen-Transkription live mit (sichtbar über dem
   Eingabefeld).
2. Nach dem Stopp wird der rohe Text an [`/api/wilson/transcript`](src/app/api/wilson/transcript/route.ts)
   geschickt und dort bereinigt: Füllwörter (ähm, äh, halt, quasi, …) raus, direkte
   Wortdopplungen raus, sauberer Satz.
3. Das bereinigte Ergebnis landet im Eingabefeld – der Nutzer kann es noch anpassen,
   bevor er sendet.

Die Bereinigung läuft standardmäßig über eine einfache lokale Heuristik
([`src/lib/transcriptCleanup.ts`](src/lib/transcriptCleanup.ts)). Für richtig
"schlaue", grammatikalisch saubere Umformulierung per LLM kannst du optional
`WILSON_TRANSCRIPT_WEBHOOK_URL` auf einen n8n-Workflow zeigen lassen (gleiches
Proxy-Prinzip wie bei `WILSON_WEBHOOK_URL`); ist die Variable nicht gesetzt, greift
automatisch die lokale Heuristik.

## Nicht Teil dieser Version

Voice-Kanal, Avatar-Kanal, Mandantenfähigkeit, Nutzerverwaltung, Kalenderanbindung über
die Terminauswahl hinaus (z. B. Verfügbarkeitsprüfung im eigenen Backend),
Wissensbasis-Suche, Dashboard, Audit-Log, Authentifizierung.
