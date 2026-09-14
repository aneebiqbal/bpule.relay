/**
 * Relay Logo — SVG mark + wordmark
 *
 * A signal motif: the letter "R" constructed from geometric precision,
 * with an implied signal pulse emanating from the counter.
 *
 * Usage:
 *   <RelayLogo />                    // full logo (mark + wordmark)
 *   <RelayLogo markOnly />            // mark only
 *   <RelayLogo className="w-24" />    // sized via parent
 */
export function RelayLogo({
  markOnly = false,
  className,
}: {
  markOnly?: boolean
  className?: string
}) {
  return (
    <svg
      viewBox={markOnly ? '0 0 32 32' : '0 0 128 32'}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Relay"
      role="img"
    >
      {/* ── Mark ── */}
      <g transform="translate(0, 0)">
        {/* Signal pulse arcs */}
        <path
          d="M22 16C22 11.58 18.42 8 14 8"
          stroke="#d4652f"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.4"
        />
        <path
          d="M25 16C25 9.37 19.63 4 13 4"
          stroke="#d4652f"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.2"
        />

        {/* The "R" letterform — geometric, precision-cut */}
        <path
          d="M7 6H16C18.76 6 21 8.24 21 11C21 13.24 19.5 15.14 17.46 15.77L21.5 26H18.7L14.8 16H9.5V26H7V6ZM9.5 13.5H16C17.38 13.5 18.5 12.38 18.5 11C18.5 9.62 17.38 8.5 16 8.5H9.5V13.5Z"
          fill="#1c1c1a"
        />

        {/* Signal dot at the joint */}
        <circle cx="9.5" cy="16" r="1.2" fill="#d4652f" />
      </g>

      {/* ── Wordmark ── */}
      {!markOnly && (
        <text
          x="38"
          y="22"
          fontFamily="IBM Plex Sans, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
          fontSize="18"
          fontWeight="600"
          letterSpacing="-0.02em"
          fill="#1c1c1a"
        >
          Relay
        </text>
      )}
    </svg>
  )
}

/**
 * Relay Mark only — for favicons, small spaces, app icons.
 */
export function RelayMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" fill="#d4652f" />
      <path
        d="M9 8H17C19.76 8 22 10.24 22 13C22 15.24 20.5 17.14 18.46 17.77L22.5 28H19.7L15.8 18H11.5V28H9V8ZM11.5 15.5H17C18.38 15.5 19.5 14.38 19.5 13C19.5 11.62 18.38 10.5 17 10.5H11.5V15.5Z"
        fill="#f7f6f3"
      />
      <circle cx="11.5" cy="18" r="1.2" fill="#f7f6f3" opacity="0.6" />
    </svg>
  )
}
