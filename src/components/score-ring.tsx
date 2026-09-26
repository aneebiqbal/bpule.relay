/**
 * ScoreRing — displays a prospect score as a circular progress indicator.
 *
 * Supports both legacy 0-12 scores and canonical 0-100 scores.
 * When a canonical score is provided, the display shows /10 (rounded).
 * The /10 display is ALWAYS a conversion of the canonical score — never
 * an independent scoring system.
 */
export function ScoreRing({
  score,
  canonicalScore,
  size = 76,
  max,
}: {
  /** Legacy 0-12 score (fallback if no canonical score) */
  score?: number | null
  /** Canonical 0-100 score (preferred) */
  canonicalScore?: number | null
  size?: number
  /** Max value for the ring. Auto-detected from score type if not provided. */
  max?: number
}) {
  // Use canonical score if available, otherwise fall back to legacy
  const displayMax = max ?? (canonicalScore != null ? 100 : 12)
  const rawScore = canonicalScore ?? score ?? 0
  const pct = Math.min(Math.max(rawScore, 0) / displayMax, 1)
  const strokeWidth = Math.max(size * 0.07, 2)
  const r = (size - strokeWidth * 2) / 2
  const c = 2 * Math.PI * r
  const color =
    pct >= 0.83
      ? 'var(--status-success)'
      : pct >= 0.58
        ? 'var(--bone)'
        : 'var(--line)'
  const fontSize = Math.max(size * 0.36, 11)

  // Display value: canonical scores show /10, legacy shows raw
  const displayValue = canonicalScore != null ? Math.round(canonicalScore / 10) : rawScore

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={strokeWidth}
          opacity={0.3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="text-mono-medium font-medium leading-none text-ink"
          style={{ fontSize }}
        >
          {displayValue}
        </span>
      </div>
    </div>
  )
}
