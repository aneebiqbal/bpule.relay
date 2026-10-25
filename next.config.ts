import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Redirects for surfaces removed/merged in the simplification pass, so
  // bookmarks and old links do not 404.
  async redirects() {
    return [
      { source: "/conversations", destination: "/chats", permanent: true },
      { source: "/usage", destination: "/dashboard", permanent: true },
      { source: "/content/growth", destination: "/content-v2/growth", permanent: true },
      { source: "/find-jobs", destination: "/upwork", permanent: true },
      { source: "/resume/generate", destination: "/content", permanent: true },
      { source: "/studio/drafts/new", destination: "/content", permanent: true },
      { source: "/admin/revenue-identities", destination: "/profile-intelligence?tab=identities", permanent: true },
    ];
  },

  // pdf-parse → pdfjs-dist → @napi-rs/canvas (native binary). Bundling them
  // breaks the DOMMatrix polyfill and the .node binary; load from node_modules.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],

  // Allow Playwright WebKit to load dev resources from 127.0.0.1
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Optimize package imports for smaller bundles
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      // Cache static assets
      {
        source: "/icon-:size.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/icon.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  // Power by header removal
  poweredByHeader: false,
};

export default nextConfig;
