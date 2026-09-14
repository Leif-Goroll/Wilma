"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";
import { splitIntoSpeechChunks } from "@/lib/speakableText";

/**
 * Kapselt die LiveAvatar-Videosession (HeyGen, LITE-Modus).
 *
 * LITE heißt: LiveAvatar rendert ausschließlich das lippensynchrone Video.
 * Den Gesprächsinhalt liefert weiterhin n8n, die Stimme kommt von
 * `/api/avatar/speak`. Dieser Hook kennt den Inhalt nicht – er bekommt
 * fertigen Text und sorgt dafür, dass Wilma ihn ausspricht.
 *
 * Jede laufende Minute kostet ein Credit, deshalb wird die Session beim
 * Aushängen der Komponente zuverlässig beendet.
 */

/** Holt die Sprachausgabe für einen Textabschnitt. */
async function synthesize(text: string): Promise<string | null> {
  const response = await fetch("/api/avatar/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) return null;
  const { audio } = (await response.json()) as { audio: string };
  return audio;
}

export type AvatarConnection =
  "idle" | "connecting" | "live" | "unavailable" | "error";

interface SpeakOptions {
  /**
   * Wird geprüft, sobald das Audio vorliegt, aber bevor es an den Avatar
   * geht. Gibt es `true` zurück, wird nichts gesprochen – gedacht für
   * Füllsätze, die durch die inzwischen eingetroffene Antwort überflüssig
   * geworden sind.
   */
  skipIf?: () => boolean;
}

interface UseLiveAvatarOptions {
  /** Muss stabil sein (z. B. ein useState-Setter). */
  onSpeakingChange?: (speaking: boolean) => void;
}

/**
 * Übersetzt Startfehler in etwas, mit dem der Nutzer etwas anfangen kann.
 * Aufgebrauchtes Guthaben ist der mit Abstand häufigste Fall und lässt
 * sich beheben – das sollte nicht als allgemeiner Fehler untergehen.
 */
function describeStartFailure(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : String(caught);

  if (/insufficient credits/i.test(message)) {
    return "Das LiveAvatar-Guthaben ist aufgebraucht.";
  }
  if (/not found/i.test(message)) {
    return "Der hinterlegte Avatar wurde nicht gefunden.";
  }
  return "Die Videoverbindung kam nicht zustande.";
}

export function useLiveAvatar({ onSpeakingChange }: UseLiveAvatarOptions = {}) {
  const [connection, setConnection] = useState<AvatarConnection>("idle");
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  // Verhindert, dass eine Antwort noch abgespielt wird, nachdem der Nutzer
  // das Gespräch bereits beendet hat.
  const activeRef = useRef(false);
  // Vorab geholtes Token. Das Anlegen kostet nichts – abgerechnet wird erst
  // session.start() –, spart beim Klick aber den Netzabruf.
  const preparedRef = useRef<Promise<string | null> | null>(null);

  const stop = useCallback(async () => {
    activeRef.current = false;
    const session = sessionRef.current;
    sessionRef.current = null;

    if (session) {
      try {
        await session.stop();
      } catch {
        // Verbindung war schon weg – für den Nutzer ist das dasselbe.
      }
    }

    onSpeakingChange?.(false);
    setConnection("idle");
  }, [onSpeakingChange]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  /**
   * Holt Token und SDK schon beim Öffnen des Sprachmodus, bevor jemand
   * "Gespräch starten" drückt. Abgerechnet wird erst beim tatsächlichen
   * Verbindungsaufbau, hier entsteht also kein Verbrauch.
   */
  const prepare = useCallback(() => {
    if (preparedRef.current) return;

    void import("@heygen/liveavatar-web-sdk");

    preparedRef.current = fetch("/api/avatar/session", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return null;
        const { sessionToken } = (await response.json()) as {
          sessionToken: string;
        };
        return sessionToken;
      })
      .catch(() => null);
  }, []);

  const start = useCallback(
    async (greeting?: string) => {
      if (sessionRef.current) return;

      setConnection("connecting");
      setError(null);

      let startedSession: LiveAvatarSession | null = null;

      try {
        // Vorab geholtes Token nutzen, sonst jetzt eines besorgen.
        let sessionToken = await (preparedRef.current ?? Promise.resolve(null));
        preparedRef.current = null;

        if (!sessionToken) {
          const response = await fetch("/api/avatar/session", {
            method: "POST",
          });

          if (response.status === 503) {
            setConnection("unavailable");
            setError(
              "Der Sprachmodus ist auf diesem Server nicht eingerichtet.",
            );
            return;
          }

          if (!response.ok) {
            setConnection("error");
            setError("Wilma kann gerade nicht sprechen.");
            return;
          }

          ({ sessionToken } = (await response.json()) as {
            sessionToken: string;
          });
        }

        // Sofort anstoßen, nicht erst nach dem Verbinden: Der Aufbau dauert
        // rund drei Sekunden, die Vertonung knapp zwei. Nebeneinander
        // ausgeführt steht die Begrüßung genau dann bereit, wenn das Bild
        // erscheint – statt danach noch einmal warten zu lassen.
        const greetingAudio = greeting ? synthesize(greeting) : null;

        // Erst hier laden: Das SDK zieht livekit-client mit und hat im
        // Startbundle des Widgets nichts verloren – der Chat-Weg soll
        // schnell bleiben.
        const { LiveAvatarSession, SessionEvent, AgentEventsEnum } =
          await import("@heygen/liveavatar-web-sdk");

        // voiceChat: false – das Mikrofon steuern wir selbst über die
        // Web Speech API, weil n8n und nicht LiveAvatar antworten soll.
        const session = new LiveAvatarSession(sessionToken, {
          voiceChat: false,
        });
        startedSession = session;

        session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () =>
          onSpeakingChange?.(true),
        );
        session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () =>
          onSpeakingChange?.(false),
        );
        // Erst wenn das SDK den Stream meldet, lässt er sich ans <video>
        // hängen – vorher quittiert attach() mit "Stream is not yet ready".
        session.on(SessionEvent.SESSION_STREAM_READY, () => {
          if (videoRef.current) session.attach(videoRef.current);
        });

        session.on(SessionEvent.SESSION_DISCONNECTED, () => {
          sessionRef.current = null;
          activeRef.current = false;
          onSpeakingChange?.(false);
          setConnection("idle");
        });

        await session.start();

        // Falls der Stream schon vor dem Registrieren des Handlers bereitstand.
        if (videoRef.current) {
          try {
            session.attach(videoRef.current);
          } catch {
            // Dann übernimmt der SESSION_STREAM_READY-Handler.
          }
        }

        sessionRef.current = session;
        activeRef.current = true;
        setConnection("live");

        if (greetingAudio) {
          const audio = await greetingAudio.catch(() => null);
          // Zwischen Verbinden und Begrüßung kann längst abgebrochen worden sein.
          if (audio && activeRef.current && sessionRef.current === session) {
            session.repeatAudio(audio);
          }
        }
      } catch (caught) {
        console.error("LiveAvatar-Session fehlgeschlagen:", caught);

        // Halb aufgebaute Sitzung abräumen. Ohne das bleibt im SDK eine
        // Verbindung zurück, die später mit "Session not found" abstürzt.
        if (startedSession) {
          try {
            await startedSession.stop();
          } catch {
            // Sie kam nie zustande – dann gibt es auch nichts zu beenden.
          }
        }
        sessionRef.current = null;
        activeRef.current = false;

        setConnection("error");
        setError(describeStartFailure(caught));
      }
    },
    [onSpeakingChange],
  );

  /**
   * Lässt Wilma den übergebenen Text aussprechen.
   *
   * Der Text wird in Stücke zerlegt und alle Stücke werden *gleichzeitig*
   * vertont, aber *der Reihe nach* abgespielt. Wilma beginnt damit, sobald
   * der erste Satz fertig ist, statt auf den ganzen Absatz zu warten – das
   * ist der Unterschied zwischen gut einer und viereinhalb Sekunden.
   */
  const speak = useCallback(async (text: string, options?: SpeakOptions) => {
    const session = sessionRef.current;
    if (!session || !text.trim()) return;

    const chunks = splitIntoSpeechChunks(text);
    if (chunks.length === 0) return;

    // Parallel anstoßen, damit die späteren Stücke schon entstehen, während
    // das erste bereits gesprochen wird.
    const pending = chunks.map((chunk) =>
      synthesize(chunk).catch((caught) => {
        console.error("Sprachausgabe fehlgeschlagen:", caught);
        return null;
      }),
    );

    for (const request of pending) {
      const audio = await request;

      // Zwischendurch kann das Gespräch beendet oder unterbrochen worden
      // sein – dann darf nichts Weiteres mehr herausgehen.
      if (!activeRef.current || sessionRef.current !== session) return;
      // Zwischen Anstoßen und Fertigstellung kann der Grund entfallen sein –
      // etwa wenn die echte Antwort schneller da war als der Zwischenruf.
      if (options?.skipIf?.()) return;
      if (!audio) continue;

      try {
        session.repeatAudio(audio);
      } catch (caught) {
        console.error("Audio konnte nicht gesendet werden:", caught);
        return;
      }
    }
  }, []);

  /** Bricht eine laufende Antwort ab, z. B. wenn der Nutzer dazwischenredet. */
  const interrupt = useCallback(() => {
    try {
      sessionRef.current?.interrupt();
    } catch {
      // Nichts am Laufen – dann gibt es auch nichts abzubrechen.
    }
  }, []);

  return {
    connection,
    error,
    videoRef,
    prepare,
    start,
    stop,
    speak,
    interrupt,
  };
}
