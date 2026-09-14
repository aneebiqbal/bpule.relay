import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Relay — Know what to do next",
    template: "%s — Relay",
  },
  description:
    "Relay tells you what deserves your attention — and helps you act on it. Find opportunities, qualify prospects, draft in your voice, and build authority with Studio.",
  keywords: [
    "sales outreach",
    "lead qualification",
    "content creation",
    "AI assistant",
    "voice-calibrated drafts",
    "prospect scoring",
  ],
  authors: [{ name: "Relay" }],
  creator: "Relay",
  metadataBase: new URL("https://relay.app"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Relay",
    title: "Relay — Know what to do next",
    description:
      "Relay tells you what deserves your attention — and helps you act on it.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay — Know what to do next",
    description:
      "Relay tells you what deserves your attention — and helps you act on it.",
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Relay",
  },
};

export const viewport: Viewport = {
  themeColor: "#fafaf8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className="min-h-full selection:bg-orange/25 selection:text-ink">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
