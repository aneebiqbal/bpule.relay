export function ScoreRing({ score, size = 76, max = 12 }: { score: number; size?: number; max?: number }) {
  const pct = Math.min(Math.max(score, 0) / max, 1)
  const strokeWidth = Math.max(size * 0.07, 2)
  const r = (size - strokeWidth * 2) / 2
  const c = 2 * Math.PI * r
  const color =
    pct >= 0.83
      ? 'var(--status-success)'
      : pct >= 0.58
        ? 'var(--orange)'
        : 'var(--graphite)'
  const fontSize = Math.max(size * 0.36, 11)

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
          {score}
        </span>
      </div>
    </div>
  )
}
