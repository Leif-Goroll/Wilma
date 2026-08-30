import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wilson – KI-Büroassistent | Future AI Solutions",
  description:
    "Wilson ist der digitale Büroassistent von Future AI Solutions und beantwortet Ihre Fragen im Website-Chat.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const calendlyEnabled = Boolean(process.env.NEXT_PUBLIC_CALENDLY_URL);

  return (
    <html lang="de" className={`${inter.variable} h-full`}>
      <head>
        {calendlyEnabled && (
          <link
            rel="stylesheet"
            href="https://assets.calendly.com/assets/external/widget.css"
          />
        )}
      </head>
      <body className="flex min-h-full flex-col bg-[#0E1F37] font-sans text-white antialiased">
        {children}
        {calendlyEnabled && (
          <Script
            src="https://assets.calendly.com/assets/external/widget.js"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
