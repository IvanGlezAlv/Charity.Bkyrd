import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import { env } from "@/lib/env";
import "./globals.css";

const display = Instrument_Serif({ variable: "--font-instrument-serif", weight: "400", subsets: ["latin"], style: ["normal", "italic"] });
const sans = IBM_Plex_Sans({ variable: "--font-plex-sans", weight: ["400", "500", "700"], subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", weight: ["400", "500", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: "La Charity Bkyrd Ultra", template: "%s · La Charity Bkyrd Ultra" },
  description: "Last man standing. Información, recorrido, manual del corredor y resultados en vivo.",
  openGraph: { images: ["/brand/poster-vol-ii.webp"] },
  icons: { icon: "/brand/jackalope.webp" },
};

export const viewport: Viewport = {
  themeColor: "#121110",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
