import type { ChatMessage } from "@/lib/types";
import { formatMessageText } from "@/lib/formatMessageText";

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-4 py-2.5 text-[15px] leading-relaxed sm:max-w-[75%] ${
          isUser
            ? "bg-[#22D3EE] text-[#0E1F37]"
            : "border border-[#1F3B5C] bg-[#142540] text-white"
        }`}
      >
        {formatMessageText(message.text)}
      </div>
    </div>
  );
}
