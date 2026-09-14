"use client";

import { useCallback, useEffect, useState } from "react";
import AvatarStage from "@/components/AvatarStage";
import { useDictation } from "@/hooks/useDictation";
import { useLiveAvatar } from "@/hooks/useLiveAvatar";
import CalendlyButton from "@/components/CalendlyButton";
import { createId } from "@/lib/id";
import { toSpeakableText } from "@/lib/speakableText";
import { GREETING, THINKING_CUES } from "@/lib/voiceLines";
import { sendMessage } from "@/lib/wilsonChannel";
import type { WilmaAvatarState } from "@/components/WilmaAvatar";
import type { WilsonAction } from "@/lib/types";

/**
 * Sprachmodus: Wilma als Live-Video.
 *
 * Die Gesprächsschleife ist
 *   Mikrofon → Web Speech API → n8n (/api/wilson) → Antworttext
 *   → OpenAI-TTS (/api/avatar/speak) → LiveAvatar → lippensynchrones Video.
 *
 * n8n bleibt damit das Gehirn: Qualifizierung, Terminlogik und die
 * `[ACTION:…]`-Marker funktionieren im Gespräch genauso wie im Chat.
 */

/**
 * Wie lange gewartet wird, bevor Wilma die Denkpause überbrückt. Der
 * n8n-Agent braucht je nach Frage 2–8 Sekunden; ohne Zwischenruf steht sie
 * so lange stumm da, was im Gespräch wie ein Verbindungsabbruch wirkt.
 */
const THINKING_CUE_DELAY_MS = 1200;

interface VoicePanelProps {
  /** Greenscreen ausstanzen – nur noetig bei Avataren ohne Hintergrund. */
  chromaKey: boolean;
  onStateChange: (state: WilmaAvatarState) => void;
  onSwitchToChat: () => void;
}

export default function VoicePanel({
  chromaKey,
  onStateChange,
  onSwitchToChat,
}: VoicePanelProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<WilsonAction | undefined>();
  const [typed, setTyped] = useState("");
  const [sessionId] = useState(createId);

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

  // Sobald jemand den Sprachmodus öffnet, Token und SDK im Hintergrund
  // besorgen. Der Klick auf "Gespräch starten" findet dann alles vor.
  useEffect(() => {
    prepare();
  }, [prepare]);

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
        const reply = await sendMessage(text, sessionId);
        replyArrived = true;
        clearTimeout(cue);
        setLastReply(reply.text);
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

  function handleMicClick() {
    if (dictation.state === "idle") {
      // Dazwischenreden beendet Wilmas laufende Antwort.
      if (isSpeaking) interrupt();
      dictation.start();
    } else if (dictation.state === "recording") {
      dictation.stop();
    }
  }

  const isLive = connection === "live";
  // Reihenfolge ist wichtig: Sobald Wilma tatsächlich spricht, schlägt das
  // das Nachdenken. Während des Zwischenrufs läuft beides gleichzeitig –
  // "Einen Moment …" anzuzeigen, während sie redet, wäre schlicht falsch.
  const statusLine = !isLive
    ? null
    : dictation.state === "recording"
      ? "Ich höre zu – sprechen Sie jetzt."
      : isSpeaking
        ? "Wilma antwortet …"
        : dictation.state === "processing" || isThinking
          ? "Einen Moment …"
          : "Tippen Sie auf das Mikrofon, um zu sprechen.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Fester Hoehenanteil statt Seitenverhaeltnis: Der Bereich braucht
          eine definierte Hoehe (beide Kinder liegen absolut, ein Canvas mit
          h-full waere sonst 0 Pixel gross) – und er darf die Bedienelemente
          darunter nicht aus dem Panel druecken. */}
      <div className="relative h-[52%] w-full shrink-0 overflow-hidden bg-[#08142a]">
        {/* Ohne Freisteller ist das <video> direkt sichtbar. Mit
            Freisteller traegt es nur Stream und Ton und wird durchsichtig
            gestellt – aber in voller Groesse: display:none oder ein
            Ein-Pixel-Element stoppt die Videodekodierung, dann kaeme am
            Canvas kein Bild mehr an. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 h-full w-full object-cover ${
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            {connection === "connecting" ? (
              <>
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7 animate-spin text-[#67E8F9]"
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
                  {error ??
                    "Wilma antwortet Ihnen hier live per Video – am besten mit Kopfhörern."}
                </p>
                {error && (
                  <button
                    type="button"
                    onClick={onSwitchToChat}
                    className="text-xs font-semibold text-[#22D3EE] underline underline-offset-4 hover:opacity-80"
                  >
                    Stattdessen schreiben
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Untertitel: hilft bei Lärm, schlechter Verbindung und
            Barrierefreiheit. Bewusst auf drei Zeilen begrenzt – der
            vollständige Text steht ohnehin im Chat, und ein scrollender
            Kasten würde das halbe Gesicht verdecken. */}
        {isLive && lastReply && (
          <p className="absolute inset-x-0 bottom-0 line-clamp-3 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-3 pb-2 pt-6 text-[11px] leading-snug text-white">
            {lastReply}
          </p>
        )}
      </div>

      {/* Scrollt statt ueberzulaufen: Kommt eine Aktion dazu (z. B. der
          Terminbutton), waechst der Bereich – das Eingabefeld darf dabei
          nicht aus dem Panel geschoben werden. */}
      <div
        className={`no-scrollbar flex min-h-0 flex-col gap-2 overflow-y-auto border-t border-[#1F3B5C] px-4 ${
          // Vor dem Start ist hier nichts – dann soll der Bereich auch
          // keinen leeren Streifen im Panel hinterlassen.
          isLive ? "flex-1 py-3" : "shrink-0"
        }`}
      >
        {statusLine && (
          <p aria-live="polite" className="text-center text-xs text-[#94A3B8]">
            {dictation.state === "recording" && dictation.interimText
              ? `„${dictation.interimText}“`
              : statusLine}
          </p>
        )}

        {/* Die Aktion wird nicht vorgelesen, darf aber nicht verpuffen:
            den Buchungslink zeigen wir als Schaltflaeche unter dem Video. */}
        {isLive && lastAction === "book_appointment" && <CalendlyButton />}

        {/* Tippen als gleichwertiger Weg: fuer laute Umgebungen, aus
            Ruecksicht auf Mithörende – und fuer Browser ohne Web Speech API,
            die sonst im Sprachmodus feststecken wuerden. */}
        {isLive && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const text = typed.trim();
              if (!text || isThinking) return;
              setTyped("");
              if (isSpeaking) interrupt();
              void handleTranscript(text);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={isThinking || dictation.state !== "idle"}
              placeholder={
                dictation.supported
                  ? "… oder tippen"
                  : "Hier tippen – Mikrofon geht in diesem Browser nicht"
              }
              aria-label="Nachricht an Wilma tippen"
              className="h-9 flex-1 rounded-lg border border-[#1F3B5C] bg-[#0E1F37] px-3 text-xs text-white placeholder-[#64748B] outline-none focus:border-[#22D3EE] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!typed.trim() || isThinking}
              aria-label="Senden"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1F3B5C] text-white transition-opacity hover:opacity-80 disabled:opacity-40"
            >
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
            </button>
          </form>
        )}
      </div>

      {/* Mikrofon und Beenden bleiben immer sichtbar – sie duerfen
          nie weggescrollt werden, auch wenn darueber eine Aktion
          eingeblendet ist. */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[#1F3B5C] px-4 py-3">
        {isLive && dictation.supported && (
          <button
            type="button"
            onClick={handleMicClick}
            disabled={dictation.state === "processing" || isThinking}
            aria-label={
              dictation.state === "recording" ? "Aufnahme beenden" : "Sprechen"
            }
            className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
              dictation.state === "recording"
                ? "bg-[#FACC15] text-[#0E1F37]"
                : "bg-[#22D3EE] text-[#0E1F37]"
            }`}
          >
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
            {dictation.state === "recording" ? "Fertig" : "Sprechen"}
          </button>
        )}

        <button
          type="button"
          onClick={isLive ? () => void stop() : () => void start(GREETING)}
          disabled={connection === "connecting" || connection === "unavailable"}
          className={`flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
            isLive
              ? "border border-[#1F3B5C] bg-[#0E1F37] text-[#94A3B8]"
              : "w-full bg-[#22D3EE] text-[#0E1F37]"
          }`}
        >
          {isLive ? "Beenden" : "Gespräch starten"}
        </button>
      </div>
    </div>
  );
}
