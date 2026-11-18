import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
// Open question for Fabian: Analytics is never mounted, so PostHog consent never runs. Decide before mounting or removing.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Analytics } from "@/components/Analytics";
import { AppHeader } from "@/components/AppHeader";
import { CaptureReferral } from "@/components/CaptureReferral";
import { BottomNav } from "@/components/BottomNav";
import { LegalFooter } from "@/components/LegalFooter";
import { Loader } from "@/components/Loader";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { es } from "@/lib/i18n/es";
import "./globals.css";

// Self-hosted Manrope (SIL OFL, see src/fonts/OFL-Manrope.txt). Latin subset covers Spanish.
const manrope = localFont({
  src: "../fonts/Manrope-latin-variable.woff2",
  weight: "200 800",
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: es.brand, template: `%s · ${es.brand}` },
  description: es.home.subtitle,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: es.brand, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B132B",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-DO" className={manrope.variable}>
      <body>
        <CaptureReferral />
        <RegisterServiceWorker />
        <main className="page">
          <Loader />
          <AppHeader />
          {children}
          <LegalFooter />
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
