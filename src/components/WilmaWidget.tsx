"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import VoicePanel from "@/components/VoicePanel";
import WilmaAvatar, { type WilmaAvatarState } from "@/components/WilmaAvatar";
import { track, trackSessionEnd } from "@/lib/analytics/track";

/**
 * Schwebendes Wilma-Widget unten rechts.
 *
 * Ablauf: geschlossene Blase → Start-Bildschirm mit einem einzigen Knopf
 * ("Gespräch starten") → Sprachmodus. Der Zwischenschritt bleibt bewusst
 * bestehen, obwohl es nur noch einen Weg gibt: Sprechen verbraucht
 * LiveAvatar-Credits pro Minute, ein Klick auf die Blase selbst darf also
 * nicht schon die Verbindung auslösen.
 */

type WidgetView = "start" | "voice";

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
  /**
   * Im iframe (Einbettung auf einer fremden Seite) hängt das Widget an
   * seiner Bühne statt am Ansichtsfenster – nur so lässt sich seine
   * natürliche Größe messen, bevor das iframe darauf zugeschnitten wird.
   * Die Abstände bleiben dabei konstant bei 16 px, damit das Lade-Skript
   * nicht raten muss.
   */
  embedded?: boolean;
  /** Zum Ausmessen des Widgets von außen. */
  containerRef?: React.Ref<HTMLDivElement>;
  /** Meldet, ob das Panel offen ist – die Einbettung richtet sich danach. */
  onOpenChange?: (open: boolean) => void;
}

export default function WilmaWidget({
  voiceEnabled,
  chromaKey,
  embedded = false,
  containerRef,
  onOpenChange,
}: WilmaWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<WidgetView>("start");
  const [showTeaser, setShowTeaser] = useState(false);
  const [wilmaState, setWilmaState] = useState<WilmaAvatarState>("online");
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(TEASER_DISMISSED_KEY)) return;
    } catch {
      // Speicher gesperrt (privater Modus, strenge Einstellungen) – dann
      // eben bei jedem Seitenaufruf zeigen.
    }

    const timer = setTimeout(() => {
      setShowTeaser(true);
      track("teaser");
    }, TEASER_DELAY_MS);
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

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Fürs Dashboard: einmal je Besuch zählen, dass Wilma zu sehen war, und
  // beim Verlassen die Gesamtdauer nachmelden. `pagehide` statt `unload` –
  // nur das greift zuverlässig, wenn der Browser die Seite in seinen
  // Zwischenspeicher legt (Zurück-Knopf).
  useEffect(() => {
    track("impression");
    window.addEventListener("pagehide", trackSessionEnd);
    return () => window.removeEventListener("pagehide", trackSessionEnd);
  }, []);

  // Der erste Durchlauf ist der geschlossene Ausgangszustand, kein Schließen.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen) track("open");
    else if (wasOpen.current) track("close");
    wasOpen.current = isOpen;
  }, [isOpen]);

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
   * Öffnet immer mit dem Start-Bildschirm, nie direkt im Sprachmodus. Der
   * verbindet sich von selbst, sobald er montiert wird – würde also beim
   * Öffnen ungefragt Credits verbrauchen, ohne diesen bewussten
   * Zwischenschritt.
   */
  function openWidget() {
    dismissTeaser();
    showStart();
    setIsOpen(true);
  }

  function showStart() {
    setView("start");
    // Der Status stammt sonst noch aus dem verlassenen Sprachmodus, etwa
    // "zurzeit nicht erreichbar" nach dem Beenden des Gesprächs.
    setWilmaState("online");
  }

  function startVoice() {
    setView("voice");
    track("mode", { mode: "voice" });
  }

  return (
    // text-left explizit: Das Widget soll auch auf zentriert gesetzten
    // Seiten gleich aussehen, es erbt sonst deren Textausrichtung.
    <div
      ref={containerRef}
      // Etwas höher als vorher (bottom-4/6 → bottom-8/10): Der Abstand zum
      // unteren Rand hat sich vergrößert, seitlich bleibt es unverändert.
      className={`${
        embedded
          ? "absolute bottom-8 right-4"
          : "fixed bottom-8 right-4 sm:bottom-10 sm:right-6"
      } z-50 flex flex-col items-end gap-3 text-left`}
    >
      {isOpen && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Gespräch mit Wilma"
          className="flex h-[min(34rem,calc(100dvh-9rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-[#1F3B5C] bg-[#0E1F37] shadow-2xl shadow-black/50"
        >
          <div className="h-1 w-full shrink-0 bg-[#22D3EE]" />

          <header className="flex items-center gap-3 border-b border-[#1F3B5C] px-4 py-3">
            {view !== "start" && (
              <button
                type="button"
                onClick={showStart}
                aria-label="Zurück"
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
              aria-label="Gespräch schließen"
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

          {view === "start" && (
            <StartScreen voiceEnabled={voiceEnabled} onStart={startVoice} />
          )}

          {view === "voice" && (
            <VoicePanel
              chromaKey={chromaKey}
              onStateChange={setWilmaState}
              onBack={showStart}
            />
          )}
        </div>
      )}

      {!isOpen && showTeaser && (
        <div className="wilma-teaser flex items-end gap-2">
          {/* Führt – wie der Launcher – immer erst zum Start-Bildschirm,
              nie direkt in den Sprachmodus. */}
          <button
            type="button"
            onClick={openWidget}
            className="max-w-[16.5rem] rounded-2xl rounded-br-sm border border-[#22D3EE]/40 bg-[#132a4a] px-4 py-3 text-left shadow-xl shadow-black/40 transition hover:-translate-y-0.5 hover:border-[#22D3EE]"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
              Hallo, ich bin Wilma
              <span aria-hidden className="wilma-teaser__wave inline-block">
                👋
              </span>
            </span>
            <span className="mt-1 block text-[13px] leading-snug text-[#CBD5E1]">
              Wie kann ich Ihnen heute weiterhelfen?
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
          isOpen ? "Gespräch mit Wilma schließen" : "Gespräch mit Wilma öffnen"
        }
        // Genau so groß wie der Avatar darin, responsiv: 9,8rem auf dem
        // Handy (30 % kleiner als die 14rem-Basis), 16,8rem auf dem Desktop
        // (20 % größer) – das offene Chatfenster mit seinem Schließen-Knopf
        // bleibt davon unberührt.
        //
        // Schaltfläche und Bildfläche sind immer exakt gleich groß: Sonst
        // ragt Wilma über den klickbaren Bereich hinaus, klebt randlos in
        // der Bildschirmecke – und in der Einbettung wird sie an der
        // iframe-Kante abgeschnitten.
        className={`flex items-center justify-center transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22D3EE] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1F37] ${
          isOpen
            ? "h-28 w-28 rounded-full"
            : "h-[9.8rem] w-[9.8rem] sm:h-[16.8rem] sm:w-[16.8rem]"
        }`}
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
          <WilmaAvatar state="online" size="2xl" showStatus preload />
        )}
      </button>
    </div>
  );
}

interface StartScreenProps {
  /**
   * Nur gesetzt, wenn serverseitig ein LiveAvatar-Key und eine Avatar-ID
   * hinterlegt sind. Ohne das gibt es nichts, das der Knopf starten könnte.
   */
  voiceEnabled: boolean;
  onStart: () => void;
}

/**
 * Start-Bildschirm: ein einziger Knopf, der das Gespräch samt
 * Verbindungsaufbau auslöst. Bewusst ein eigener Schritt statt eines
 * Direktstarts beim Öffnen – Sprechen kostet LiveAvatar-Credits pro
 * Minute, das soll nie ungefragt passieren.
 */
function StartScreen({ voiceEnabled, onStart }: StartScreenProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-5 text-center">
      <WilmaAvatar state="online" size="lg" />

      {voiceEnabled ? (
        <>
          <p className="text-sm text-[#CBD5E1]">
            Guten Tag! Ich bin Wilma, die digitale Büroassistentin von
            Future AI Solutions. Starten Sie das Gespräch, sobald Sie
            bereit sind.
          </p>

          <button
            type="button"
            onClick={onStart}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22D3EE] px-4 py-3 text-sm font-semibold text-[#0E1F37] transition-opacity hover:opacity-90"
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
              <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
              <path d="M19 11a7 7 0 0 1-14 0" />
              <path d="M12 18v3" />
            </svg>
            Gespräch starten
          </button>

          <p className="pt-2 text-[11px] leading-relaxed text-[#64748B]">
            Sie sprechen mit einer KI.
          </p>
        </>
      ) : (
        // Ohne LiveAvatar-Zugangsdaten gibt es nichts, das der Knopf
        // starten könnte – lieber das offen zeigen als einen Knopf
        // anzubieten, der beim Klick nur ins Leere liefe.
        <p className="text-sm text-[#94A3B8]">
          Wilma ist im Moment nicht erreichbar. Bitte versuchen Sie es
          später erneut.
        </p>
      )}
    </div>
  );
}
