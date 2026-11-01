import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AguaGasExpress",
  description: "Pide gas y agua a domicilio y sigue a tu repartidor en vivo. Gestión de reparto para negocios peruanos.",
  applicationName: "AguaGasExpress",
  appleWebApp: { capable: true, title: "AguaGasExpress", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0891b2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-PE" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Suspense>{children}</Suspense>
      </body>
    </html>
  );
}
