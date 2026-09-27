import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import "./site.css";
import "./app-shell.css";
import "./buyer.css";

const display = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});
const body = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  // Next has no metric overrides for this family yet, so name the fallback explicitly.
  adjustFontFallback: false,
  fallback: ["Verdana", "sans-serif"]
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: { default: "Latchkey", template: "%s | Latchkey" },
  description:
    "Sell code through the payment company you already use. Latchkey gives buyers GitHub access, keeps it working, and ends it when it should."
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1214" }
  ]
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
