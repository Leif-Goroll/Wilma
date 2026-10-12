import type { NextConfig } from "next";

/**
 * Wer darf Wilma einbetten? Kommagetrennte Liste von Herkünften, z. B.
 * `https://ihre-firma.de,https://www.ihre-firma.de`. Leer bedeutet: jede
 * Seite. Zum Ausprobieren in Ordnung, auf Dauer nicht – sonst kann ein
 * Fremder das Widget auf seiner Seite einbauen und dabei Ihre
 * LiveAvatar-Credits verbrauchen.
 */
const allowedOrigins = (process.env.WILMA_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const frameAncestors = allowedOrigins.length ? allowedOrigins.join(" ") : "*";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Ohne diesen Header verweigern Browser die Einbettung fremder
        // Seiten, sobald eine Sicherheitsrichtlinie im Spiel ist.
        source: "/embed",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors};`,
          },
        ],
      },
      {
        // Kurz zwischenspeichern: So ist eine neue Fassung des Widgets
        // spätestens nach fünf Minuten überall draußen, ohne dass jemand
        // in WordPress etwas ändern muss.
        source: "/widget.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
