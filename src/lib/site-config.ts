/**
 * Central site configuration.
 * All production URLs, metadata defaults, and domain references live here.
 */

const PRODUCTION_DOMAIN = "relay.bpulse.dev";

export const siteConfig = {
  /**
   * Canonical production domain — used for all absolute URLs.
   */
  domain: PRODUCTION_DOMAIN,

  /**
   * Full production origin with protocol.
   */
  origin: `https://${PRODUCTION_DOMAIN}`,

  /**
   * Product metadata.
   */
  name: "Relay",
  tagline: "Know what to do next",
  description:
    "Relay tells you what deserves your attention — and helps you act on it. Find opportunities worth pursuing, qualify prospects, draft in your voice, and build authority with Studio.",

  /**
   * Social/contact handles.
   */
  twitter: "@relay",
  github: "https://github.com/relay",
  linkedin: "https://linkedin.com/company/relay",

  /**
   * OG image defaults.
   */
  ogImage: {
    width: 1200,
    height: 630,
  },
} as const;

export type SiteConfig = typeof siteConfig;

/**
 * Build an absolute canonical URL for a given path.
 * Always uses the production domain.
 */
export function canonicalUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.origin}${clean}`;
}
