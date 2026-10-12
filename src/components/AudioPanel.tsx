"use client";

import { useCallback, useEffect, useState } from "react";
import CalendlyButton from "@/components/CalendlyButton";
import WilmaAvatar, { type WilmaAvatarState } from "@/components/WilmaAvatar";
import { useDictation } from "@/hooks/useDictation";
import { createId } from "@/lib/id";
import { toSpeakableText } from "@/lib/speakableText";
import { speak, stopSpeech } from "@/lib/speechPlayback";
import { GREETING, THINKING_CUES } from "@/lib/voiceLines";
import { sendMessage } from "@/lib/wilsonChannel";
import type { WilsonAction } from "@/lib/types";

/**
 * Modus „Nur Stimme“: Gespräch wie im Avatar-Anruf, aber ohne Video.
 *
 *   Mikrofon → Web Speech API → n8n (/api/wilson) → Antworttext
 *   → Sprachausgabe (/api/avatar/speak) → Web Audio im Browser
 *
 * Kein LiveAvatar, also keine Credits pro Minute – nur die Vertonung kostet.
 * Wilmas Bild steht still da und zeigt am Ring, ob sie zuhört, nachdenkt
 * oder spricht. Was sie sagt, steht zusätzlich als Text darunter: für alle,
 * die gerade nicht laut hören können, und zum Nachlesen.
 */

/** Wie im Avatar-Anruf: Denkpause überbrücken, bevor es wie ein Abbruch wirkt. */
const THINKING_CUE_DELAY_MS = 1200;

interface AudioPanelProps {
  onStateChange: (state: WilmaAvatarState) => void;
  onBack: () => void;
}

export default function AudioPanel({ onStateChange, onBack }: AudioPanelProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [lastText, setLastText] = useState(GREETING);
  const [lastAction, setLastAction] = useState<WilsonAction | undefined>();
  const [sessionId] = useState(createId);

  const say = useCallback(
    (text: string, skipIf?: () => boolean) =>
      speak(text, {
        skipIf,
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
      }),
    [],
  );

  // Begrüßen, sobald das Panel erscheint; beim Verlassen verstummen.
  // Keine Dauer-Meldung wie im Avatar-Anruf: voice_end zählt im Dashboard
  // LiveAvatar-Minuten, und die fallen hier nicht an.
  useEffect(() => {
    void say(GREETING);
    return () => stopSpeech();
  }, [say]);

  const handleTranscript = useCallback(
    async (text: string) => {
      setIsThinking(true);
      let replyArrived = false;

      const cue = setTimeout(() => {
        const phrase =
          THINKING_CUES[Math.floor(Math.random() * THINKING_CUES.length)];
        void say(phrase, () => replyArrived);
      }, THINKING_CUE_DELAY_MS);

      try {
        const reply = await sendMessage(text, sessionId, "audio");
        replyArrived = true;
        clearTimeout(cue);
        setLastAction(reply.action);
        setLastText(reply.text);
        setIsThinking(false);
        await say(toSpeakableText(reply.text));
      } finally {
        clearTimeout(cue);
        setIsThinking(false);
      }
    },
    [say, sessionId],
  );

  const dictation = useDictation({ onResult: handleTranscript });

  useEffect(() => {
    onStateChange(
      dictation.state === "recording"
        ? "listening"
        : isSpeaking
          ? "speaking"
          : isThinking || dictation.state === "processing"
            ? "thinking"
            : "online",
    );
  }, [dictation.state, isThinking, isSpeaking, onStateChange]);

  function handleButton() {
    if (dictation.state === "idle") {
      // Dazwischenreden beendet Wilmas laufende Antwort.
      if (isSpeaking) stopSpeech();
      dictation.start();
    } else if (dictation.state === "recording") {
      dictation.stop();
    }
  }

  const isRecording = dictation.state === "recording";
  const isBusy = dictation.state === "processing" || isThinking;
  const avatarState: WilmaAvatarState = isRecording
    ? "listening"
    : isSpeaking
      ? "speaking"
      : isBusy
        ? "thinking"
        : "online";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#08142a]">
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-6 pt-8 pb-4 text-center">
        <WilmaAvatar state={avatarState} size="xl" />
        <p aria-live="polite" className="text-sm leading-relaxed text-[#CBD5E1]">
          {isBusy ? "Einen Moment …" : lastText}
        </p>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        {isRecording && (
          <p
            aria-live="polite"
            className="mx-auto max-w-full rounded-full bg-black/40 px-4 py-1.5 text-center text-xs text-white"
          >
            {dictation.interimText
              ? `„${dictation.interimText}“`
              : "Ich höre zu. Sprechen Sie jetzt."}
          </p>
        )}

        {lastAction === "book_appointment" && <CalendlyButton />}

        {dictation.supported ? (
          <button
            type="button"
            onClick={handleButton}
            disabled={isBusy}
            aria-label={isRecording ? "Aufnahme abschicken" : "Sprechen"}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
              isRecording
                ? "bg-[#FACC15] text-[#0E1F37]"
                : "bg-[#22D3EE] text-[#0E1F37]"
            }`}
          >
            {isBusy ? "Einen Moment …" : isRecording ? "Abschicken" : "Sprechen"}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-xs text-[#CBD5E1]">
              Sprechen funktioniert in Chrome oder Edge.
            </p>
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-semibold text-[#22D3EE] underline underline-offset-4 hover:opacity-80"
            >
              Zurück zur Auswahl
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
