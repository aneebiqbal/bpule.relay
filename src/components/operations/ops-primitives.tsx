import Link from 'next/link'
import { cn } from 'cn'
import { StatusBadge } from '@/components/ui/status-badge'
import type { RepStatus } from '@/lib/team/attention-policy'
import type { TimelineRow } from '@/lib/operations/activity'

/**
 * Shared Phase 8 primitives. Server-safe (no hooks). Every metric is a link
 * (zero dead-end rule): a number on an operational screen always opens the
 * records behind it.
 */

export interface OpsMetric {
  label: string
  value: number | string
  /** Where the number drills down to. Omit only for values that are not records. */
  href?: string | null
  hint?: string
  tone?: 'default' | 'attention' | 'critical'
}

export function MetricStrip({ metrics, className }: { metrics: OpsMetric[]; className?: string }) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line ring-1 ring-line sm:grid-cols-4',
        metrics.length > 4 && 'lg:grid-cols-8',
        className,
      )}
    >
      {metrics.map((m) => {
        const tone =
          m.tone === 'critical' ? 'text-status-danger' : m.tone === 'attention' ? 'text-orange-ink' : 'text-ink'
        // A <dl> may only hold dt/dd or <div> groups, so the drill-down link sits
        // in the <dt> and stretches over the whole tile.
        return (
          <div
            key={m.label}
            title={m.hint}
            className={cn(
              'relative min-w-0 bg-bone-raised px-3.5 py-3',
              m.href && 'transition-colors hover:bg-bone-000 focus-within:bg-bone-000',
            )}
          >
            <dt className="truncate text-[11px] text-graphite">
              {m.href ? (
                <Link href={m.href} aria-label={`${m.label}: ${m.value}`} className="after:absolute after:inset-0 focus-visible:outline-none">
                  {m.label}
                </Link>
              ) : (
                m.label
              )}
            </dt>
            <dd className={cn('mt-1 text-[22px] font-medium tabular-nums tracking-tight', tone)}>{m.value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

export interface LinkTab {
  value: string
  label: string
  href: string
  count?: number
}

/** URL-state tabs: links, so refresh and back button keep the tab. */
export function LinkTabs({ tabs, active, label, wrap = false, compact = false }: { tabs: LinkTab[]; active: string; label: string; wrap?: boolean; compact?: boolean }) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto">
      <ul className={cn(
        'flex items-center gap-0.5 rounded-lg bg-bone p-0.5 ring-1 ring-line',
        wrap ? 'flex-wrap' : 'min-w-max',
      )}>
        {tabs.map((tab) => {
          const current = tab.value === active
          return (
            <li key={tab.value}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                scroll={false}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md whitespace-nowrap transition-colors',
                  compact ? 'px-2 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
                  current
                    ? 'bg-bone-raised font-medium text-ink shadow-sm'
                    : 'text-graphite hover:text-ink',
                )}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={cn('rounded-full bg-bone tabular-nums text-stone', compact ? 'px-1 text-[10px]' : 'px-1.5 text-[11px]')}>
                    {tab.count}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const STATUS_VARIANT: Record<RepStatus, 'success' | 'warning' | 'danger'> = {
  'On track': 'success',
  Attention: 'warning',
  Critical: 'danger',
}

/** Status is text + dot, never colour alone. */
export function RepStatusBadge({ status }: { status: RepStatus }) {
  return <StatusBadge status={status} variant={STATUS_VARIANT[status]} />
}

export function relativeTime(iso: string | null | undefined, now: number): string {
  if (!iso) return '—'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const mins = Math.round((now - t) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(t).toISOString().slice(0, 10)
}

export function ageLabel(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return '<1h'
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function clockTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(11, 16)
}

export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-[15px] font-medium tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[12px] text-graphite">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function InlineEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-3 py-4 text-[13px] text-graphite">{children}</p>
  )
}

export function InlineError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger"
    >
      {children}
    </p>
  )
}

/**
 * Chronological operational timeline. A real table above `md` (semantic
 * headers), a stacked list below. Rows link to the record they are about.
 */
export function TimelineTable({
  rows,
  now,
  empty,
  showActor = true,
}: {
  rows: TimelineRow[]
  now: number
  empty: string
  showActor?: boolean
}) {
  if (rows.length === 0) return <InlineEmpty>{empty}</InlineEmpty>
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
        <table className="w-full text-left text-[13px]">
          <caption className="sr-only">Activity timeline, newest first</caption>
          <thead className="bg-bone-raised text-[11px] uppercase tracking-[0.06em] text-stone">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Time</th>
              {showActor && <th scope="col" className="px-3 py-2 font-medium">Actor</th>}
              <th scope="col" className="px-3 py-2 font-medium">Profile</th>
              <th scope="col" className="px-3 py-2 font-medium">Lead / account</th>
              <th scope="col" className="px-3 py-2 font-medium">Event</th>
              <th scope="col" className="px-3 py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line/70 align-top">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-graphite">
                  <time dateTime={row.at} title={row.at}>
                    {relativeTime(row.at, now)}
                  </time>
                </td>
                {showActor && <td className="px-3 py-2 text-ink">{row.actorName ?? 'System'}</td>}
                <td className="px-3 py-2 text-graphite">{row.profileName ?? '—'}</td>
                <td className="max-w-[240px] px-3 py-2">
                  <TimelineSubject row={row} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{row.event}</td>
                <td className="max-w-[280px] truncate px-3 py-2 text-graphite" title={row.result ?? undefined}>
                  {row.result ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 md:hidden" aria-label="Activity timeline, newest first">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl bg-bone-raised px-3 py-2 ring-1 ring-line">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{row.event}</span>
              <time dateTime={row.at} className="shrink-0 text-[11px] tabular-nums text-stone">
                {relativeTime(row.at, now)}
              </time>
            </div>
            <div className="mt-0.5 text-[12px] text-graphite">
              {[showActor ? row.actorName ?? 'System' : null, row.profileName].filter(Boolean).join(' · ')}
            </div>
            <div className="mt-1 text-[12px]">
              <TimelineSubject row={row} />
            </div>
            {row.result && <p className="mt-1 line-clamp-2 text-[12px] text-graphite">{row.result}</p>}
          </li>
        ))}
      </ul>
    </>
  )
}

function TimelineSubject({ row }: { row: TimelineRow }) {
  const label = row.leadLabel ?? row.company
  return (
    <span className="flex min-w-0 flex-col">
      {label ? (
        row.href ? (
          <Link href={row.href} className="truncate text-ink underline-offset-2 hover:underline">
            {label}
          </Link>
        ) : (
          <span className="truncate text-ink">{label}</span>
        )
      ) : row.href ? (
        <Link href={row.href} className="text-ink underline-offset-2 hover:underline">
          Open
        </Link>
      ) : (
        <span className="text-stone">—</span>
      )}
      {row.companyKey && row.leadLabel && (
        <Link
          href={`/accounts/${encodeURIComponent(row.companyKey)}`}
          className="truncate text-[11px] text-stone underline-offset-2 hover:underline"
        >
          Account
        </Link>
      )}
    </span>
  )
}
