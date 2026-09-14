import type { ChatMessage } from "@/lib/types";
import { formatMessageText } from "@/lib/formatMessageText";
import WilmaAvatar from "@/components/WilmaAvatar";

interface MessageBubbleProps {
  message: ChatMessage;
  /**
   * Bei mehreren Wilma-Nachrichten hintereinander zeigt nur die erste den
   * Avatar – die folgenden werden per Platzhalter bündig eingerückt.
   */
  showAvatar?: boolean;
}

export default function MessageBubble({
  message,
  showAvatar = true,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg bg-[#22D3EE] px-4 py-2.5 text-[15px] leading-relaxed text-[#0E1F37] sm:max-w-[75%]">
          {formatMessageText(message.text)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2.5">
      {showAvatar ? (
        <WilmaAvatar size="xs" state="online" breathing={false} />
      ) : (
        <span aria-hidden className="h-8 w-8 shrink-0" />
      )}

      <div className="flex min-w-0 max-w-[85%] flex-col items-start sm:max-w-[75%]">
        {showAvatar && (
          <p className="mb-1 ml-1 text-[11px] font-medium text-[#94A3B8]">
            Wilma
          </p>
        )}
        <div className="whitespace-pre-wrap break-words rounded-lg border border-[#1F3B5C] bg-[#142540] px-4 py-2.5 text-[15px] leading-relaxed text-white">
          {formatMessageText(message.text)}
        </div>
      </div>
    </div>
  );
}
