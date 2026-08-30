"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { cleanTranscript } from "@/lib/dictation";

export type DictationState = "idle" | "recording" | "processing";

interface UseDictationOptions {
  onResult: (cleanedText: string) => void;
}

// Web Speech API-Unterstützung ändert sich nie während der Session – es
// braucht also kein echtes "Abonnement". useSyncExternalStore sorgt aber
// dafür, dass beim ersten Client-Render (Hydration) wie auf dem Server
// `false` geliefert wird, und erst danach der echte Browser-Wert – ohne
// Hydration-Mismatch und ohne setState im Effect.
function subscribe() {
  return () => {};
}
function getSnapshot() {
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}
function getServerSnapshot() {
  return false;
}

export function useDictation({ onResult }: UseDictationOptions) {
  const [state, setState] = useState<DictationState>("idle");
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");

  const supported = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
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
      setState("idle");
    };

    recognition.start();
    recognitionRef.current = recognition;
    setState("recording");
  }, [supported, state]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || state !== "recording") return;

    setState("processing");

    recognition.onend = () => {
      const rawText = finalTranscriptRef.current.trim();
      recognitionRef.current = null;
      setInterimText("");

      if (!rawText) {
        setState("idle");
        return;
      }

      cleanTranscript(rawText)
        .then(onResult)
        .finally(() => setState("idle"));
    };

    recognition.stop();
  }, [state, onResult]);

  return { supported, state, interimText, start, stop };
}
