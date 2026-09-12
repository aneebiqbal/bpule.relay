export function ScoreRing({ score, size = 76, max = 12 }: { score: number; size?: number; max?: number }) {
  const pct = Math.min(Math.max(score, 0) / max, 1)
  const strokeWidth = size > 60 ? 5 : 3.5
  const r = (size - strokeWidth * 2) / 2
  const c = 2 * Math.PI * r
  const color =
    pct >= 0.83
      ? 'var(--status-send)'
      : pct >= 0.58
        ? 'var(--gold)'
        : 'var(--slate)'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={strokeWidth}
          opacity={0.5}
        />
        {/* Progress */}
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
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-mono-medium text-lg font-medium leading-none text-ink">{score}</span>
        <span className="text-mono-medium text-[9px] leading-none text-slate">/ {max}</span>
      </div>
    </div>
  )
}
