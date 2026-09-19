"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useDictation } from "@/hooks/useDictation";
import type { DictationState } from "@/hooks/useDictation";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  /** Meldet Diktier-Zustände nach oben, damit Wilma "zuhören" kann. */
  onDictationStateChange?: (state: DictationState) => void;
}

export default function ChatInput({
  onSend,
  disabled,
  onDictationStateChange,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dictation = useDictation({
    onResult: (cleanedText) => {
      setValue((prev) => (prev.trim() ? `${prev.trim()} ${cleanedText}` : cleanedText));
      textareaRef.current?.focus();
    },
    onStateChange: onDictationStateChange,
  });

  const isDictating = dictation.state !== "idle";

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleMicClick() {
    if (dictation.state === "idle") {
      dictation.start();
    } else if (dictation.state === "recording") {
      dictation.stop();
    }
  }

  return (
    <div className="border-t border-[#1F3B5C] px-4 py-3 sm:px-5 sm:py-4">
      {dictation.state === "recording" && (
        <div className="mb-2 flex items-center gap-2 text-xs text-[#94A3B8]">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#FACC15]" />
          <span className="shrink-0">Aufnahme läuft. Sprechen Sie jetzt …</span>
          {dictation.interimText && (
            <span className="truncate italic">„{dictation.interimText}“</span>
          )}
        </div>
      )}
      {dictation.state === "processing" && (
        <div className="mb-2 flex items-center gap-2 text-xs text-[#94A3B8]">
          <svg
            viewBox="0 0 24 24"
            className="h-3 w-3 shrink-0 animate-spin text-[#67E8F9]"
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
          <span>Wird transkribiert und bereinigt …</span>
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Nachricht an Wilma …"
          aria-label="Nachricht an Wilma"
          disabled={disabled || isDictating}
          className="max-h-32 flex-1 resize-none rounded-lg border border-[#1F3B5C] bg-[#0E1F37] px-4 py-2.5 text-[15px] text-white placeholder-[#94A3B8] outline-none focus:border-[#22D3EE] focus:ring-1 focus:ring-[#22D3EE] disabled:opacity-60"
        />

        {dictation.supported && (
          <button
            type="button"
            onClick={handleMicClick}
            disabled={disabled || dictation.state === "processing"}
            aria-label={
              dictation.state === "recording"
                ? "Aufnahme beenden und transkribieren"
                : "Diktieren starten"
            }
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              dictation.state === "recording"
                ? "border-[#FACC15] bg-[#FACC15] text-[#0E1F37] hover:opacity-90"
                : "border-[#1F3B5C] bg-[#0E1F37] text-[#94A3B8] hover:border-[#22D3EE] hover:text-[#22D3EE]"
            }`}
          >
            {dictation.state === "recording" ? (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
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
          </button>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || isDictating || !value.trim()}
          aria-label="Nachricht senden"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#22D3EE] text-[#0E1F37] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
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
      </div>
    </div>
  );
}
