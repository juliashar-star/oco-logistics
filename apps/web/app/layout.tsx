import type { Metadata } from "next";
import { Onest, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OCO Logistics",
  description: "Веб-кабинет для сравнения доставки и управления отправлениями",
};

// Nonce-based CSP requires per-request rendering so Next.js can read x-nonce / CSP headers.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${onest.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
