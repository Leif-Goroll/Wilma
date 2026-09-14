import WilmaAvatar from "@/components/WilmaAvatar";

export default function TypingIndicator() {
  return (
    <div className="flex items-end gap-2.5">
      <WilmaAvatar size="xs" state="thinking" breathing={false} />

      <div className="flex items-center gap-1.5 rounded-lg border border-[#1F3B5C] bg-[#142540] px-4 py-3">
        <span className="sr-only">Wilma tippt …</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#67E8F9]"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
