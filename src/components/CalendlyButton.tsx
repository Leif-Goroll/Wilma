"use client";

declare global {
  interface Window {
    Calendly?: {
      initPopupWidget: (options: { url: string }) => void;
    };
  }
}

const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL;

export default function CalendlyButton() {
  if (!CALENDLY_URL) {
    return null;
  }

  function openCalendly() {
    window.Calendly?.initPopupWidget({ url: CALENDLY_URL! });
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-[#1F3B5C] bg-[#142540] p-4 sm:max-w-[75%]">
        <p className="text-[15px] leading-relaxed text-white">
          Wählen Sie direkt einen passenden Termin aus.
        </p>
        <button
          type="button"
          onClick={openCalendly}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#22D3EE] px-4 py-2 text-sm font-medium text-[#0E1F37] transition-opacity hover:opacity-90"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M3 10h18" />
            <path d="M8 2v4" />
            <path d="M16 2v4" />
          </svg>
          Termin auswählen
        </button>
      </div>
    </div>
  );
}
