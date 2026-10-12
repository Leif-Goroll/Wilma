"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AvatarStage from "@/components/AvatarStage";
import { useDictation } from "@/hooks/useDictation";
import { useLiveAvatar } from "@/hooks/useLiveAvatar";
import CalendlyButton from "@/components/CalendlyButton";
import { createId } from "@/lib/id";
import { toSpeakableText } from "@/lib/speakableText";
import { GREETING, THINKING_CUES } from "@/lib/voiceLines";
import { sendMessage } from "@/lib/wilsonChannel";
import { track } from "@/lib/analytics/track";
import type { WilmaAvatarState } from "@/components/WilmaAvatar";
import type { WilsonAction } from "@/lib/types";

/**
 * Sprachmodus: Wilma als Live-Video über die ganze Fläche, darüber ein
 * einziger Knopf – "Sprechen", während der Aufnahme "Abschicken".
 *
 * Die Gesprächsschleife ist
 *   Mikrofon → Web Speech API → n8n (/api/wilson) → Antworttext
 *   → Sprachausgabe (/api/avatar/speak) → LiveAvatar → lippensynchrones Video.
 *
 * n8n bleibt damit das Gehirn: Qualifizierung, Terminlogik und die
 * `[ACTION:…]`-Marker funktionieren im Gespräch genauso wie im Chat.
 *
 * Die Verbindung startet von selbst, sobald das Panel erscheint – die
 * bewusste Entscheidung fällt vorher auf dem Start-Bildschirm ("Gespräch
 * starten"). Zurück oder Schließen beendet die Sitzung und damit die
 * Abrechnung.
 */

/**
 * Wie lange gewartet wird, bevor Wilma die Denkpause überbrückt. Der
 * n8n-Agent braucht je nach Frage mehrere Sekunden; ohne Zwischenruf steht
 * sie so lange stumm da, was im Gespräch wie ein Verbindungsabbruch wirkt.
 */
const THINKING_CUE_DELAY_MS = 1200;

interface VoicePanelProps {
  /** Greenscreen ausstanzen – nur nötig bei Avataren ohne Hintergrund. */
  chromaKey: boolean;
  onStateChange: (state: WilmaAvatarState) => void;
  /** Zurück zum Start-Bildschirm – es gibt keinen Chat mehr, in den man
   *  stattdessen wechseln könnte. */
  onBack: () => void;
}

export default function VoicePanel({
  chromaKey,
  onStateChange,
  onBack,
}: VoicePanelProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [lastAction, setLastAction] = useState<WilsonAction | undefined>();
  const [sessionId] = useState(createId);
  // Beginn der Sprachsitzung: Daraus wird beim Verlassen die Dauer gemeldet,
  // die einzige Zahl im Dashboard, die direkt Geld kostet (Credits je Minute).
  const voiceStartedAt = useRef<number | null>(null);

  const {
    connection,
    error,
    videoRef,
    prepare,
    start,
    stop,
    speak,
    interrupt,
  } = useLiveAvatar({ onSpeakingChange: setIsSpeaking });

  // Verbinden, sobald das Panel sichtbar ist; beim Verlassen beenden.
  // Doppelte Ausführung (React im Entwicklungsmodus) fängt der Hook ab.
  useEffect(() => {
    prepare();
    void start(GREETING);
    voiceStartedAt.current = Date.now();
    track("voice_start");

    return () => {
      void stop();
      const startedAt = voiceStartedAt.current;
      voiceStartedAt.current = null;
      if (startedAt) {
        track("voice_end", {
          value: Math.round((Date.now() - startedAt) / 1000),
        });
      }
    };
  }, [prepare, start, stop]);

  const handleTranscript = useCallback(
    async (text: string) => {
      setIsThinking(true);

      // Wird gesetzt, sobald n8n geantwortet hat. Der Zwischenruf prüft das
      // kurz vor dem Abspielen und verstummt, wenn er nicht mehr nötig ist.
      let replyArrived = false;

      const cue = setTimeout(() => {
        const phrase =
          THINKING_CUES[Math.floor(Math.random() * THINKING_CUES.length)];
        void speak(phrase, { skipIf: () => replyArrived });
      }, THINKING_CUE_DELAY_MS);

      try {
        const reply = await sendMessage(text, sessionId, "voice");
        replyArrived = true;
        clearTimeout(cue);
        setLastAction(reply.action);
        // Gesprochen wird nur der Fließtext: Aktionsmarker sind schon
        // serverseitig raus, Markdown und URLs entfernt der Sanitizer.
        // LiveAvatar reiht die Äußerungen, ein noch laufender Zwischenruf
        // wird also sauber zu Ende gesprochen.
        await speak(toSpeakableText(reply.text));
      } finally {
        clearTimeout(cue);
        setIsThinking(false);
      }
    },
    [speak, sessionId],
  );

  const dictation = useDictation({ onResult: handleTranscript });

  // Der Avatar im Widget-Kopf spiegelt, was im Gespräch gerade passiert.
  // Sprechen schlägt Nachdenken: Während des Zwischenrufs läuft beides.
  useEffect(() => {
    onStateChange(
      dictation.state === "recording"
        ? "listening"
        : isSpeaking
          ? "speaking"
          : isThinking || dictation.state === "processing"
            ? "thinking"
            : connection === "live"
              ? "online"
              : "offline",
    );
  }, [dictation.state, isThinking, isSpeaking, connection, onStateChange]);

  function handleButton() {
    if (dictation.state === "idle") {
      // Dazwischenreden beendet Wilmas laufende Antwort.
      if (isSpeaking) interrupt();
      dictation.start();
    } else if (dictation.state === "recording") {
      dictation.stop();
    }
  }

  const isLive = connection === "live";
  const isRecording = dictation.state === "recording";
  // Solange die Aufnahme bereinigt wird oder n8n rechnet, gibt es nichts zu
  // drücken. Spricht Wilma dagegen nur, darf man sie unterbrechen.
  const isBusy = dictation.state === "processing" || isThinking;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#08142a]">
      {/* Ohne Freisteller ist das <video> direkt sichtbar. Mit Freisteller
          trägt es nur Stream und Ton und wird durchsichtig gestellt – aber
          in voller Größe: display:none oder ein Ein-Pixel-Element stoppt die
          Videodekodierung, dann käme am Canvas kein Bild mehr an. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`absolute inset-0 h-full w-full object-cover object-center ${
          chromaKey ? "pointer-events-none opacity-0" : ""
        } ${isLive ? "" : "invisible"}`}
      />
      {chromaKey && isLive && (
        <AvatarStage
          videoRef={videoRef}
          active={isLive}
          className="absolute inset-0"
        />
      )}

      {!isLive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          {connection === "connecting" || connection === "idle" ? (
            <>
              <svg
                viewBox="0 0 24 24"
                className="h-8 w-8 animate-spin text-[#67E8F9]"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth={3}
                  opacity={0.25}
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              </svg>
              <p className="text-sm text-[#CBD5E1]">Wilma wird verbunden …</p>
            </>
          ) : (
            <>
              <p className="text-sm text-[#CBD5E1]">
                {connection === "ended"
                  ? "Das Gespräch wurde beendet."
                  : (error ?? "Wilma ist gerade nicht erreichbar.")}
              </p>
              <div className="flex flex-col items-center gap-2">
                {(connection === "error" || connection === "ended") && (
                  <button
                    type="button"
                    onClick={() => void start(GREETING)}
                    className="rounded-lg bg-[#22D3EE] px-5 py-2.5 text-sm font-semibold text-[#0E1F37] transition-opacity hover:opacity-90"
                  >
                    {connection === "ended"
                      ? "Neu verbinden"
                      : "Erneut verbinden"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onBack}
                  className="text-xs font-semibold text-[#22D3EE] underline underline-offset-4 hover:opacity-80"
                >
                  Zurück
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {isLive && (
        // Verlauf nach unten, damit Knopf und Hinweise auf jedem Bild
        // lesbar bleiben – ohne das Gesicht zu verdecken.
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-[#08142a]/95 via-[#08142a]/60 to-transparent px-4 pb-4 pt-16">
          {isRecording && (
            <p
              aria-live="polite"
              className="mx-auto max-w-full rounded-full bg-black/55 px-4 py-1.5 text-center text-xs text-white backdrop-blur-sm"
            >
              {dictation.interimText
                ? `„${dictation.interimText}“`
                : "Ich höre zu. Sprechen Sie jetzt."}
            </p>
          )}

          {/* Die Aktion wird nicht vorgelesen, darf aber nicht verpuffen:
              der Buchungslink erscheint als Schaltfläche über dem Knopf. */}
          {lastAction === "book_appointment" && <CalendlyButton />}

          {dictation.supported ? (
            <button
              type="button"
              onClick={handleButton}
              disabled={isBusy}
              aria-label={isRecording ? "Aufnahme abschicken" : "Sprechen"}
              className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold shadow-lg shadow-black/30 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
                isRecording
                  ? "bg-[#FACC15] text-[#0E1F37]"
                  : "bg-[#22D3EE] text-[#0E1F37]"
              }`}
            >
              {isBusy ? (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 animate-spin"
                    fill="none"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth={3}
                      opacity={0.25}
                    />
                    <path
                      d="M21 12a9 9 0 0 0-9-9"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                    />
                  </svg>
                  Einen Moment …
                </>
              ) : (
                <>
                  {isRecording ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 12h16" />
                      <path d="M13 5l7 7-7 7" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
                      <path d="M19 11a7 7 0 0 1-14 0" />
                      <path d="M12 18v3" />
                    </svg>
                  )}
                  {isRecording ? "Abschicken" : "Sprechen"}
                </>
              )}
            </button>
          ) : (
            // Die Spracherkennung läuft nur in Chrome und Edge. Ohne Chat
            // als Ausweichmöglichkeit bleibt hier nur der Hinweis und der
            // Rückweg – auf anderen Browsern ist das ein echter Dead-End,
            // dessen sollte man sich bewusst sein.
            <div className="flex flex-col items-center gap-2 rounded-xl bg-black/55 px-4 py-3 text-center backdrop-blur-sm">
              <p className="text-xs text-white">
                Sprechen funktioniert in Chrome oder Edge.
              </p>
              <button
                type="button"
                onClick={onBack}
                className="text-xs font-semibold text-[#22D3EE] underline underline-offset-4 hover:opacity-80"
              >
                Zurück
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
