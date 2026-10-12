"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AudioPanel from "@/components/AudioPanel";
import ChatWindow from "@/components/ChatWindow";
import VoicePanel from "@/components/VoicePanel";
import WilmaAvatar, { type WilmaAvatarState } from "@/components/WilmaAvatar";
import { useSpeechInputSupported } from "@/hooks/useDictation";
import { track, trackSessionEnd } from "@/lib/analytics/track";
import { unlockSpeech } from "@/lib/speechPlayback";

/**
 * Schwebendes Wilma-Widget unten rechts.
 *
 * Ablauf: geschlossene Blase → Start-Bildschirm „Wie möchten Sie
 * sprechen?“ mit drei Wegen → das gewählte Gespräch:
 *
 *   Avatar-Anruf  Bild und Stimme über LiveAvatar (kostet Credits je Minute)
 *   Nur Stimme    Sprechen und Hören, Wilma als Standbild (nur Vertonung)
 *   Chat          Text, lautlos, geht immer
 *
 * Der Start-Bildschirm bleibt ein eigener Schritt: Ein Klick auf die Blase
 * darf nie schon eine kostenpflichtige Verbindung auslösen. Angeboten wird
 * nur, was hier auch funktioniert – ohne Spracherkennung oder bei gesperrtem
 * Mikrofon bleibt der Chat.
 */

type WidgetView = "start" | "voice" | "audio" | "chat";

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
  /**
   * Nur wenn serverseitig eine Sprachausgabe eingerichtet ist, gibt es
   * „Nur Stimme“ – ohne Vertonung bliebe Wilma darin stumm.
   */
  audioEnabled: boolean;
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
  audioEnabled,
  chromaKey,
  embedded = false,
  containerRef,
  onOpenChange,
}: WilmaWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<WidgetView>("start");
  // Der Chat bleibt nach dem ersten Öffnen montiert (nur versteckt), damit
  // der Verlauf einen Abstecher zur Auswahl überlebt.
  const [chatStarted, setChatStarted] = useState(false);
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

  function startMode(mode: Exclude<WidgetView, "start">) {
    // Im Klick des Besuchers: Erst danach geben Browser Ton frei – sonst
    // bliebe Wilmas Begrüßung in „Nur Stimme“ stumm.
    if (mode === "audio") unlockSpeech();
    if (mode === "chat") setChatStarted(true);
    setView(mode);
    track("mode", { mode });
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
            <StartScreen
              voiceEnabled={voiceEnabled}
              audioEnabled={audioEnabled}
              onStart={startMode}
            />
          )}

          {view === "voice" && (
            <VoicePanel
              chromaKey={chromaKey}
              onStateChange={setWilmaState}
              onBack={showStart}
            />
          )}

          {view === "audio" && (
            <AudioPanel onStateChange={setWilmaState} onBack={showStart} />
          )}

          {chatStarted && (
            <div className="min-h-0 flex-1" hidden={view !== "chat"}>
              <ChatWindow embedded onStateChange={setWilmaState} />
            </div>
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

type GesprächsArt = Exclude<WidgetView, "start">;

interface StartScreenProps {
  /** LiveAvatar ist serverseitig eingerichtet. */
  voiceEnabled: boolean;
  /** Sprachausgabe ist serverseitig eingerichtet. */
  audioEnabled: boolean;
  onStart: (mode: GesprächsArt) => void;
}

interface Option {
  mode: GesprächsArt;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  /** Gesetzt, wenn die Option hier nicht geht – der Grund steht dann da. */
  unavailable?: string;
}

const ICON_PROPS = {
  viewBox: "0 0 24 24",
  className: "h-5 w-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * Start-Bildschirm: „Wie möchten Sie sprechen?“ – Avatar-Anruf, nur Stimme
 * oder Chat, darunter „Los geht's“. Erst dieser Knopf startet das Gespräch;
 * die Auswahl allein kostet nichts.
 */
function StartScreen({ voiceEnabled, audioEnabled, onStart }: StartScreenProps) {
  const canSpeak = useSpeechInputSupported();
  const speakHint = "Sprechen geht in Chrome oder Edge";

  const options: Option[] = [
    ...(voiceEnabled
      ? [
          {
            mode: "voice" as const,
            title: "Avatar-Anruf",
            subtitle: "Bild und Stimme",
            unavailable: canSpeak ? undefined : speakHint,
            icon: (
              <svg {...ICON_PROPS}>
                <rect x="4" y="3" width="16" height="18" rx="3" />
                <circle cx="12" cy="10" r="3" />
                <path d="M7.5 18a5 5 0 0 1 9 0" />
              </svg>
            ),
          },
        ]
      : []),
    ...(audioEnabled
      ? [
          {
            mode: "audio" as const,
            title: "Nur Stimme",
            subtitle: "Sprechen, kein Bild",
            unavailable: canSpeak ? undefined : speakHint,
            icon: (
              <svg {...ICON_PROPS}>
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
                <path d="M19 11a7 7 0 0 1-14 0" />
                <path d="M12 18v3" />
              </svg>
            ),
          },
        ]
      : []),
    {
      mode: "chat",
      title: "Chat",
      subtitle: "Nur Text, lautlos",
      icon: (
        <svg {...ICON_PROPS}>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
      ),
    },
  ];

  const firstAvailable =
    options.find((option) => !option.unavailable)?.mode ?? "chat";
  // Vorauswahl folgt dem, was gerade möglich ist (die Spracherkennung steht
  // erst nach dem ersten Rendern fest) – bis der Besucher selbst wählt.
  const [picked, setPicked] = useState<GesprächsArt | null>(null);
  const selected =
    picked && options.some((o) => o.mode === picked && !o.unavailable)
      ? picked
      : firstAvailable;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 py-5">
      <h2 id="wilma-mode-heading" className="text-[15px] font-bold text-white">
        Wie möchten Sie sprechen?
      </h2>

      <div
        role="radiogroup"
        aria-labelledby="wilma-mode-heading"
        className="no-scrollbar mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
      >
        {options.map((option) => {
          const isSelected = option.mode === selected;
          const disabled = Boolean(option.unavailable);
          return (
            <button
              key={option.mode}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => setPicked(option.mode)}
              className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "border-[#22D3EE] bg-[#13294a]"
                  : "border-transparent bg-[#132440] hover:bg-[#16294a]"
              }`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#0E1F37] text-[#67E8F9]">
                {option.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">
                  {option.title}
                </span>
                <span className="block text-xs text-[#94A3B8]">
                  {option.unavailable ?? option.subtitle}
                </span>
              </span>
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  isSelected ? "border-[#22D3EE]" : "border-[#22D3EE]/70"
                }`}
              >
                {isSelected && (
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22D3EE]" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => onStart(selected)}
        className="mt-4 flex h-12 w-full shrink-0 items-center justify-center rounded-xl bg-[#22D3EE] text-sm font-semibold text-[#0E1F37] transition-opacity hover:opacity-90"
      >
        Los geht&apos;s
      </button>

      <p className="pt-3 text-center text-[11px] text-[#64748B]">
        Sie sprechen mit einer KI.
      </p>
    </div>
  );
}
