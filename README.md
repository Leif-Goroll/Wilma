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

Der Knopf erscheint außerdem nur, wenn die Seite das Mikrofon überhaupt
freigibt. Eingebettet auf einer fremden Seite kann die es sperren – dann
wäre der Knopf da, würde aber nichts tun. Browser, die diese Abfrage nicht
kennen (Firefox, Safari), gelten als erlaubt: "unbekannt" ist kein "nein".

Die Bereinigung läuft standardmäßig über eine einfache lokale Heuristik
([`src/lib/transcriptCleanup.ts`](src/lib/transcriptCleanup.ts)). Für richtig
"schlaue", grammatikalisch saubere Umformulierung per LLM kannst du optional
`WILSON_TRANSCRIPT_WEBHOOK_URL` auf einen n8n-Workflow zeigen lassen (gleiches
Proxy-Prinzip wie bei `WILSON_WEBHOOK_URL`); ist die Variable nicht gesetzt, greift
automatisch die lokale Heuristik.

## Einbetten auf einer WordPress-Seite

Wilma läuft als eigene Anwendung; WordPress bindet sie nur ein. Das muss so
sein, weil die API-Schlüssel (n8n, LiveAvatar, ElevenLabs) serverseitig
bleiben müssen – klassisches WordPress-Hosting kann das nicht, es kennt
nur PHP.

### 1. App veröffentlichen

Wilma braucht einen laufenden Node-Server, klassisches WordPress-Hosting
kann das nicht. Netlify und Vercel können es beide; hier der Weg über
Netlify (Next.js 16 wird über den OpenNext-Adapter ohne Zusatz-
konfiguration unterstützt):

```bash
npx netlify login
npx netlify init      # neues Projekt anlegen
npx netlify deploy --prod
```

Danach im Netlify-Projekt unter **Site configuration → Environment
variables** alle Werte aus der eigenen `.env.local` eintragen und einmal
neu bauen lassen. Nötig sind mindestens `WILSON_WEBHOOK_URL` und
`NEXT_PUBLIC_CALENDLY_URL`, für den Sprachmodus zusätzlich
`HEYGEN_API_KEY`, `LIVEAVATAR_AVATAR_ID` und `ELEVENLABS_API_KEY`.

> `WILMA_ALLOWED_ORIGINS` wird beim **Bauen** gelesen, nicht beim
> Ausliefern. Nach jeder Änderung daran muss neu gebaut werden.

Heraus kommt eine Adresse wie `https://wilma.netlify.app`. Unter dieser
Adresse liegen ab sofort zwei neue Dinge:

| Adresse | Zweck |
|---|---|
| `/widget.js` | Das Lade-Skript, das WordPress einbindet |
| `/embed` | Das Widget allein, ohne Umgebung – landet im iframe |

Direkt nach dem ersten Deploy prüfen, ob die Einbettungssperre wirklich
ankommt:

```bash
curl -sI https://IHRE-ADRESSE.netlify.app/embed | grep -i content-security-policy
```

Kommt nichts zurück, reicht Netlify die `headers()` aus
[`next.config.ts`](next.config.ts) nicht durch. Dann dieselbe Kopfzeile
zusätzlich in eine `netlify.toml` im Projektstamm schreiben:

```toml
[[headers]]
  for = "/embed"
  [headers.values]
    Content-Security-Policy = "frame-ancestors https://ihre-firma.de https://www.ihre-firma.de;"
```

### 2. In WordPress einbinden

Ist ein Snippet-Plugin wie **WPCode** installiert, geht es am schnellsten
darüber: *Code-Snippets → Snippet hinzufügen → eigener Code (leer)*,
Codetyp **HTML-Snippet**, die Skriptzeile von unten einfügen, *Automatisch
einfügen → Seitenweit Footer*, aktiv schalten, speichern.

Ohne Snippet-Plugin als kleines eigenes Plugin – es überlebt jeden
Theme-Wechsel:

1. In [`wordpress/wilma-widget/wilma-widget.php`](wordpress/wilma-widget/wilma-widget.php)
   die Zeile `const WILMA_APP_URL = ...` auf die eigene Vercel-Adresse
   ändern.
2. Den Ordner `wilma-widget` als ZIP packen.
3. In WordPress: **Plugins → Installieren → Plugin hochladen**, ZIP
   auswählen, aktivieren.

Wer lieber ohne Plugin arbeitet, fügt stattdessen diese eine Zeile in den
Fußbereich des Themes ein (oder in ein Snippet-Plugin wie WPCode):

```html
<script src="https://IHRE-APP.vercel.app/widget.js" defer></script>
```

Mehr ist nicht nötig. Das Widget erscheint auf jeder Seite unten rechts.

### 3. Einbettung auf die eigene Domain beschränken

Solange `WILMA_ALLOWED_ORIGINS` nicht gesetzt ist, darf **jede** Seite das
Widget einbauen – und Fremde würden dabei Ihre LiveAvatar-Credits
verbrauchen. Sobald die Seite live ist, deshalb in Vercel setzen:

```
WILMA_ALLOWED_ORIGINS=https://ihre-firma.de,https://www.ihre-firma.de
```

Daraus wird die Kopfzeile `Content-Security-Policy: frame-ancestors …`
für `/embed` ([`next.config.ts`](next.config.ts)). Beide Schreibweisen
eintragen, mit und ohne `www` – sonst bleibt das Widget auf einer der
beiden Varianten leer.

### Wie die Einbettung funktioniert

```
WordPress-Seite
  └─ widget.js  legt ein iframe unten rechts an
       └─ /embed  zeigt das Widget, misst sich selbst
            └─ meldet seine Maße per postMessage zurück
```

Der springende Punkt ist die Größe. Ein iframe fängt Klicks auf seiner
ganzen Fläche ab, auch auf durchsichtigen Stellen – wäre es dauerhaft so
groß wie das geöffnete Chatfenster, ließe sich die untere rechte Ecke der
WordPress-Seite nie mehr benutzen. Das Widget meldet deshalb nach jeder
Änderung, wie viel Platz es gerade braucht
([`src/lib/embedFrame.ts`](src/lib/embedFrame.ts)), und `widget.js`
schneidet das iframe darauf zu: 144 × 144 px für die bloße Blase, gut
330 px für die Sprechblase, 400 × 700 px für das offene Fenster. Auf dem
Telefon legt es sich über die ganze Seite.

Damit das Messen überhaupt möglich ist, hängt das Widget im iframe an
einer festen "Bühne" (`.wilma-embed-stage`) statt am Fenster. Sonst gäbe
es ein Henne-Ei-Problem: In einem 144 px schmalen iframe könnte die
Sprechblase ihre volle Breite nie annehmen und damit nie gemessen werden.

### Worauf zu achten ist

- **HTTPS ist Pflicht.** Ohne verschlüsselte Verbindung gibt kein Browser
  das Mikrofon frei – weder Diktieren noch Sprachmodus würden gehen.
- **Mikrofon.** `widget.js` fordert es über `allow="microphone"` beim
  iframe an; das genügt Chrome und Edge auch über Domaingrenzen hinweg
  (geprüft). Manche Sicherheits-Plugins (Wordfence, "Hardening"-
  Einstellungen) senden aber eine eigene `Permissions-Policy` und nehmen
  das Mikrofon für eingebettete Rahmen wieder aus. In dem Fall blendet
  [`useDictation.ts`](src/hooks/useDictation.ts) den Mikrofonknopf von
  selbst aus, statt ihn stumm scheitern zu lassen – Tippen geht weiter.
  Wer diktieren können soll, erlaubt im Plugin `microphone` für fremde
  Rahmen.
- **Calendly.** Das Buchungsformular legt sich über die ganze Seite. Im
  iframe wäre "die ganze Seite" nur das schmale Widget, deshalb fordert
  [`CalendlyButton.tsx`](src/components/CalendlyButton.tsx) für die Dauer
  der Buchung Vollbild an und faltet danach wieder zusammen.
- **Caching-Plugins.** `widget.js` wird fünf Minuten zwischengespeichert.
  Wer eine neue Fassung sofort sehen will, leert den WordPress-Cache.

## Nicht Teil dieser Version

Voice-Kanal, Avatar-Kanal, Mandantenfähigkeit, Nutzerverwaltung, Kalenderanbindung über
die Terminauswahl hinaus (z. B. Verfügbarkeitsprüfung im eigenen Backend),
Wissensbasis-Suche, Dashboard, Audit-Log, Authentifizierung.

---

## Drei Wege ins Gespräch

Beim Öffnen fragt Wilma „Wie möchten Sie sprechen?“ und bietet bis zu drei
Wege an; erst „Los geht's“ startet das Gespräch:

| Modus | Was passiert | Kosten | Voraussetzung |
|---|---|---|---|
| **Avatar-Anruf** | Bild und Stimme über LiveAvatar (`VoicePanel`) | LiveAvatar-Credits je Minute + Vertonung | `HEYGEN_API_KEY` und `LIVEAVATAR_AVATAR_ID` |
| **Nur Stimme** | Sprechen und Hören, Wilma als Standbild, Antwort zusätzlich als Text (`AudioPanel`) | nur die Vertonung | eine Sprachausgabe (`ELEVENLABS_API_KEY`, `OPENAI_API_KEY` oder `GEMINI_API_KEY`) |
| **Chat** | Text, lautlos (`ChatWindow`) | nichts außer n8n | immer |

Ohne Spracherkennung im Browser (Firefox) oder bei gesperrtem Mikrofon sind
die beiden Sprachwege ausgegraut mit Hinweis – der Chat geht immer.
„Nur Stimme“ spielt das PCM aus `/api/avatar/speak` über die Web Audio API
(`src/lib/speechPlayback.ts`) und wärmt Begrüßung und Füllsätze beim ersten
Aufruf vor, wie es der Avatar beim Sitzungsaufbau tut.

Im Dashboard zählt `mode = 'audio'` als Sprachnutzung
(`dashboard/sql/002_ingest_functions.sql` – nach der Änderung einmal neu
einspielen), aber nicht zu den LiveAvatar-Minuten.

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

### Logo und Bilder

Wilmas Logo ist `public/Wilma-Avatar-Neu.png` – das Gesicht des Live-Avatars
mit eingebautem Leuchtring. Daraus abgeleitet:

- `public/wilma-profilbild.png` – Ausschnitt **innerhalb** des Rings, 512 px. Den
  nutzt `WilmaAvatar.tsx` für Launcher, Kopfzeile und Chat. Der Ring fehlt
  absichtlich: Die Komponente zeichnet ihren eigenen, der je nach Zustand
  die Farbe wechselt (gelb beim Zuhören, pulsierend beim Antworten).
- `src/app/favicon.ico` (16–64 px) und `src/app/apple-icon.png` (180 px) –
  das vollständige Logo mit Ring für Browser-Tab und Homescreen.

Bei einem neuen Logo alle drei neu erzeugen; der Ring saß im jetzigen Bild
bei Mittelpunkt (620, 604) und Radius 560, der Ausschnitt ist 1040 px groß.

### Eigener Avatar statt Preset

Custom Avatare gibt es erst ab dem **Essential-Plan** (Free und Starter
haben nur die Preset-Bibliothek). Ein *Image Avatar* entsteht dort aus einem
einzigen Foto, ein Video wird nicht gebraucht.

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

Eingestellt ist **ElevenLabs** mit der Stimme **„Sarah – Storyteller"**
(`XtxuRNfvtd45OyWcp5jr`), muttersprachlich deutsch. Modell
`eleven_turbo_v2_5`. Nach längerer Pause braucht die Stimme beim ersten
Einsatz einen Kaltstart (gemessen 12 s); das Vorwärmen beim Gesprächsstart
fängt ihn ab, danach liegt sie bei ~0,3 s.

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
(alle deutsch): Susi `v3V1d2rk6528UrLKRuy8`, Laura `zKHQdbB8oaQ7roNTiDTK`, Ramona
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
