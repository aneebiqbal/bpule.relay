export function ScoreRing({ score, size = 76 }: { score: number; size?: number }) {
  const pct = Math.min(score / 12, 1)
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const color =
    pct >= 0.83
      ? 'var(--status-send)'
      : pct >= 0.58
        ? 'var(--status-research)'
        : 'var(--slate)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--paper-tint)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-lg font-medium text-ink">{score}</span>
        <span className="font-mono text-[10px] text-slate">/ 12</span>
      </div>
    </div>
  )
}
