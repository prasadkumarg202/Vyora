import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
// Side-effect import: validates env while the app compiles, so a bad
// deployment fails at build rather than on a user's first request.
import "~/env";

const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Vyora",
    template: "%s · Vyora",
  },
  description: "Business OS for Indian MSMEs — works offline, syncs later.",
  applicationName: "Vyora",
  appleWebApp: {
    capable: true,
    title: "Vyora",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  // Matches the dark band token, oklch(0.22 0.03 280).
  themeColor: "#181928",
  // The app shell is a fixed frame; the content area scrolls, not the page.
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        {/*
          Set the theme class before first paint so there is no flash of the
          wrong theme. Reads the saved choice, falling back to the OS setting.
          Inline and synchronous by necessity — it must run before the body
          renders.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("vyora.theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
