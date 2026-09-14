import WilmaAvatar, { type WilmaAvatarState } from "@/components/WilmaAvatar";

const STATUS_TEXT: Record<WilmaAvatarState, string> = {
  online: "Online · antwortet sofort",
  thinking: "Wilma denkt nach …",
  listening: "Wilma hört zu …",
  speaking: "Wilma antwortet …",
  offline: "Zurzeit nicht erreichbar",
};

const STATUS_COLOR: Record<WilmaAvatarState, string> = {
  online: "text-[#4ADE80]",
  thinking: "text-[#22D3EE]",
  listening: "text-[#FACC15]",
  speaking: "text-[#67E8F9]",
  offline: "text-[#94A3B8]",
};

export default function ChatHeader({
  state = "online",
}: {
  state?: WilmaAvatarState;
}) {
  return (
    <header className="flex items-center gap-4 border-b border-[#1F3B5C] px-5 py-4 sm:px-7 sm:py-5">
      <WilmaAvatar state={state} size="lg" showStatus preload />

      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#67E8F9]">
          Future AI Solutions · KI-Büroassistentin
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Wilma</h1>
        <p
          aria-live="polite"
          className={`mt-1.5 text-xs font-medium ${STATUS_COLOR[state]}`}
        >
          {STATUS_TEXT[state]}
        </p>
        <p className="mt-0.5 text-xs text-[#94A3B8]">
          Sie sprechen mit einer KI.
        </p>
      </div>
    </header>
  );
}
