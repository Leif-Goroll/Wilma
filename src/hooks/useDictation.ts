"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { cleanTranscript } from "@/lib/dictation";

export type DictationState = "idle" | "recording" | "processing";

interface UseDictationOptions {
  onResult: (cleanedText: string) => void;
  /**
   * Optionaler Draht nach oben: Elternkomponenten (z. B. der Chat mit dem
   * Wilma-Avatar) können so auf "hört zu"/"verarbeitet" reagieren. Muss
   * stabil sein (z. B. ein useState-Setter).
   */
  onStateChange?: (state: DictationState) => void;
}

// Web Speech API-Unterstützung ändert sich nie während der Session – es
// braucht also kein echtes "Abonnement". useSyncExternalStore sorgt aber
// dafür, dass beim ersten Client-Render (Hydration) wie auf dem Server
// `false` geliefert wird, und erst danach der echte Browser-Wert – ohne
// Hydration-Mismatch und ohne setState im Effect.
function subscribe() {
  return () => {};
}

/**
 * Ist das Widget auf einer fremden Seite eingebettet, kann diese das
 * Mikrofon für Rahmen sperren – manche WordPress-Sicherheits-Plugins tun
 * das über eine eigene `Permissions-Policy`. Die Spracherkennung liefe
 * dann ins Leere, ohne dass der Besucher erführe warum. Steht die Sperre
 * fest, wird der Mikrofonknopf deshalb gar nicht erst angeboten.
 *
 * Browser ohne diese Abfrage (Firefox, Safari) gelten als erlaubt:
 * "unbekannt" ist kein "nein".
 */
function microphoneAllowed() {
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  if (!policy) return true;

  try {
    return policy.allowsFeature("microphone");
  } catch {
    return true;
  }
}

function getSnapshot() {
  const supported = Boolean(
    window.SpeechRecognition ?? window.webkitSpeechRecognition,
  );
  return supported && microphoneAllowed();
}
function getServerSnapshot() {
  return false;
}

export function useDictation({
  onResult,
  onStateChange,
}: UseDictationOptions) {
  const [state, setState] = useState<DictationState>("idle");
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");

  const supported = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const changeState = useCallback(
    (next: DictationState) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange]
  );

  const start = useCallback(() => {
    if (!supported || state !== "idle") return;

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "de-DE";
    recognition.continuous = true;
    recognition.interimResults = true;

    finalTranscriptRef.current = "";
    setInterimText("");

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscriptRef.current += `${result[0].transcript} `;
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = () => {
      recognitionRef.current = null;
      setInterimText("");
      changeState("idle");
    };

    recognition.start();
    recognitionRef.current = recognition;
    changeState("recording");
  }, [supported, state, changeState]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || state !== "recording") return;

    changeState("processing");

    recognition.onend = () => {
      const rawText = finalTranscriptRef.current.trim();
      recognitionRef.current = null;
      setInterimText("");

      if (!rawText) {
        changeState("idle");
        return;
      }

      cleanTranscript(rawText)
        .then(onResult)
        .finally(() => changeState("idle"));
    };

    recognition.stop();
  }, [state, onResult, changeState]);

  return { supported, state, interimText, start, stop };
}
