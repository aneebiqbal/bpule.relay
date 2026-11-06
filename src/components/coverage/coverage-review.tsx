import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import type { CoveragePlan } from '@/lib/coverage/engine'
import type { CoverageReview } from '@/lib/coverage/load'
import {
  V4Chip,
  V4Empty,
  V4Panel,
  V4PanelHeader,
} from '@/components/v4/primitives'

const STATUS_TONE: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  COVERED: 'success',
  BACKUP_ACTIVE: 'info',
  AT_RISK: 'warning',
  UNCOVERED: 'danger',
}

const STATUS_LABEL: Record<string, string> = {
  COVERED: 'Covered',
  BACKUP_ACTIVE: 'Backup active',
  AT_RISK: 'At risk',
  UNCOVERED: 'Uncovered',
}

const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function CoverageReviewView({
  review,
  plan,
  from,
  to,
}: {
  review: CoverageReview
  plan: CoveragePlan
  from: string
  to: string
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">
            Team / Coverage
          </p>
          <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">Weekly coverage review</h1>
          <p className="mt-1 text-[13px] text-graphite">
            {formatDate(from)} – {formatDate(to)} · {review.rows.length} coverage change
                {review.rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
        >
          Back to Command Center <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="Activations" value={review.totals.activations} />
        <Fact label="Restores" value={review.totals.restores} />
        <Fact label="Revocations" value={review.totals.revocations} />
        <Fact label="Backup active now" value={review.totals.backupActiveNow} tone="text-cobalt" />
        <Fact label="Uncovered now" value={review.totals.uncoveredNow} tone="text-[#8f2b1e]" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <V4Panel>
            <V4PanelHeader
              eyebrow="Coverage changes"
              title="Who covered what"
              hint="Latest first"
            />
            {review.rows.length === 0 ? (
              <div className="mt-4">
                <V4Empty
                  title="No coverage changes in this period"
                  body="Leave coverage and return-to-work restores are recorded here with who approved them."
                />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-[0.14em] text-stone">
                      <th className="py-2 pr-3 font-medium">Profile</th>
                      <th className="py-2 pr-3 font-medium">Primary</th>
                      <th className="py-2 pr-3 font-medium">Covering</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Activated</th>
                      <th className="py-2 font-medium">Until</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {review.rows.map((row) => (
                      <tr key={`${row.profileId}-${row.activatedAt}`} className="align-top">
                        <td className="py-2.5 pr-3">
                          <Link href={`/team/profiles/${row.profileId}`} className="font-medium text-ink hover:underline">
                            {row.profileName}
                          </Link>
                          <span className="block text-[10px] uppercase tracking-[0.12em] text-stone">
                            {row.channels.join(' + ')}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-graphite">{row.primaryRepName}</td>
                        <td className="py-2.5 pr-3 text-graphite">{row.coveringRepName}</td>
                        <td className="py-2.5 pr-3">
                          <V4Chip tone={row.status === 'ACTIVE' ? 'info' : 'neutral'}>
                            {ASSIGNMENT_STATUS_LABEL[row.status] ?? row.status}
                          </V4Chip>
                        </td>
                        <td className="py-2.5 pr-3 tabular-nums text-graphite">{formatDate(row.activatedAt)}</td>
                        <td className="py-2.5 tabular-nums text-graphite">{formatDate(row.effectiveUntil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </V4Panel>
        </div>

        <div className="lg:col-span-5">
          <V4Panel>
            <V4PanelHeader
              eyebrow="Overload signal"
              title="Coverage carried per rep"
              hint="Handled this period · active now"
            />
            {review.coverageLoad.length === 0 ? (
              <p className="mt-4 text-[12px] text-stone">No coverage carried in this period.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {review.coverageLoad.map((row) => (
                  <li key={row.repId} className="flex items-center gap-3 text-[12px]">
                    <span className="min-w-0 flex-1 truncate text-ink">{row.name}</span>
                    <span className="text-graphite">
                      {row.handled} handled · {row.active} active
                    </span>
                    {row.handled >= 3 && <V4Chip tone="warning">Repeated</V4Chip>}
                  </li>
                ))}
              </ul>
            )}
          </V4Panel>

          <V4Panel>
            <V4PanelHeader
              eyebrow="Readiness"
              title="Access confirmed"
              hint="Primaries and backups that can work today"
            />
            {plan.profiles.every((p) => p.primaryReady) &&
            plan.profiles.every((p) => p.backups.every((b) => b.ready)) ? (
              <p className="mt-4 text-[12px] text-status-success">Every primary and backup has confirmed access.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {plan.profiles
                  .filter((p) => !p.primaryReady || p.backups.some((b) => !b.ready))
                  .map((p) => (
                    <li key={p.profileId} className="text-[12px]">
                      <span className="font-medium text-ink">{p.name}</span>
                      <span className="ml-2 text-[10px] uppercase tracking-[0.12em] text-stone">
                        {p.channels.join(' + ')}
                      </span>
                      <span className="block text-graphite">
                        Primary {p.primaryRepName ?? '—'}:{' '}
                        <span className={p.primaryReady ? 'text-status-success' : 'text-status-warning'}>
                          {p.primaryReady ? 'confirmed' : 'NOT CONFIRMED'}
                        </span>
                        {p.backups.length > 0 && (
                          <>
                            {' · '}Backups{' '}
                            <span className={p.backups.every((b) => b.ready) ? 'text-status-success' : 'text-status-warning'}>
                              {p.backups.filter((b) => b.ready).length}/{p.backups.length} confirmed
                            </span>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </V4Panel>

          <V4Panel className="mt-4">
            <V4PanelHeader eyebrow="Today" title="Profile coverage" />
            <ul className="mt-3 space-y-1.5">
              {plan.profiles.map((profile) => (
                <li key={profile.profileId} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                  <span className="min-w-0 flex-1 truncate text-ink">{profile.name}</span>
                  <span className="text-graphite">
                    {profile.primaryRepName ?? 'No primary'}
                    {profile.activeCoveringRepName ? ` · ${profile.activeCoveringRepName}` : ''}
                  </span>
                  <V4Chip tone={STATUS_TONE[profile.status] ?? 'neutral'}>
                    {STATUS_LABEL[profile.status] ?? profile.status}
                  </V4Chip>
                </li>
              ))}
            </ul>
          </V4Panel>
        </div>
      </div>
    </div>
  )
}

function Fact({ label, value, tone = 'text-ink' }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-bone px-3 py-2.5 ring-1 ring-line/70">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone">{label}</p>
      <p className={cn('mt-1 text-[18px] font-medium leading-none tabular-nums', tone)}>{value}</p>
    </div>
  )
}
