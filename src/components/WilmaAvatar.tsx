"use client";

import Image from "next/image";
import { useState } from "react";
import type { CSSProperties } from "react";

/**
 * Zustände, die Wilma im Chat annehmen kann. Sie steuern Ring-, Aura- und
 * Statuspunktfarbe und geben dem Avatar damit einen "lebendigen" Ausdruck.
 */
export type WilmaAvatarState =
  | "online"
  | "thinking"
  | "listening"
  | "speaking"
  | "offline";

export type WilmaAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<
  WilmaAvatarSize,
  {
    box: string;
    px: number;
    dot: string;
    dotOffset: string;
    /** Schriftgröße des "W"-Fallbacks, falls das Bild nicht lädt. */
    initial: string;
  }
> = {
  xs: {
    box: "h-8 w-8",
    px: 32,
    dot: "h-2 w-2",
    dotOffset: "bottom-0 right-0",
    initial: "text-[11px]",
  },
  sm: {
    box: "h-10 w-10",
    px: 40,
    dot: "h-2.5 w-2.5",
    dotOffset: "bottom-0 right-0",
    initial: "text-sm",
  },
  md: {
    box: "h-14 w-14",
    px: 56,
    dot: "h-3 w-3",
    dotOffset: "bottom-0 right-0",
    initial: "text-lg",
  },
  lg: {
    box: "h-20 w-20",
    px: 80,
    dot: "h-3.5 w-3.5",
    dotOffset: "bottom-0.5 right-0.5",
    initial: "text-2xl",
  },
  xl: {
    box: "h-28 w-28",
    px: 112,
    dot: "h-4 w-4",
    dotOffset: "bottom-1 right-1",
    initial: "text-3xl",
  },
};

const STATES: Record<
  WilmaAvatarState,
  { accent: string; dot: string; label: string; pulse: boolean; halo: boolean }
> = {
  online: {
    accent: "#22D3EE",
    dot: "#4ADE80",
    label: "Wilma ist online",
    pulse: false,
    halo: false,
  },
  thinking: {
    accent: "#22D3EE",
    dot: "#22D3EE",
    label: "Wilma denkt nach",
    pulse: false,
    halo: true,
  },
  listening: {
    accent: "#FACC15",
    dot: "#FACC15",
    label: "Wilma hört zu",
    pulse: true,
    halo: false,
  },
  speaking: {
    accent: "#67E8F9",
    dot: "#67E8F9",
    label: "Wilma antwortet",
    pulse: true,
    halo: false,
  },
  offline: {
    accent: "#1F3B5C",
    dot: "#64748B",
    label: "Wilma ist offline",
    pulse: false,
    halo: false,
  },
};

interface WilmaAvatarProps {
  /** Aktueller Gemütszustand – steuert Ring, Aura und Statuspunkt. */
  state?: WilmaAvatarState;
  size?: WilmaAvatarSize;
  /** Statuspunkt unten rechts (im Header sinnvoll, an Chat-Blasen nicht). */
  showStatus?: boolean;
  /** Ruhiges "Atmen" – gibt dem Avatar auch im Leerlauf Leben. */
  breathing?: boolean;
  /** Bild sofort laden statt lazy (für den Avatar im Header). */
  preload?: boolean;
  className?: string;
}

export default function WilmaAvatar({
  state = "online",
  size = "md",
  showStatus = false,
  breathing = true,
  preload = false,
  className = "",
}: WilmaAvatarProps) {
  const [failed, setFailed] = useState(false);
  const { box, px, dot, dotOffset, initial } = SIZES[size];
  const config = STATES[state];

  return (
    <span
      className={`wilma-avatar relative inline-flex shrink-0 ${box} ${className}`}
      style={{ "--wilma-accent": config.accent } as CSSProperties}
      // Nur der Status-Avatar (Header) ist für Screenreader relevant; die
      // kleinen Avatare an den Chat-Blasen sind reine Dekoration.
      role={showStatus ? "img" : undefined}
      aria-label={showStatus ? config.label : undefined}
      aria-hidden={showStatus ? undefined : true}
      data-state={state}
    >
      {config.pulse && (
        <span
          aria-hidden
          className="wilma-avatar__pulse absolute inset-0 rounded-full"
        />
      )}
      {config.halo && (
        <span
          aria-hidden
          className="wilma-avatar__halo absolute -inset-[3px] rounded-full"
        />
      )}

      <span
        className={`relative z-10 h-full w-full overflow-hidden rounded-full border bg-[#0B1830] ${
          breathing ? "wilma-avatar__frame" : ""
        }`}
        style={{ borderColor: config.accent }}
      >
        {failed ? (
          <span
            className={`flex h-full w-full items-center justify-center font-semibold text-[#67E8F9] ${initial}`}
          >
            W
          </span>
        ) : (
          <Image
            src="/Wilma-Avatar.png"
            alt=""
            fill
            sizes={`${px}px`}
            preload={preload}
            onError={() => setFailed(true)}
            /* Leichter Zoom auf das Gesicht, damit Wilma auch als 32px-Avatar
               erkennbar bleibt. */
            className="scale-[1.14] object-cover translate-y-[5%]"
          />
        )}
      </span>

      {showStatus && (
        <span
          aria-hidden
          className={`absolute z-20 rounded-full ring-2 ring-[#0E1F37] ${dot} ${dotOffset}`}
          style={{ backgroundColor: config.dot }}
        />
      )}
    </span>
  );
}
