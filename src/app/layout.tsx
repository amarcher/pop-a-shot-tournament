import type { Metadata } from "next";
import { Geist, Geist_Mono, Bungee, Bungee_Inline } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Bungee is purpose-built to look like 90s arcade signage — chunky, squared
// letterforms with a slight italic lean that match the NBA JAM logo.
const bungee = Bungee({
  variable: "--font-bungee",
  weight: "400",
  subsets: ["latin"],
});

// Bungee Inline is the same shape but with a center-stripe carved out —
// used for the cyan-outlined "ON FIRE!" celebration text.
const bungeeInline = Bungee_Inline({
  variable: "--font-bungee-inline",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pop-a-Shot Tournament",
  description:
    "Run a backyard pop-a-shot tournament. Single elim, double elim, round robin, or Swiss. Everyone gets turned into an NBA-Jam-style baller.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bungee.variable} ${bungeeInline.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
