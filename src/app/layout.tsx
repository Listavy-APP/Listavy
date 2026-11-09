import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { es } from "@/lib/i18n/es";
import "./globals.css";

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
  themeColor: "#0f5c4d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-DO">
      <body>
        <RegisterServiceWorker />
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
