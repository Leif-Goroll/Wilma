import type { Metadata } from "next";
import EmbedFrame from "@/components/EmbedFrame";

/**
 * Wilma zum Einbetten auf einer fremden Seite (z. B. WordPress).
 *
 * Diese Seite zeigt nur das Widget, ohne Umgebung und mit durchsichtigem
 * Hintergrund – sie wird über `public/widget.js` in ein iframe geladen,
 * das genau auf das Widget zugeschnitten wird.
 */

export const metadata: Metadata = {
  title: "Wilma",
  // Die Einbettungsseite gehört nicht in die Suche: Sie hat keinen Inhalt
  // außer dem Widget und stünde sonst in Konkurrenz zur eigentlichen Seite.
  robots: { index: false, follow: false },
};

export default function EmbedPage() {
  const voiceEnabled = Boolean(
    process.env.HEYGEN_API_KEY && process.env.LIVEAVATAR_AVATAR_ID,
  );
  const chromaKey = process.env.LIVEAVATAR_CHROMA_KEY === "true";

  return (
    <>
      {/* Der Gastgeberseite soll nichts außer dem Widget im Weg stehen –
          kein Hintergrund, keine Rollbalken. */}
      <style>{`
        html, body { background: transparent !important; overflow: hidden; }
      `}</style>

      <div className="wilma-embed-stage">
        <EmbedFrame voiceEnabled={voiceEnabled} chromaKey={chromaKey} />
      </div>
    </>
  );
}
