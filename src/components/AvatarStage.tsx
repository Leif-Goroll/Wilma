"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Zeigt den LiveAvatar-Stream ohne Greenscreen.
 *
 * LiveAvatar liefert den Avatar auf grünem Hintergrund und bietet keinen
 * API-Parameter, um das abzustellen – das Ausstanzen passiert im Browser.
 * Das <video> läuft deshalb unsichtbar weiter (der Stream braucht ein
 * echtes Medienelement), gezeichnet wird auf ein <canvas>, in dem grüne
 * Pixel durchsichtig werden.
 *
 * Gerechnet wird in Anzeigegröße, nicht in den 720×1280 des Streams: Pro
 * Bild sind das rund ein Sechstel der Pixel, und mehr als die angezeigte
 * Auflösung sieht ohnehin niemand.
 */

interface AvatarStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Solange false, wird nicht gezeichnet (spart Rechenzeit im Leerlauf). */
  active: boolean;
  className?: string;
}

/** Ab welcher Grün-Dominanz ein Pixel als Hintergrund gilt. */
const KEY_STRENGTH = 1.35;
/** Darunter bleibt das Pixel voll sichtbar – verhindert harte Kanten. */
const SOFT_EDGE = 1.15;

export default function AvatarStage({
  videoRef,
  active,
  className = "",
}: AvatarStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;

    let frame = 0;
    let stopped = false;

    // Bewusst kein Zwischenspeichern von Canvas und Video: Beim Start der
    // Sitzung ist nicht garantiert, in welcher Reihenfolge die Elemente
    // bereitstehen. Würde hier einmalig abgebrochen, liefe die Schleife nie
    // wieder an – deshalb wird pro Bild neu nachgesehen.
    function draw() {
      if (stopped) return;
      frame = requestAnimationFrame(draw);

      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      // Canvas an die Anzeigegröße angleichen – vor jeder Prüfung des
      // Videos, sonst bliebe es bei den 300×150 des HTML-Standards.
      const targetWidth = canvas.clientWidth;
      const targetHeight = canvas.clientHeight;
      if (!targetWidth || !targetHeight) return;
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      if (video.readyState < 2 || !video.videoWidth) return;

      // "cover": Stream so skalieren, dass er die Fläche ausfüllt.
      const scale = Math.max(
        targetWidth / video.videoWidth,
        targetHeight / video.videoHeight
      );
      const drawWidth = video.videoWidth * scale;
      const drawHeight = video.videoHeight * scale;

      context.clearRect(0, 0, targetWidth, targetHeight);
      context.drawImage(
        video,
        (targetWidth - drawWidth) / 2,
        // Leicht nach oben: Der Kopf ist wichtiger als die Schultern.
        (targetHeight - drawHeight) * 0.25,
        drawWidth,
        drawHeight
      );

      const image = context.getImageData(0, 0, targetWidth, targetHeight);
      const data = image.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const rival = Math.max(r, b);

        if (rival === 0) {
          if (g > 40) data[i + 3] = 0;
          continue;
        }

        const dominance = g / rival;
        if (dominance >= KEY_STRENGTH) {
          data[i + 3] = 0;
        } else if (dominance > SOFT_EDGE) {
          // Randzone weich ausblenden, sonst entsteht ein harter Saum.
          const t = (dominance - SOFT_EDGE) / (KEY_STRENGTH - SOFT_EDGE);
          data[i + 3] = Math.round(data[i + 3] * (1 - t));
          // Grünstich auf der Haut abmildern.
          data[i + 1] = Math.round(g - (g - rival) * t);
        }
      }

      context.putImageData(image, 0, 0);
    }

    frame = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [active, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`h-full w-full ${className}`}
    />
  );
}
