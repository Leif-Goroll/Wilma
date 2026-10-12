# Wilma-Dashboard

Auswertung der Wilma-Nutzung – pro Kunde, unter `/dashboard`.

Dieser Ordner enthält das Datenmodell (`sql/`) und diese Anleitung. Der
Code liegt im üblichen Baum:

| Was | Wo |
| --- | --- |
| Messung im Browser | `src/lib/analytics/track.ts` |
| Annahme der Ereignisse | `src/app/api/track/route.ts` |
| Mitschrift der Gespräche | `src/lib/analytics/messages.ts`, aufgerufen aus `src/app/api/wilson/route.ts` |
| Datenzugriff | `src/lib/analytics/supabase.ts`, `src/lib/analytics/dashboard.ts` |
| Anmeldung | `src/lib/analytics/auth.ts`, `src/app/dashboard/login` |
| Oberfläche | `src/app/dashboard/`, `src/components/dashboard/` |

## Einrichten

1. **Datenbank.** Die drei Dateien in `sql/` der Reihe nach im
   Supabase-SQL-Editor ausführen. Sie sind wiederholbar: Ein zweiter
   Durchlauf ändert nichts.
2. **Umgebungsvariablen** (siehe `.env.local.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` – der geheime Schlüssel aus
     *Project Settings → API Keys*. Nur serverseitig, nie `NEXT_PUBLIC_`.
   - `DASHBOARD_PASSWORD` – Ihr Kennwort für die Gesamtsicht.
3. **Einbinden beim Kunden** – wie gehabt, optional mit fester Kennung:

   ```html
   <script src="https://ihre-app.de/widget.js" data-client="mustermann-gmbh" defer></script>
   ```

   Ohne `data-client` ordnet der Server anhand der Domain zu und legt beim
   ersten Besuch selbst einen Mandanten an. Nichts einzurichten also –
   `data-client` ist nur dann sinnvoll, wenn ein Kunde mehrere Domains hat
   oder der Name im Dashboard hübscher sein soll.

Fehlen die Supabase-Werte, läuft Wilma unverändert weiter; es wird dann nur
nichts mitgeschrieben. Fehlt `DASHBOARD_PASSWORD`, kann sich niemand
anmelden – auch niemand Fremdes.

## Zugang für Kunden

Jeder Mandant hat einen eigenen Schlüssel (`wilma_clients.access_key`).
Damit sieht er unter `/dashboard/login` ausschließlich seine eigenen
Zahlen – kein zweites Konto, keine Nutzerverwaltung. Die Schlüssel stehen
in Ihrer Gesamtsicht ganz unten unter „Zugänge für Kunden“.

Die Mandantenschranke liegt nicht in der Adresszeile, sondern in der
Datenbankfunktion: Auch mit einer geratenen Gesprächskennung kommt ein
Kunde nicht an fremde Gespräche.

## Was gemessen wird

| Ereignis | Wann |
| --- | --- |
| `impression` | Widget war auf der Seite zu sehen |
| `teaser` | Sprechblase ist erschienen |
| `open` / `close` | Fenster auf/zu |
| `mode` | „Schreiben“ oder „Sprechen“ gewählt |
| `voice_start` / `voice_end` | Sprachsitzung samt Dauer (die Credits kostet) |
| `dictation` | Mikrofon im Chat benutzt |
| `booking` | Terminformular geöffnet |
| `end` | Seite verlassen, mit Gesamtdauer |

Der n8n-Workflow schreibt zusätzlich mit, was nur er weiß – benutzte
Wissensbausteine, Modell und Kosten, ob überhaupt eine Antwort gefunden
wurde. Dafür gibt es `wilma_log_run` (siehe `sql/004_agent_run.sql`); die
Einträge landen als Ereignis `agent_run` in `wilma_events`. Damit die
Zuordnung klappt, reicht `/api/wilson` die Besuchskennung als Feld
`analytics` an den Webhook durch. **n8n schreibt keine Nachrichten** – das
täte die Anwendung dann doppelt.

Fragen und Antworten werden **serverseitig** in `/api/wilson`
mitgeschrieben – zusammen mit der Antwortzeit von n8n und der Aktion
(`book_appointment` und die Qualifizierungsfragen). Im Browser ließe sich
das fälschen, und die Antwortzeit wäre dort nicht sauber messbar.

### Wie die Kennzahlen gemeint sind

- **Gespräch**: mindestens eine gestellte Frage. Bloßes Öffnen zählt nicht.
- **Ø Gesprächsdauer**: vom Browser gemeldete Verweildauer, nicht die
  Differenz aus erstem und letztem Ereignis – ein liegengelassener Tab
  würde den Schnitt sonst unbrauchbar machen.
- **Häufigste Fragen**: Die Datenbank fasst wortgleiche Fragen zusammen;
  ähnliche Formulierungen bündelt danach `src/lib/analytics/questions.ts`
  über die Überschneidung der Inhaltswörter. Aufklappen zeigt, was
  zusammengefasst wurde – eine Gruppierung, die man nicht nachprüfen kann,
  würde man zu Recht nicht glauben.
- **Themen**: Regeln in der Tabelle `wilma_topics`, erste passende gewinnt.
  Eigene Themen ergänzen:

  ```sql
  insert into wilma_topics (slug, label, patterns, sort, client_slug)
  values ('foerderung', 'Förderung', array['%förder%','%zuschuss%','%bafa%'], 35, null);
  ```

  `client_slug = null` heißt: gilt für alle Kunden.

## Datenschutz

- Keine IP-Adressen. Das Land kommt, falls vorhanden, aus der Kopfzeile des
  Hosters – nicht aus einer eigenen Auswertung.
- Die Besucherkennung ist eine Zufallszahl im Browser des Besuchers, kein
  Fingerabdruck. Wer sie löscht, ist wieder neu.
- Fragetexte werden im Wortlaut gespeichert – anders ließe sich „Was wurde
  gefragt?“ nicht beantworten. Besucher können dort personenbezogene Daten
  hineinschreiben; das gehört in die Datenschutzerklärung, und die Zeilen
  sollten nach einer festgelegten Frist verschwinden. Aufräumen, z. B.
  nach zwölf Monaten:

  ```sql
  delete from wilma_messages where created_at < now() - interval '12 months';
  delete from wilma_events   where created_at < now() - interval '12 months';
  delete from wilma_sessions where started_at < now() - interval '12 months';
  ```

  `pg_cron` ist im Projekt vorhanden, das lässt sich also auch planen.
- Alle Tabellen haben Zeilensicherheit ohne Richtlinie: Mit den
  öffentlichen Schlüsseln ist hier nichts zu holen. Lesen und Schreiben
  geht ausschließlich serverseitig.

## Beispieldaten

Damit das Dashboard beim ersten Öffnen nicht leer ist, liegen rund 440
erfundene Besuche der letzten 30 Tage in der Datenbank (zwei Beispielkunden,
Sitzungskennungen mit dem Vorsatz `demo-`). Wenn echte Zahlen da sind:

```sql
delete from wilma_messages where session_id like 'demo-%';
delete from wilma_events   where session_id like 'demo-%';
delete from wilma_sessions where id like 'demo-%';
delete from wilma_clients  where slug in ('musterbau-gmbh', 'future-ai-solutions');
```

## Grenzen

- Ein Besucher, der das Fenster nie öffnet, erzeugt trotzdem eine
  Sitzungszeile (für die Öffnungsrate). Bei viel Verkehr wächst
  `wilma_sessions` entsprechend – siehe Aufräumen oben.
- Die Dauer kommt aus dem Browser. Wer den Tab hart schließt, bevor
  `pagehide` durchläuft, fehlt im Schnitt.
- Die Themenzuordnung ist regelbasiert und damit so gut wie die Regeln.
  Was nirgends passt, landet sichtbar unter „Sonstiges“ – wird der Anteil
  groß, fehlt eine Regel.
