"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WilmaWidget from "@/components/WilmaWidget";
import {
  EMBED_EDGE_BOTTOM_PX,
  EMBED_EDGE_RIGHT_PX,
  EMBED_SHADOW_PX,
  postFrameState,
} from "@/lib/embedFrame";

/**
 * Das Widget, wie es im iframe auf einer fremden Seite läuft.
 *
 * Aufgabe dieser Schicht: dem Lade-Skript sagen, wie groß das iframe sein
 * muss. Solange nur Blase und Sprechblase zu sehen sind, wird exakt
 * gemessen – die Fläche daneben bleibt dann klickbar. Ist das Panel offen,
 * entscheidet das Lade-Skript, denn nur es kennt das Fenster der
 * Gastgeberseite.
 */

interface EmbedFrameProps {
  voiceEnabled: boolean;
  chromaKey: boolean;
}

export default function EmbedFrame({
  voiceEnabled,
  chromaKey,
}: EmbedFrameProps) {
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      postFrameState("open");
    }
  }, [isOpen]);

  const measure = useCallback(() => {
    const node = widgetRef.current;
    if (!node) return;

    // Das Widget hängt an der Bühne (`absolute`), nicht am iframe. Es
    // bemisst sich deshalb nach seinem natürlichen Inhalt und nicht nach
    // dem womöglich winzigen iframe – sonst könnte die Sprechblase nie
    // wachsen, weil das iframe erst wächst, wenn sie gemessen wurde.
    const rect = node.getBoundingClientRect();
    postFrameState("collapsed", {
      width: Math.ceil(rect.width) + EMBED_EDGE_RIGHT_PX + EMBED_SHADOW_PX,
      height: Math.ceil(rect.height) + EMBED_EDGE_BOTTOM_PX + EMBED_SHADOW_PX,
    });
  }, []);

  useEffect(() => {
    if (isOpen) return;

    const node = widgetRef.current;
    if (!node) return;

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();

    return () => observer.disconnect();
  }, [isOpen, measure]);

  return (
    <WilmaWidget
      embedded
      containerRef={widgetRef}
      onOpenChange={setIsOpen}
      voiceEnabled={voiceEnabled}
      chromaKey={chromaKey}
    />
  );
}
