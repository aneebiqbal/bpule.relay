import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      // Auth pages waste crawl budget
      { userAgent: "*", disallow: "/login" },
      { userAgent: "*", disallow: "/signup" },
      { userAgent: "*", disallow: "/forgot-password" },
      { userAgent: "*", disallow: "/reset-password" },
      { userAgent: "*", disallow: "/auth/" },
      // App structure should never be indexed
      { userAgent: "*", disallow: "/dashboard" },
      { userAgent: "*", disallow: "/onboarding" },
    ],
    sitemap: `${siteConfig.origin}/sitemap.xml`,
    host: siteConfig.origin,
  };
}
