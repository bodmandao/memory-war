import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Bricolage_Grotesque } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MEMORY WAR — Adversarial Verification Layer",
  description: "An adversarial verification layer for machine-generated claims, built on 0G.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${bricolage.variable}`}>
      <body className="min-h-screen bg-ground font-sans text-ink antialiased">
        <Nav />
        <main className="mx-auto max-w-content px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-content px-6 pb-10 pt-4 text-[12px] text-ink-faint">
          MEMORY WAR is a protocol, not an oracle. It never outputs &ldquo;Truth&rdquo; — it outputs an evidentiary verdict, at a
          point in time, produced by a disclosed and auditable procedure.
        </footer>
      </body>
    </html>
  );
}
