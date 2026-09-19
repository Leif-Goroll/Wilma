# Wilma – KI-Büroassistentin (v0.1, Website-Chat)

Erste Ausbaustufe von Wilma, der KI-Büroassistentin von Future AI Solutions.
Diese Version deckt ausschließlich den Website-Chat-Kanal ab: Ein Next.js-Chat-Interface
im Corporate Design, das jede Nutzernachricht an einen n8n-Workflow schickt und dessen
Antwort im Chat anzeigt.

> Hinweis: Intern (Code, Umgebungsvariablen, API-Routen wie `/api/wilson`) heißt das
> Projekt weiterhin "Wilson" – nur der im Chat sichtbare Name wurde zu "Wilma" geändert,
> um bestehende Konfiguration (`.env.local`) nicht zu brechen.

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
    WilmaAvatar.tsx         # Avatar in 5 Größen & 5 Zuständen
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

n8n kann Wilma signalisieren, dass zur Antwort ein UI-Element gehört (Buchungs-Button,
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

Bei `action: "book_appointment"` zeigt Wilma einen „Termin auswählen“-Button, der das
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

---

## Sprachmodus (Wilma als Live-Video)

Neben dem Chat kann Wilma per Video sprechen. Das Widget bietet beides an:
**Schreiben** läuft wie bisher über n8n und kostet nichts, **Sprechen**
verbraucht LiveAvatar-Credits pro Minute und startet nur auf Klick.

### Wie es funktioniert

```
Mikrofon → Web Speech API (de-DE)
         → /api/wilson       → n8n liefert Antworttext + [ACTION:…]
         → /api/avatar/speak → ElevenLabs, PCM 24 kHz
         → LiveAvatar        → lippensynchrones Video
```

n8n bleibt das Gehirn: Qualifizierung, Terminlogik und die Aktionsmarker
wirken im Gespräch genau wie im Chat. LiveAvatar rendert nur das Bild – im
LITE-Modus liefert es **keine** Sprachausgabe, die kommt von ElevenLabs.

Gesprochen wird ausschließlich der Fließtext. Aktionsmarker entfernt
`/api/wilson`, Markdown, URLs und Emojis entfernt `src/lib/speakableText.ts`
auf dem Weg zur Stimme – im Chat bleibt die Formatierung erhalten.

### Einrichtung

**LiveAvatar ist eine eigene Plattform**, nicht HeyGen. Gleicher Login,
aber getrennte Pläne, Credits und API-Keys. Ein HeyGen-Key funktioniert
hier nicht, und HeyGen-Avatare lassen sich nicht übernehmen.

1. Key holen: `app.liveavatar.com` → Developers → API Key
2. In `.env.local` eintragen:

```
HEYGEN_API_KEY=<LiveAvatar-Key>
ELEVENLABS_API_KEY=<für die Sprachausgabe>
```

3. Avatar ermitteln und eintragen lassen:

```bash
npm run avatar:setup
```

Das Skript prüft den Key, sucht den eigenen Avatar (Standard: Name enthält
"Wilma"), schreibt dessen ID als `LIVEAVATAR_AVATAR_ID` in `.env.local` und
meldet das Guthaben. `npm run avatar:check` macht dasselbe, ohne zu
schreiben.

Der Sprachmodus erscheint im Widget nur, wenn `HEYGEN_API_KEY` **und**
`LIVEAVATAR_AVATAR_ID` gesetzt sind – sonst zeigt das Menü nur "Schreiben".

### Aktueller Avatar

Eingestellt ist das Preset **„Katya Sitting"**
(`073b60a9-89a8-45aa-8902-c358f64d2852`). Es streamt mit echtem
Büro-Hintergrund – deshalb ist der Greenscreen-Freisteller ausgeschaltet
(`LIVEAVATAR_CHROMA_KEY=false`), das spart Rechenzeit in jedem Bild.

Die Porträt-Presets und eigene Avatare kommen dagegen auf Greenscreen. Wer
darauf wechselt, setzt `LIVEAVATAR_CHROMA_KEY=true` – dann stanzt
`AvatarStage.tsx` den Hintergrund im Browser aus.

### Eigener Avatar statt Preset

Custom Avatare gibt es erst ab dem **Essential-Plan** (Free und Starter
haben nur die Preset-Bibliothek). Wilma lässt sich dort als *Image Avatar*
aus einem einzigen Foto anlegen – `public/Wilma-Avatar.png` ist die Vorlage,
ein Video wird nicht gebraucht.

Danach genügt `npm run avatar:setup`: Sobald der Avatar im Konto liegt, wird
die ID automatisch übernommen. Am Code ändert sich nichts – nur
`LIVEAVATAR_CHROMA_KEY=true` nicht vergessen, falls der neue Avatar auf
Greenscreen rendert.

### Kosten und Grenzen

| Plan | Preis | Credits/Monat | Max. je Sitzung |
|---|---|---|---|
| Free | – | 10 | 2 Min |
| Starter | 19 $ | 200 | 5 Min |
| Essential | 99 $ | 1.010 | 20 Min |

LITE verbraucht 1 Credit je angefangener Minute. Zwei Bremsen sind
eingebaut: Die Session endet beim Schließen des Panels, und
`LIVEAVATAR_MAX_SESSION_SECONDS` (Standard 120) deckelt sie serverseitig –
auch wenn ein Browser abstürzt oder ein Tab offen liegen bleibt. Beim
Wechsel auf einen größeren Plan diesen Wert anheben.

### Antwortzeit

Gemessen: n8n braucht **2–8 Sekunden**, die Sprachausgabe 1,5–2,8. Vier
Mechanismen sorgen dafür, dass Wilma trotzdem sofort reagiert:

- **Begrüßung beim Start** – sie meldet sich von selbst, sobald das Bild da
  ist. Ihre Vertonung läuft *parallel* zum Verbindungsaufbau, ist also
  fertig, bevor sie gebraucht wird.
- **Vorgewärmter Zwischenspeicher** – Begrüßung und Füllsätze sind bei jedem
  Gespräch wortgleich. `/api/avatar/session` vertont sie beim Gesprächsstart
  im Hintergrund (`prewarmSpeech`), danach kommen sie in ~20 ms statt 2 s.
- **Satzweise Vertonung mit kurzem Auftakt** – die Antwort wird in Stücke
  zerlegt, alle gleichzeitig vertont und der Reihe nach gesprochen. Das
  erste Stück ist bewusst kurz (ca. 64 statt 157 Zeichen, nötigenfalls an
  einem Komma getrennt), denn die Vertonungsdauer wächst mit der Textlänge.
  Das halbiert die Zeit bis zum ersten Wort.
- **Zwischenruf** – dauert n8n länger als 1,2 s, sagt sie „Einen Moment, ich
  schaue kurz nach". Ist die Antwort vorher da, verstummt er wieder, statt
  überflüssig abgespielt zu werden.

Dazu werden Token und SDK schon beim Öffnen des Sprachmodus geholt
(`prepare()`) – das Anlegen eines Tokens kostet nichts, abgerechnet wird
erst der Verbindungsaufbau.

Ergebnis:

| | Zeit |
|---|---|
| Begrüßung nach „Gespräch starten" | **~2,9 s** (davon 3,0 s Verbindungsaufbau bei LiveAvatar) |
| Reaktion auf eine Frage | **~1,2 s** |
| vollständige Antwort | n8n + 1,5–2,8 s |

Der verbleibende Flaschenhals ist der n8n-Agent. Die drei Sekunden
Verbindungsaufbau liegen bei LiveAvatar und lassen sich nur umgehen, indem
man eine Sitzung offen hält – was pro Minute abgerechnet würde.

### Stimme

Eingestellt ist **ElevenLabs** mit der Stimme **„Susi – Effortless and
Confident"** (`v3V1d2rk6528UrLKRuy8`): muttersprachlich deutsch, für
Gespräche gedacht, die meistgenutzte deutsche Frauenstimme der
ElevenLabs-Bibliothek. Modell `eleven_turbo_v2_5`.

`TTS_PROVIDER` schaltet zwischen `elevenlabs`, `openai` und `gemini` um –
alle drei liefern PCM 24 kHz, also keine Umkodierung. Ist
`ELEVENLABS_API_KEY` gesetzt und `TTS_PROVIDER` leer, wird automatisch
ElevenLabs verwendet. Gemessen mit demselben 64-Zeichen-Satz:

| | erstes Stück | Preis/Zeichen |
|---|---|---|
| **ElevenLabs `eleven_turbo_v2_5`** | **0,35 s** | ½ |
| ElevenLabs `eleven_flash_v2_5` | 0,48 s | ½ |
| ElevenLabs `eleven_v3_conversational` | 1,37 s | ½ |
| OpenAI `gpt-4o-mini-tts` | 1,4 s | – |
| Gemini `gemini-3.1-flash-tts-preview` | 3,9 s | – |
| Gemini `gemini-2.5-flash-preview-tts` | 6,5 s (Kaltstart 29 s) | – |

**Kosten:** Der Creator-Plan hat 131.000 Zeichen/Monat; Turbo zählt nur
die Hälfte, effektiv also ~262.000. Eine typische Antwort hat 150–250
Zeichen, Begrüßung und Füllsätze kommen aus dem Zwischenspeicher und
kosten nach dem ersten Mal nichts. Das reicht für weit über tausend
Antworten im Monat – vorher gehen die LiveAvatar-Minuten aus.

Andere Stimme: `ELEVENLABS_VOICE_ID` setzen. Vorausgewählte Alternativen
(alle deutsch, „conversational"): Laura `zKHQdbB8oaQ7roNTiDTK`, Ramona
`6CS8keYmkwxkspesdyA7`, Louisa `1iF3vHdwHKuVKSPDK23Z`, Lucy
`KXxZd16DiBqt82nbarJx`. Bibliotheksstimmen funktionieren direkt, ohne sie
vorher ins Konto zu übernehmen.

Der Zwischenspeicher pinnt Begrüßung und Füllsätze an – Antworten können
sie nicht verdrängen –, und gleichzeitige Anfragen für denselben Text
(Vorwärmen und Gesprächsstart fast im selben Moment) werden nur einmal
vertont.

LiveAvatars eigene Stimmen sind **keine** Option: alle 20 sind englisch und
greifen ohnehin nur im FULL-Modus. HeyGens `/v3/voices/speech` hätte
deutsche Stimmen, liefert aber eine MP3-URL statt PCM – das bedeutet
Nachladen, Dekodieren und zusätzliche Credits.

### Bekannte Einschränkungen
- **Spracheingabe** nutzt die Web Speech API und läuft damit zuverlässig nur
  in Chrome/Edge. Im Sprachmodus gibt es deshalb zusätzlich ein Textfeld.
- Der Avatar kommt von LiveAvatar auf grünem Hintergrund; er wird im Browser
  per Canvas freigestellt (`src/components/AvatarStage.tsx`).
