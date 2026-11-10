import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
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
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: es.brand, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-DO" className={manrope.variable}>
      <body>
        <RegisterServiceWorker />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
