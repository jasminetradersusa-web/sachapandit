/**
 * Root layout
 *
 * Security architecture:
 * - No secrets here; global HTML shell only.
 * - Auth/session cookies are HttpOnly and managed by Supabase SSR helpers.
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, Source_Sans_3 } from "next/font/google";
import { AmbientSound } from "@/components/ambient-sound";
import "./globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sacred Voice — AI storytelling & reflection",
  description:
    "Voice-based AI storytelling and reflection. Outputs are clearly labeled AI-generated creative content—not spiritual or predictive authority.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body
        className={`${sans.className} min-h-screen font-sans motion-safe:scroll-smooth`}
      >
        <div className="mystic-backdrop" aria-hidden>
          <div className="mystic-backdrop__gradient" />
          <div className="mystic-backdrop__glow" />
          <div className="mystic-backdrop__veil" />
        </div>
        <div className="relative z-10 min-h-screen flex flex-col">
          {children}
          <AmbientSound />
        </div>
      </body>
    </html>
  );
}
