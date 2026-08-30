"use client";

import { useEffect, useRef, useState } from "react";
import ChatHeader from "@/components/ChatHeader";
import MessageBubble from "@/components/MessageBubble";
import TypingIndicator from "@/components/TypingIndicator";
import ChatInput from "@/components/ChatInput";
import CalendlyButton from "@/components/CalendlyButton";
import SliderQuestion from "@/components/SliderQuestion";
import { sendMessage } from "@/lib/wilsonChannel";
import type { ChatMessage } from "@/lib/types";
import {
  QUALIFICATION_SLIDERS,
  isQualificationSliderAction,
} from "@/lib/qualificationSliders";

const GREETING: ChatMessage = {
  id: "greeting",
  role: "wilson",
  text: "Guten Tag! Ich bin Wilson, der digitale Büroassistent von Future AI Solutions. Wie kann ich Ihnen heute helfen?",
  timestamp: Date.now(),
};

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [isLoading, setIsLoading] = useState(false);
  const sessionIdRef = useRef<string>(createId());
  const scrollAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function handleSend(text: string) {
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    const reply = await sendMessage(text, sessionIdRef.current);

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
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden rounded-lg border border-[#1F3B5C] bg-[#0E1F37] sm:h-[calc(100dvh-6rem)]">
      <div className="h-1 w-full shrink-0 bg-[#22D3EE]" />
      <ChatHeader />

      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-7">
        {messages.map((message) => (
          <div key={message.id} className="space-y-3">
            <MessageBubble message={message} />
            {message.action === "book_appointment" && <CalendlyButton />}
            {isQualificationSliderAction(message.action) && (
              <SliderQuestion
                {...QUALIFICATION_SLIDERS[message.action]}
                disabled={isLoading}
                onSubmit={handleSend}
              />
            )}
          </div>
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={scrollAnchorRef} />
      </div>

      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
