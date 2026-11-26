import type { Metadata, Viewport } from "next";
// Self-hosted IBM Plex (SIL OFL 1.1). Vendored so builds never depend on a
// live Google Fonts fetch; see src/app/fonts/OFL-IBM-Plex.txt.
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { siteConfig, canonicalUrl } from "@/lib/site-config";
import { resolveDbProvider } from "@/lib/db/types";
import { resolveAuthProvider } from "@/lib/auth/contract";
import "./globals.css";

const plexSans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-sans-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "./fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-600-italic.woff2", weight: "600", style: "italic" },
    { path: "./fonts/ibm-plex-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const plexMono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.origin),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [
    "sales outreach",
    "lead qualification",
    "content creation",
    "AI assistant",
    "voice-calibrated drafts",
    "prospect scoring",
    "business development",
    "consultant client acquisition",
    "LinkedIn content ideas",
    "personal brand content",
  ],
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  alternates: {
    canonical: canonicalUrl("/"),
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: canonicalUrl("/"),
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [
      {
        url: canonicalUrl("/og"),
        width: siteConfig.ogImage.width,
        height: siteConfig.ogImage.height,
        alt: `${siteConfig.name} — ${siteConfig.tagline}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: siteConfig.twitter,
    creator: siteConfig.twitter,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    images: [canonicalUrl("/og")],
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: siteConfig.name,
  },
  other: {
    "og:image:width": String(siteConfig.ogImage.width),
    "og:image:height": String(siteConfig.ogImage.height),
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" type="image/svg+xml" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body suppressHydrationWarning className="min-h-full selection:bg-orange/25 selection:text-ink">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('relay-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__RELAY_DB_PROVIDER__=${JSON.stringify(resolveDbProvider())};window.__RELAY_AUTH_PROVIDER__=${JSON.stringify(resolveAuthProvider())};`,
          }}
        />
        {process.env.NEXT_POSTHOG_KEY && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__POSTHOG_KEY__=${JSON.stringify(process.env.NEXT_POSTHOG_KEY)};window.__POSTHOG_HOST__=${JSON.stringify(process.env.NEXT_POSTHOG_HOST || "https://us.i.posthog.com")};`,
            }}
          />
        )}
        <Providers>{children}</Providers>
        <script
          src="https://github-variety.vercel.app/widget.js"
          data-project="bprelay"
          async
        />
      </body>
    </html>
  );
}
