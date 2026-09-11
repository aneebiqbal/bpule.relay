import type { MetadataRoute } from "next"

/**
 * Relay is authenticated and never public, so the correct move is the opposite
 * of SEO: no crawler should index or follow anything. There is no sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  }
}
