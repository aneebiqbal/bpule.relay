'use client'

/**
 * Relay V3 shared primitives — one visual language for Home surfaces.
 *
 * Restraint over decoration: composition carries hierarchy, not stacked cards.
 * Every surface uses the same hairline border, 8px radius, 4/8 spacing scale
 * and semantic status colors from globals.css.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { cn } from 'cn'

export type V3Priority = 'critical' | 'high' | 'normal'
export type V3Tone = 'neutral' | 'danger' | 'warning' | 'success'

const PRIORITY_DOT: Record<V3Priority | 'attention', string> = {
  critical: 'bg-status-danger',
  high: 'bg-status-warning',
  attention: 'bg-status-warning',
  normal: 'bg-stone/40',
}

const PRIORITY_TEXT: Record<V3Priority | 'attention', string> = {
  critical: 'text-status-danger',
  high: 'text-status-warning',
  attention: 'text-status-warning',
  normal: 'text-graphite',
}

const PRIORITY_ACCENT: Record<string, string> = {
  critical: 'border-l-status-danger',
  high: 'border-l-status-warning',
  attention: 'border-l-status-warning',
  normal: 'border-l-transparent',
}

const TONE_TEXT: Record<V3Tone, string> = {
  neutral: 'text-ink',
  danger: 'text-status-danger',
  warning: 'text-status-warning',
  success: 'text-status-success',
}

const TONE_ACCENT: Record<V3Tone, string> = {
  neutral: 'border-t-line',
  danger: 'border-t-status-danger',
  warning: 'border-t-status-warning',
  success: 'border-t-status-success',
}

/** Small status marker. Never color-only — always paired with a text label. */
export function V3PriorityMark({ priority }: { priority: V3Priority | 'attention' }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em]">
      <span className={cn('size-1.5 rounded-full', PRIORITY_DOT[priority])} aria-hidden />
      <span className={PRIORITY_TEXT[priority]}>{priority === 'normal' ? 'Normal' : priority}</span>
    </span>
  )
}

/** Initials avatar — no image dependency, derived from the canonical name. */
export function V3Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-bone font-medium text-ink ring-1 ring-line',
        size === 'sm' ? 'size-6 text-[9px]' : 'size-8 text-[11px]',
      )}
    >
      {initials || '·'}
    </span>
  )
}

export function V3PageHeader({
  title,
  subtitle,
  meta,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {/* Greeting depends on the viewer's clock; suppress the server/client text mismatch. */}
        <h1 suppressHydrationWarning className="text-[28px] font-light tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {subtitle && <p className="text-[14px] text-graphite">{subtitle}</p>}
        {meta && <div className="pt-1">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function V3SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-[16px] font-medium text-ink">{title}</h2>
      {hint && <p className="text-[12px] text-stone">{hint}</p>}
    </div>
  )
}

export function V3Metric({
  label,
  value,
  hint,
  href,
  active,
  onClick,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  hint?: string
  href?: string
  active?: boolean
  onClick?: () => void
  tone?: V3Tone
}) {
  const body = (
    <>
      <p className="text-[12px] text-graphite">{label}</p>
      <p suppressHydrationWarning className={cn('mt-1 text-[28px] font-medium tabular-nums tracking-tight', TONE_TEXT[tone])}>
        {value}
      </p>
      {hint && (
        <p suppressHydrationWarning className="mt-0.5 text-[11px] text-stone">
          {hint}
        </p>
      )}
    </>
  )
  const shell = cn(
    'rounded-lg border border-t-2 bg-bone-raised px-3.5 py-3 text-left transition-colors',
    TONE_ACCENT[tone],
    active ? 'ring-1 ring-orange/20' : 'hover:border-orange/30',
  )
  if (href) {
    return (
      <Link href={href} aria-label={`${label}: ${value}`} className={shell}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-label={`${label}: ${value}`} className={shell}>
      {body}
    </button>
  )
}

export function V3ActionRow({
  rank,
  priority,
  title,
  context,
  whyNow,
  age,
  ctaLabel,
  href,
}: {
  rank?: number
  priority: V3Priority
  title: string
  context?: string
  whyNow?: string
  age?: string
  ctaLabel: string
  href: string
}) {
  return (
    <li className={cn('flex flex-col gap-3 border-l-2 px-4 py-3.5 transition-colors hover:bg-bone/60 sm:flex-row sm:items-center sm:gap-4', PRIORITY_ACCENT[priority])}>
      {rank != null && (
        <span className="hidden w-6 shrink-0 text-mono-medium text-[11px] text-stone sm:block">
          {String(rank).padStart(2, '0')}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <V3PriorityMark priority={priority} />
          <p className="text-[14px] font-medium text-ink">{title}</p>
        </div>
        {context && <p className="mt-0.5 truncate text-[12px] text-graphite">{context}</p>}
        {whyNow && <p className="mt-0.5 text-[12px] text-graphite">{whyNow}</p>}
        {age && (
          <p suppressHydrationWarning className="mt-0.5 text-[11px] text-stone">
            {age}
          </p>
        )}
      </div>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1 self-start rounded-md bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] sm:self-center"
      >
        {ctaLabel}
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </li>
  )
}

export function V3AttentionRow({
  severity,
  name,
  reason,
  ctaLabel,
  href,
}: {
  severity: 'critical' | 'attention' | 'normal'
  name: string
  reason: string
  ctaLabel: string
  href: string
}) {
  return (
    <li className={cn('flex flex-col gap-2.5 border-l-2 px-4 py-3.5 transition-colors hover:bg-bone/60 sm:flex-row sm:items-center sm:justify-between', PRIORITY_ACCENT[severity])}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <V3Avatar name={name} size="sm" />
          <V3PriorityMark priority={severity} />
          <p className="text-[14px] font-medium text-ink">{name}</p>
        </div>
        <p className="mt-1 text-[12px] text-graphite">{reason}</p>
      </div>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1 self-start rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone sm:self-center"
      >
        {ctaLabel}
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </li>
  )
}

export function V3PersonRow({
  name,
  role,
  stats,
  progress,
  status,
  href,
}: {
  name: string
  role?: string | null
  stats: Array<{ label: string; value: number | string }>
  progress?: { label: string; pct: number }
  status?: string
  href: string
}) {
  const pct = Math.min(100, Math.max(0, progress?.pct ?? 0))
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-bone"
      >
        <V3Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">{name}</p>
          {role && <p className="truncate text-[11px] text-stone">{role}</p>}
        </div>
        {progress && (
          <div className="hidden w-28 shrink-0 sm:block">
            <div className="flex items-baseline justify-between text-[10px] text-stone">
              <span>{progress.label}</span>
              <span className="tabular-nums text-ink">{progress.pct}%</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-bone">
              <div className="h-1 rounded-full bg-ink" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
        <dl className="hidden items-center gap-4 lg:flex">
          {stats.map((stat) => (
            <div key={stat.label} className="text-right">
              <dt className="sr-only">{stat.label}</dt>
              <dd className="text-[13px] font-medium tabular-nums text-ink">{stat.value}</dd>
              <dd className="text-[10px] text-stone">{stat.label}</dd>
            </div>
          ))}
        </dl>
        {status && (
          <span className="shrink-0 rounded-full bg-bone px-2 py-0.5 text-[10px] font-medium text-graphite">
            {status}
          </span>
        )}
      </Link>
    </li>
  )
}

export function V3StageStrip({
  stages,
}: {
  stages: Array<{ key: string; label: string; count: number; href: string; conversionPct?: number | null }>
}) {
  const max = Math.max(1, ...stages.map((stage) => stage.count))
  return (
    <ul className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-lg border border-line bg-bone-raised sm:grid-cols-6">
      {stages.map((stage) => (
        <li key={stage.key} className="min-w-0">
          <Link
            href={stage.href}
            className="flex h-full flex-col gap-2 px-3 py-3 text-left transition-colors hover:bg-bone"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-stone">
                {stage.label}
              </span>
              <span className="text-[16px] font-medium tabular-nums text-ink">{stage.count}</span>
            </span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-bone">
              <span
                className="block h-1 rounded-full bg-orange transition-[width] duration-500"
                style={{ width: `${Math.round((stage.count / max) * 100)}%` }}
              />
            </span>
            {stage.conversionPct != null && (
              <span className="text-[10px] text-graphite">{stage.conversionPct}% from prior</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function V3ActivityRow({
  time,
  label,
  detail,
  href,
}: {
  time: string
  label: string
  detail?: string
  href?: string
}) {
  const body = (
    <>
      {/* Client-local clock: suppress the server/client text mismatch. */}
      <span
        suppressHydrationWarning
        className="w-10 shrink-0 pt-0.5 text-right text-mono-medium text-[11px] tabular-nums text-stone"
      >
        {time}
      </span>
      <span className="flex w-3 shrink-0 flex-col items-center" aria-hidden>
        <span className="mt-1 size-1.5 rounded-full bg-orange" />
        <span className="w-px flex-1 bg-line" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{label}</span>
        {detail && <span className="block truncate text-[11px] text-graphite">{detail}</span>}
      </span>
      {href && <ChevronRight className="size-3.5 shrink-0 self-center text-stone" aria-hidden />}
    </>
  )
  if (href) {
    return (
      <li>
        <Link href={href} className="flex gap-3 px-4 py-2.5 transition-colors hover:bg-bone/60">
          {body}
        </Link>
      </li>
    )
  }
  return <li className="flex gap-3 px-4 py-2.5">{body}</li>
}

export function V3EmptyState({
  title,
  body,
  children,
}: {
  title: string
  body?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-bone-raised/60 px-6 py-10 text-center">
      <CheckCircle2 className="size-6 text-status-success" aria-hidden />
      <p className="mt-3 text-[15px] font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-md text-[13px] text-graphite">{body}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

export function V3SectionError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-status-warning/30 bg-status-warning/5 px-4 py-3"
    >
      <div className="flex items-center gap-2 text-[13px] text-graphite">
        <AlertTriangle className="size-4 text-status-warning" aria-hidden />
        <span>We couldn&apos;t load this section.</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bone-raised px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Retry
        </button>
      )}
    </div>
  )
}

export function V3Skeleton({ variant = 'row' }: { variant?: 'metric' | 'row' | 'block' }) {
  if (variant === 'metric') {
    return <div className="h-[92px] animate-pulse rounded-lg border border-line bg-bone-raised" />
  }
  if (variant === 'block') {
    return <div className="h-40 animate-pulse rounded-lg border border-line bg-bone-raised" />
  }
  return (
    <div className="animate-pulse px-4 py-3.5">
      <div className="h-3.5 w-2/5 rounded bg-bone" />
      <div className="mt-2 h-3 w-3/5 rounded bg-bone" />
    </div>
  )
}
