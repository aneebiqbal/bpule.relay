import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site-config";

export const runtime = "edge";
export const contentType = "image/png";
export const size = {
  width: siteConfig.ogImage.width,
  height: siteConfig.ogImage.height,
};

/**
 * Dynamic Open Graph image generator.
 *
 * Query params:
 *   ?title=Custom Title
 *   ?subtitle=Custom Subtitle
 *   ?theme=orange|cobalt  (default: orange)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const title = searchParams.get("title") ?? siteConfig.tagline;
  const subtitle = searchParams.get("subtitle");
  const theme = searchParams.get("theme") ?? "orange";

  const isStudio = theme === "cobalt";
  const accent = isStudio ? "#3b5bdb" : "#d4652f";
  const accentFaint = isStudio ? "#eef2ff" : "#fdf3ed";

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f7f6f3",
          fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle dot grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.04,
            backgroundImage: `radial-gradient(circle, ${accent} 0.75px, transparent 0.75px)`,
            backgroundSize: "20px 20px",
          }}
        />

        {/* Accent glow top-right */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accentFaint} 0%, transparent 70%)`,
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: 60,
            flex: 1,
            justifyContent: "space-between",
          }}
        >
          {/* Brand mark */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Signal mark */}
            <svg width="48" height="48" viewBox="0 0 32 32" fill="none">
              <path
                d="M22 16C22 11.58 18.42 8 14 8"
                stroke={accent}
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.4"
              />
              <path
                d="M25 16C25 9.37 19.63 4 13 4"
                stroke={accent}
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.2"
              />
              <path
                d="M7 6H16C18.76 6 21 8.24 21 11C21 13.24 19.5 15.14 17.46 15.77L21.5 26H18.7L14.8 16H9.5V26H7V6ZM9.5 13.5H16C17.38 13.5 18.5 12.38 18.5 11C18.5 9.62 17.38 8.5 16 8.5H9.5V13.5Z"
                fill="#1c1c1a"
              />
              <circle cx="9.5" cy="16" r="1.2" fill={accent} />
            </svg>
            <span
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: "#1c1c1a",
                letterSpacing: "-0.02em",
              }}
            >
              Relay
            </span>
          </div>

          {/* Headline */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                fontSize: title.length > 30 ? 42 : 52,
                fontWeight: 300,
                color: "#1c1c1a",
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
                maxWidth: 600,
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 400,
                  color: "#5c5b57",
                  lineHeight: 1.4,
                  maxWidth: 500,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>

          {/* Bottom tag */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: accent,
                opacity: 0.6,
              }}
            />
            <span
              style={{
                fontSize: 14,
                color: "#8a8984",
                fontFamily: '"IBM Plex Mono", monospace',
                letterSpacing: "0.05em",
              }}
            >
              {siteConfig.domain}
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
