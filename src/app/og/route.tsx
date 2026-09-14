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
  const accentLight = isStudio ? "#eef2ff" : "#fdf3ed";

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
        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.03,
            backgroundImage: `radial-gradient(circle, ${accent} 0.75px, transparent 0.75px)`,
            backgroundSize: "24px 24px",
          }}
        />

        {/* Accent corner */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 320,
            height: 320,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${accentLight} 0%, transparent 70%)`,
            transform: "translate(30%, -30%)",
          }}
        />

        {/* Signal line */}
        <svg
          style={{
            position: "absolute",
            bottom: 60,
            left: 60,
            opacity: 0.15,
          }}
          width="200"
          height="2"
        >
          <line
            x1="0"
            y1="1"
            x2="200"
            y2="1"
            stroke={accent}
            strokeWidth="2"
            strokeDasharray="6 6"
          />
        </svg>

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
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  color: "#f7f6f3",
                  fontSize: 22,
                  fontWeight: 700,
                  fontFamily: '"IBM Plex Mono", monospace',
                }}
              >
                R
              </span>
            </div>
            <span
              style={{
                fontSize: 22,
                fontWeight: 600,
                color: "#1c1c1a",
                letterSpacing: "-0.01em",
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

          {/* Bottom */}
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
