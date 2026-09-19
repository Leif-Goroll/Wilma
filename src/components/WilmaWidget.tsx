"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChatWindow from "@/components/ChatWindow";
import VoicePanel from "@/components/VoicePanel";
import WilmaAvatar, { type WilmaAvatarState } from "@/components/WilmaAvatar";

/**
 * Schwebendes Wilma-Widget unten rechts.
 *
 * Ablauf: geschlossene Blase → Auswahl „Schreiben oder Sprechen“ → Chat
 * bzw. Sprachmodus. Die Auswahl ist bewusst ein eigener Schritt: Schreiben
 * läuft über n8n und kostet nichts, Sprechen verbraucht LiveAvatar-Credits
 * pro Minute. Niemand soll versehentlich im teuren Modus landen.
 */

type WidgetView = "menu" | "chat" | "voice";

/**
 * Verzögerung, bevor die Sprechblase erscheint. Sofort wirkt aufdringlich;
 * nach ein paar Sekunden hat sich der Besucher orientiert und ist
 * ansprechbar.
 */
const TEASER_DELAY_MS = 3500;
const TEASER_DISMISSED_KEY = "wilma-teaser-dismissed";

const STATUS_TEXT: Record<WilmaAvatarState, string> = {
  online: "Online · antwortet sofort",
  thinking: "denkt nach …",
  listening: "hört zu …",
  speaking: "antwortet …",
  offline: "zurzeit nicht erreichbar",
};

interface WilmaWidgetProps {
  /**
   * Nur wenn serverseitig ein LiveAvatar-Key und eine Avatar-ID hinterlegt
   * sind, wird „Sprechen“ überhaupt angeboten.
   */
  voiceEnabled: boolean;
  /** Greenscreen des Avatars im Browser ausstanzen. */
  chromaKey: boolean;
}

export default function WilmaWidget({
  voiceEnabled,
  chromaKey,
}: WilmaWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<WidgetView>("menu");
  const [showTeaser, setShowTeaser] = useState(false);
  const [wilmaState, setWilmaState] = useState<WilmaAvatarState>("online");
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Der Chat bleibt beim Wechsel auf „Sprechen“ montiert, damit der
  // Gesprächsverlauf beim Zurückwechseln nicht verloren geht.
  const [chatStarted, setChatStarted] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(TEASER_DISMISSED_KEY)) return;
    } catch {
      // Speicher gesperrt (privater Modus, strenge Einstellungen) – dann
      // eben bei jedem Seitenaufruf zeigen.
    }

    const timer = setTimeout(() => setShowTeaser(true), TEASER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const dismissTeaser = useCallback(() => {
    setShowTeaser(false);
    try {
      sessionStorage.setItem(TEASER_DISMISSED_KEY, "1");
    } catch {
      // Privater Modus o. Ä. – dann erscheint der Teaser eben erneut.
    }
  }, []);

  // Escape schließt das Panel und gibt den Fokus zurück an die Blase.
  useEffect(() => {
    if (!isOpen) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        launcherRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  /**
   * Öffnet immer mit der Auswahl "Schreiben oder Sprechen", nie direkt in
   * einem Modus. Sonst landete, wer zuletzt gesprochen hat, beim nächsten
   * Öffnen gleich wieder im Sprachmodus – und der verbindet sich von
   * selbst, würde also ungefragt Credits verbrauchen.
   */
  function openWidget() {
    dismissTeaser();
    showMenu();
    setIsOpen(true);
  }

  function showMenu() {
    setView("menu");
    // Der Status stammt sonst noch aus dem verlassenen Modus, etwa
    // "zurzeit nicht erreichbar" nach dem Beenden des Sprachmodus.
    setWilmaState("online");
  }

  function startChat() {
    setChatStarted(true);
    setView("chat");
  }

  return (
    // text-left explizit: Das Widget soll auch auf zentriert gesetzten
    // Seiten gleich aussehen, es erbt sonst deren Textausrichtung.
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 text-left sm:bottom-6 sm:right-6">
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Chat mit Wilma"
          className="flex h-[min(34rem,calc(100dvh-6rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#1F3B5C] bg-[#0E1F37] shadow-2xl shadow-black/50"
        >
          <div className="h-1 w-full shrink-0 bg-[#22D3EE]" />

          <header className="flex items-center gap-3 border-b border-[#1F3B5C] px-4 py-3">
            {view !== "menu" && (
              <button
                type="button"
                onClick={showMenu}
                aria-label="Zurück zur Auswahl"
                className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-[#16294a] hover:text-white"
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
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
            )}

            <WilmaAvatar state={wilmaState} size="sm" showStatus preload />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">Wilma</p>
              <p
                aria-live="polite"
                className="truncate text-[11px] text-[#94A3B8]"
              >
                {STATUS_TEXT[wilmaState]}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Chat schließen"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:bg-[#16294a] hover:text-white"
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
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          {view === "menu" && (
            <ModeMenu
              voiceEnabled={voiceEnabled}
              onChat={startChat}
              onVoice={() => setView("voice")}
            />
          )}

          {/* Versteckt statt ausgehängt: der Verlauf überlebt den Moduswechsel. */}
          {chatStarted && (
            <div className="min-h-0 flex-1" hidden={view !== "chat"}>
              <ChatWindow embedded onStateChange={setWilmaState} />
            </div>
          )}

          {view === "voice" && (
            <VoicePanel
              chromaKey={chromaKey}
              onStateChange={setWilmaState}
              onSwitchToChat={startChat}
            />
          )}
        </div>
      )}

      {!isOpen && showTeaser && (
        <div className="wilma-teaser flex items-end gap-2">
          {/* Führt – wie der Launcher – immer erst zur Auswahl zwischen
              Schreiben und Sprechen, nie direkt in einen Modus. */}
          <button
            type="button"
            onClick={openWidget}
            className="max-w-[16.5rem] rounded-2xl rounded-br-sm border border-[#22D3EE]/40 bg-[#132a4a] px-4 py-3 text-left shadow-xl shadow-black/40 transition hover:-translate-y-0.5 hover:border-[#22D3EE]"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
              Hi, ich bin Wilma
              <span aria-hidden className="wilma-teaser__wave inline-block">
                👋
              </span>
            </span>
            <span className="mt-1 block text-[13px] leading-snug text-[#CBD5E1]">
              Wie kann ich dir heute weiterhelfen? Ich beantworte deine Fragen –
              im Chat oder per Sprache.
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#22D3EE]">
              Jetzt fragen
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </span>
          </button>
          <button
            type="button"
            onClick={dismissTeaser}
            aria-label="Hinweis ausblenden"
            className="mb-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#1F3B5C] bg-[#0E1F37] text-[#94A3B8] transition-colors hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openWidget())}
        aria-expanded={isOpen}
        aria-label={
          isOpen ? "Chat mit Wilma schließen" : "Chat mit Wilma öffnen"
        }
        className="flex h-16 w-16 items-center justify-center rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1F37]"
      >
        {isOpen ? (
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-[#1F3B5C] bg-[#132a4a] text-white shadow-xl shadow-black/40">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        ) : (
          <WilmaAvatar state="online" size="xl" showStatus preload />
        )}
      </button>
    </div>
  );
}

interface ModeMenuProps {
  voiceEnabled: boolean;
  onChat: () => void;
  onVoice: () => void;
}

/**
 * Einstiegsauswahl. Schreiben steht bewusst oben und ohne Einschränkung –
 * es ist der Normalfall; Sprechen ist der bewusste Zusatzschritt.
 */
function ModeMenu({ voiceEnabled, onChat, onVoice }: ModeMenuProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-5">
      <p className="text-sm text-[#CBD5E1]">
        Guten Tag! Ich bin Wilma, die digitale Büroassistentin von Future AI
        Solutions. Wie möchten Sie mit mir sprechen?
      </p>

      <button
        type="button"
        onClick={onChat}
        className="flex items-start gap-3 rounded-xl border border-[#1F3B5C] bg-[#132a4a] p-4 text-left transition-colors hover:border-[#22D3EE]"
      >
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#22D3EE] text-[#0E1F37]">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">
            Schreiben
          </span>
          <span className="mt-0.5 block text-xs text-[#94A3B8]">
            Ganz normal tippen – oder das Mikrofon zum Diktieren nutzen.
          </span>
        </span>
      </button>

      {voiceEnabled && (
        <button
          type="button"
          onClick={onVoice}
          className="flex items-start gap-3 rounded-xl border border-[#1F3B5C] bg-[#132a4a] p-4 text-left transition-colors hover:border-[#22D3EE]"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#67E8F9] text-[#0E1F37]">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 8-6 4 6 4V8Z" />
              <rect x="2" y="6" width="14" height="12" rx="2" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">
              Sprechen
            </span>
            <span className="mt-0.5 block text-xs text-[#94A3B8]">
              Wilma antwortet Ihnen live per Video.
            </span>
          </span>
        </button>
      )}

      <p className="mt-auto pt-2 text-[11px] leading-relaxed text-[#64748B]">
        Sie sprechen mit einer KI.
      </p>
    </div>
  );
}
