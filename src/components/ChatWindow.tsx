"use client";

import { useEffect, useRef, useState } from "react";
import ChatHeader from "@/components/ChatHeader";
import MessageBubble from "@/components/MessageBubble";
import TypingIndicator from "@/components/TypingIndicator";
import ChatInput from "@/components/ChatInput";
import CalendlyButton from "@/components/CalendlyButton";
import SliderQuestion from "@/components/SliderQuestion";
import type { WilmaAvatarState } from "@/components/WilmaAvatar";
import type { DictationState } from "@/hooks/useDictation";
import { createId } from "@/lib/id";
import { sendMessage } from "@/lib/wilsonChannel";
import type { ChatMessage } from "@/lib/types";
import {
  QUALIFICATION_SLIDERS,
  isQualificationSliderAction,
} from "@/lib/qualificationSliders";

const GREETING: ChatMessage = {
  id: "greeting",
  role: "wilson",
  text: "Guten Tag! Ich bin Wilma, die digitale Büroassistentin von Future AI Solutions. Wie kann ich Ihnen heute helfen?",
  timestamp: Date.now(),
};

/** Wie lange Wilma nach einer Antwort noch sichtbar "spricht". */
const SPEAKING_MS = 2600;

interface ChatWindowProps {
  /**
   * Im Widget steuert das Panel Größe, Rahmen und Kopfzeile selbst – der
   * Chat füllt dann nur noch den verbleibenden Platz.
   */
  embedded?: boolean;
  /**
   * Meldet Wilmas Zustand nach außen, damit eine fremde Kopfzeile (z. B. die
   * des Widget-Panels) denselben Status anzeigen kann.
   */
  onStateChange?: (state: WilmaAvatarState) => void;
}

export default function ChatWindow({
  embedded = false,
  onStateChange,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [isLoading, setIsLoading] = useState(false);
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionId] = useState(createId);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    };
  }, []);

  // Der Avatar spiegelt, was Wilma gerade tut – Diktat schlägt dabei alles,
  // weil die Nutzerin dann aktiv mit ihr spricht.
  const wilmaState: WilmaAvatarState =
    dictationState === "recording"
      ? "listening"
      : isLoading || dictationState === "processing"
        ? "thinking"
        : isSpeaking
          ? "speaking"
          : "online";

  useEffect(() => {
    onStateChange?.(wilmaState);
  }, [wilmaState, onStateChange]);

  async function handleSend(text: string) {
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const reply = await sendMessage(text, sessionId);

    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: "wilson",
        text: reply.text,
        action: reply.action,
        timestamp: Date.now(),
      },
    ]);
    setIsLoading(false);

    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
    setIsSpeaking(true);
    speakingTimeoutRef.current = setTimeout(
      () => setIsSpeaking(false),
      SPEAKING_MS
    );
  }

  return (
    <div
      className={
        embedded
          ? "flex h-full w-full flex-col overflow-hidden bg-[#0E1F37]"
          : "flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden rounded-lg border border-[#1F3B5C] bg-[#0E1F37] sm:h-[calc(100dvh-6rem)]"
      }
    >
      {!embedded && (
        <>
          <div className="h-1 w-full shrink-0 bg-[#22D3EE]" />
          <ChatHeader state={wilmaState} />
        </>
      )}

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-7">
        {messages.map((message, index) => (
          <div key={message.id} className="space-y-3">
            <MessageBubble
              message={message}
              showAvatar={messages[index - 1]?.role !== "wilson"}
            />
            {/* Bündig zu Wilmas Blasen: Avatarbreite (32px) + Abstand (10px). */}
            {message.action === "book_appointment" && (
              <div className="pl-[42px]">
                <CalendlyButton />
              </div>
            )}
            {isQualificationSliderAction(message.action) && (
              <div className="pl-[42px]">
                <SliderQuestion
                  {...QUALIFICATION_SLIDERS[message.action]}
                  disabled={isLoading}
                  onSubmit={handleSend}
                />
              </div>
            )}
          </div>
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={scrollAnchorRef} />
      </div>

      <ChatInput
        onSend={handleSend}
        disabled={isLoading}
        onDictationStateChange={setDictationState}
      />
    </div>
  );
}
