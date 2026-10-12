"use client";

import { isEmbedded, postFrameState } from "@/lib/embedFrame";
import { track } from "@/lib/analytics/track";

declare global {
  interface Window {
    Calendly?: {
      initPopupWidget: (options: { url: string }) => void;
    };
  }
}

const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL;

/**
 * Calendly legt sein Buchungsformular als Overlay über die ganze Seite.
 * In der Einbettung ist "die ganze Seite" aber nur das schmale iframe des
 * Widgets – das Formular wäre unbenutzbar. Deshalb wird das iframe für die
 * Dauer der Buchung auf Vollbild gesetzt und danach wieder zusammen-
 * gefaltet.
 */
function expandFrameWhileBooking() {
  if (!isEmbedded()) return;

  postFrameState("overlay");

  const observer = new MutationObserver(() => {
    if (document.querySelector(".calendly-overlay")) return;

    observer.disconnect();
    // Zurück in den Zustand, aus dem heraus gebucht wurde: Das Widget war
    // offen, sonst wäre der Button nicht sichtbar gewesen.
    postFrameState("open");
  });

  observer.observe(document.body, { childList: true });
}

export default function CalendlyButton() {
  if (!CALENDLY_URL) {
    return null;
  }

  function openCalendly() {
    // Das Öffnen des Buchungsformulars ist die aussagekräftigste Größe im
    // Dashboard: Bis hierher hat das Gespräch getragen.
    track("booking");
    expandFrameWhileBooking();
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
