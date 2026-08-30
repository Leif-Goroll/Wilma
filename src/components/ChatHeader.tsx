export default function ChatHeader() {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-[#1F3B5C] px-5 py-5 sm:px-7 sm:py-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#67E8F9]">
          Future AI Solutions · KI-Büroassistent
        </p>
        <h1 className="mt-1.5 text-2xl font-bold text-white sm:text-3xl">
          Wilson
        </h1>
        <p className="mt-2 text-xs text-[#94A3B8]">Sie sprechen mit einer KI.</p>
      </div>

      <div
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#22D3EE] bg-[#0E1F37]"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 text-[#22D3EE]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="8" width="16" height="11" rx="3" />
          <path d="M12 8V4" />
          <circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="9" cy="13.5" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="15" cy="13.5" r="1.3" fill="currentColor" stroke="none" />
          <path d="M9 17.5h6" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
        </svg>
      </div>
    </header>
  );
}
