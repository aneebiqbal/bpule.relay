'use client'

/**
 * Relay V4 primitives — the enterprise visual language.
 *
 * One system across every workspace: soft structuralism on a warm bone
 * surface, hairline rings instead of hard borders, ambient depth instead of
 * drop shadows, and a single restrained orange accent. Composition carries
 * hierarchy; nothing here is decorative.
 */
import type { ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, RefreshCw, X } from 'lucide-react'
import { cn } from 'cn'

export type V4Tone = 'neutral' | 'danger' | 'warning' | 'success' | 'info'
export type V4Priority = 'critical' | 'high' | 'normal' | 'watch'

const TONE_TEXT: Record<V4Tone, string> = {
  neutral: 'text-ink',
  danger: 'text-status-danger',
  warning: 'text-status-warning',
  success: 'text-status-success',
  info: 'text-cobalt',
}

const TONE_CHIP: Record<V4Tone, string> = {
  neutral: 'bg-bone text-graphite ring-line',
  danger: 'bg-status-danger/10 text-[#8f2b1e] ring-status-danger/20',
  warning: 'bg-status-warning/10 text-[#7d5410] ring-status-warning/20',
  success: 'bg-status-success/10 text-[#256b4a] ring-status-success/20',
  info: 'bg-cobalt/10 text-cobalt ring-cobalt/20',
}

const PRIORITY_DOT: Record<V4Priority, string> = {
  critical: 'bg-status-danger',
  high: 'bg-status-warning',
  watch: 'bg-cobalt',
  normal: 'bg-stone/50',
}

const PRIORITY_TEXT: Record<V4Priority, string> = {
  critical: 'text-status-danger',
  high: 'text-status-warning',
  watch: 'text-cobalt',
  normal: 'text-graphite',
}

/** Eyebrow label — the small uppercase tag above a heading or panel. */
export function V4Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[10px] font-medium uppercase tracking-[0.18em] text-stone', className)}>
      {children}
    </p>
  )
}

/**
 * Double-bezel panel: an outer shell with a hairline ring and an inner core.
 * Used for every container so the product reads as one object system.
 */
export function V4Panel({
  children,
  className,
  innerClassName,
  padded = true,
}: {
  children: ReactNode
  className?: string
  innerClassName?: string
  padded?: boolean
}) {
  return (
    <section
      className={cn(
        'rounded-2xl bg-bone p-1.5 shadow-[0_1px_2px_rgba(28,28,26,0.04),0_8px_24px_-12px_rgba(28,28,26,0.12)] ring-1 ring-line',
        className,
      )}
    >
      <div className={cn('rounded-xl bg-bone-raised ring-1 ring-line/70', padded && 'p-4 sm:p-5', innerClassName)}>
        {children}
      </div>
    </section>
  )
}

/** Panel heading row: eyebrow + title on the left, hint/action on the right. */
export function V4PanelHeader({
  eyebrow,
  title,
  hint,
  action,
  className,
}: {
  eyebrow?: string
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <V4Eyebrow>{eyebrow}</V4Eyebrow>}
        <h2 className={cn('font-medium tracking-[-0.01em] text-ink', eyebrow ? 'mt-1 text-[16px]' : 'text-[16px]')}>
          {title}
        </h2>
        {hint && <div className="mt-0.5 text-[12px] text-stone">{hint}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

/** Page header — identity, context and the primary action. */
export function V4PageHeader({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
}: {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <V4Eyebrow>{eyebrow}</V4Eyebrow>}
        <h1 suppressHydrationWarning className="text-[26px] font-light leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {subtitle && <div suppressHydrationWarning className="text-[13px] text-graphite">{subtitle}</div>}
        {meta && <div suppressHydrationWarning className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Dense stat strip — one surface, hairline dividers, never KPI cards. */
export function V4StatStrip({
  items,
  label,
}: {
  items: Array<{
    key: string
    label: string
    value: number | string | null
    hint?: string
    href?: string
    tone?: V4Tone
  }>
  label?: string
}) {
  return (
    <div>
      {label && <p className="sr-only">{label}</p>}
      <div
        role="list"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {items.map((item, index) => {
          const body = (
            <>
              <p className="truncate text-[11px] text-graphite">{item.label}</p>
              <p
                suppressHydrationWarning
                className={cn(
                  'mt-1.5 text-[24px] font-medium leading-none tracking-tight tabular-nums',
                  item.tone ? TONE_TEXT[item.tone] : 'text-ink',
                )}
              >
                {item.value == null ? <span className="text-stone">—</span> : item.value}
              </p>
              {item.hint && (
                <p suppressHydrationWarning className="mt-1 truncate text-[11px] text-stone">
                  {item.hint}
                </p>
              )}
            </>
          )
          const spanLast = items.length % 2 !== 0 && index === items.length - 1
          const shell = cn(
            'min-w-0 rounded-lg bg-bone-raised px-4 py-3.5 text-left ring-1 ring-line transition-colors',
            spanLast && 'max-sm:col-span-2',
            item.href && 'hover:bg-bone cursor-pointer',
          )
          if (item.href) {
            return (
              <Link key={item.key} role="listitem" href={item.href} aria-label={`${item.label}: ${item.value ?? '—'}`} className={shell}>
                {body}
              </Link>
            )
          }
          return (
            <div key={item.key} role="listitem" className={shell}>
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Semantic status chip. Color is never the only signal — always paired with text. */
export function V4Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: V4Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ring-1',
        TONE_CHIP[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Priority marker — dot plus label, never color-only. */
export function V4PriorityMark({ priority, label }: { priority: V4Priority; label?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.12em]', PRIORITY_TEXT[priority])}>
      <span className={cn('size-1.5 rounded-full', PRIORITY_DOT[priority])} aria-hidden />
      {label ?? (priority === 'normal' ? 'Normal' : priority)}
    </span>
  )
}

/** Initials avatar derived from the canonical name. */
export function V4Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
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
        size === 'sm' && 'size-6 text-[9px]',
        size === 'md' && 'size-8 text-[11px]',
        size === 'lg' && 'size-10 text-[13px]',
      )}
    >
      {initials || '·'}
    </span>
  )
}

/** Dense operational row — 44–52px, record first, metadata last. */
export function V4Row({
  children,
  href,
  className,
  ariaLabel,
}: {
  children: ReactNode
  href?: string
  className?: string
  ariaLabel?: string
}) {
  const shell = cn(
    'flex min-h-[48px] items-center gap-3 px-4 py-2.5 transition-colors',
    href && 'hover:bg-bone cursor-pointer',
    className,
  )
  if (href) {
    return (
      <Link href={href} aria-label={ariaLabel} className={shell}>
        {children}
      </Link>
    )
  }
  return <div className={shell}>{children}</div>
}

/** Shape-matched skeleton. */
export function V4Skeleton({ variant = 'row' }: { variant?: 'metric' | 'row' | 'block' | 'panel' }) {
  if (variant === 'metric') return <div className="h-[92px] animate-pulse rounded-xl bg-bone-raised ring-1 ring-line" />
  if (variant === 'block') return <div className="h-40 animate-pulse rounded-xl bg-bone-raised ring-1 ring-line" />
  if (variant === 'panel') return <div className="h-64 animate-pulse rounded-2xl bg-bone-raised ring-1 ring-line" />
  return (
    <div className="animate-pulse px-4 py-3">
      <div className="h-3.5 w-2/5 rounded bg-bone" />
      <div className="mt-2 h-3 w-3/5 rounded bg-bone" />
    </div>
  )
}

/** Section-level degradation — a failed widget never takes the page down. */
export function V4Error({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3">
      <div className="flex items-center gap-2 text-[13px] text-graphite">
        <AlertTriangle className="size-4 shrink-0 text-status-warning" aria-hidden />
        <span>{message ?? "We couldn't load this section."}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-bone-raised px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Retry
        </button>
      )}
    </div>
  )
}

export function V4Empty({
  title,
  body,
  children,
}: {
  title: string
  body?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-bone-raised/50 px-6 py-10 text-center">
      <CheckCircle2 className="size-6 text-status-success" aria-hidden />
      <p className="mt-3 text-[15px] font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-md text-[13px] text-graphite">{body}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}

/** Contextual side drawer — record inspection without leaving the working list. */
export function V4Drawer({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
      <div className="absolute inset-0 bg-ink/25" aria-hidden onClick={onClose} />
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex w-full flex-col bg-bone shadow-2xl ring-1 ring-line',
          width,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-bone text-graphite transition-colors hover:bg-bone-raised hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
