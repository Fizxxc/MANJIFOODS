import type { Metadata, Viewport } from "next";
import { Quicksand, Fredoka } from "next/font/google";
import "./globals.css";
// Every HTML response, including error/not-found pages, needs a fresh CSP nonce.
export const dynamic = "force-dynamic";
const body = Quicksand({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});
const display = Fredoka({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "MANJI FOOD", template: "%s · MANJI FOOD" },
  description: "Pesan menu kantin, ambil saat istirahat.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MANJI FOOD",
    statusBarStyle: "default",
  },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FCFAF9",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${body.variable} ${display.variable}`}>
        <a className="skip-link" href="#main">
          Lewati ke konten
        </a>
        {children}
      </body>
    </html>
  );
}
