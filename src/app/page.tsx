import WilmaWidget from "@/components/WilmaWidget";

export default function Home() {
  // Der Sprachmodus erscheint nur, wenn er serverseitig wirklich eingerichtet
  // ist. So taucht kein Knopf auf, der beim Klick ins Leere läuft.
  const voiceEnabled = Boolean(
    process.env.HEYGEN_API_KEY && process.env.LIVEAVATAR_AVATAR_ID
  );

  // Preset-Avatare mit echtem Hintergrund brauchen kein Ausstanzen. Nur
  // Avatare, die auf Greenscreen gerendert werden (z. B. eigene), schalten
  // den Freisteller ein – er kostet Rechenzeit in jedem einzelnen Bild.
  const chromaKey = process.env.LIVEAVATAR_CHROMA_KEY === "true";

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#67E8F9]">
        Future AI Solutions
      </p>
      <h1 className="mt-3 max-w-2xl text-3xl font-bold text-white sm:text-5xl">
        Wilma, die digitale Büroassistentin
      </h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[#94A3B8]">
        Wilma beantwortet Fragen, qualifiziert Anfragen und bucht Termine –
        rund um die Uhr. Öffnen Sie das Fenster unten rechts, um sie
        auszuprobieren.
      </p>

      <WilmaWidget voiceEnabled={voiceEnabled} chromaKey={chromaKey} />
    </main>
  );
}
