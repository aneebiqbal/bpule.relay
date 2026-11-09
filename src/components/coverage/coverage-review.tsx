import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
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

function ExceptionPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <V4Panel>
      <V4PanelHeader eyebrow="Coverage" title={title} />
      <div className="mt-3">{children}</div>
    </V4Panel>
  )
}

/**
 * Coverage — exception-first.
 *
 * The page answers "what needs action?" and hides healthy profiles unless the
 * admin expands them. It is not a second profile directory: every row links to
 * the person's operating center for the actual work.
 */
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
  const active = plan.profiles.filter((profile) => profile.activeCoveringRepId)
  const uncovered = plan.profiles.filter(
    (profile) => profile.status === 'UNCOVERED' || !profile.primaryRepId,
  )
  const readinessBlockers = plan.profiles.filter(
    (profile) => !profile.primaryReady || profile.backups.some((backup) => !backup.ready),
  )
  const recent = review.rows.slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-mono-medium text-[10px] uppercase tracking-[0.18em] text-stone">Team / Coverage</p>
          <h1 className="mt-1 text-[24px] font-light tracking-[-0.02em] text-ink">Coverage exceptions</h1>
          <p className="mt-1 text-[13px] text-graphite">
            {formatDate(from)} – {formatDate(to)} · {plan.counts.UNCOVERED + plan.counts.AT_RISK} need
            attention · {active.length} active cover{active.length === 1 ? '' : 'age'}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone"
        >
          Back to Command Center <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <ExceptionPanel title="Action required">
        {plan.requiresApproval.length === 0 && uncovered.length === 0 ? (
          <V4Empty
            title="No coverage changes needed"
            body="Every profile is covered by its primary rep. Leave coverage appears here automatically."
          />
        ) : (
          <ul className="space-y-2">
            {plan.requiresApproval.map((item) => (
              <li
                key={`${item.profileId}:${item.kind}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bone px-4 py-3 ring-1 ring-line/70"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">{item.profileName}</p>
                  <p className="text-[12px] text-graphite">
                    {item.kind === 'RESTORE_PRIMARY'
                      ? `Restore ${item.toRepName}`
                      : `Recommended cover: ${item.toRepName}`}
                    {' · '}
                    {item.reason}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/team/profiles/${item.profileId}`}
                    className="rounded-lg border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
                  >
                    Open profile
                  </Link>
                  <Link
                    href="/dashboard"
                    className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid"
                  >
                    {item.kind === 'RESTORE_PRIMARY' ? 'Restore primary' : 'Review'}
                  </Link>
                </div>
              </li>
            ))}
            {uncovered
              .filter((profile) => !plan.requiresApproval.some((item) => item.profileId === profile.profileId))
              .map((profile) => (
                <li
                  key={profile.profileId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-bone px-4 py-3 ring-1 ring-line/70"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">{profile.name}</p>
                    <p className="text-[12px] text-status-warning">
                      {profile.primaryRepName ? 'At risk — primary unavailable' : 'No primary operator'}
                    </p>
                  </div>
                  <Link
                    href={`/team/profiles/${profile.profileId}`}
                    className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid"
                  >
                    Open profile
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </ExceptionPanel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExceptionPanel title="Active coverage">
          {active.length === 0 ? (
            <p className="text-[12px] text-stone">No temporary cover is active.</p>
          ) : (
            <ul className="space-y-2">
              {active.map((profile) => (
                <li key={profile.profileId} className="rounded-xl bg-bone px-4 py-3 ring-1 ring-line/70">
                  <p className="text-[13px] font-medium text-ink">{profile.name}</p>
                  <p className="text-[12px] text-graphite">
                    Primary {profile.primaryRepName ?? '—'} · temporarily {profile.activeCoveringRepName}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      href={`/team/profiles/${profile.profileId}`}
                      className="rounded-lg border border-line bg-bone-raised px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
                    >
                      Open profile
                    </Link>
                    <Link
                      href="/dashboard"
                      className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-bone"
                    >
                      Restore primary
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ExceptionPanel>

        <ExceptionPanel title="Readiness blockers">
          {readinessBlockers.length === 0 ? (
            <p className="text-[12px] text-status-success">Every primary and backup has confirmed access.</p>
          ) : (
            <ul className="space-y-2 text-[12px]">
              {readinessBlockers.map((profile) => (
                <li key={profile.profileId} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 text-ink">{profile.name}</span>
                  <span className="text-status-warning">
                    Primary {profile.primaryReady ? 'confirmed' : 'NOT CONFIRMED'}
                    {profile.backups.length > 0 &&
                      ` · Backups ${profile.backups.filter((backup) => backup.ready).length}/${profile.backups.length}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ExceptionPanel>
      </div>

      <ExceptionPanel title="Recent coverage history">
        {recent.length === 0 ? (
          <p className="text-[12px] text-stone">No coverage changes in this period.</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {recent.map((row) => (
              <li key={`${row.profileId}-${row.activatedAt}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[12px]">
                <span className="min-w-0 flex-1 text-ink">{row.profileName}</span>
                <span className="text-graphite">
                  {row.primaryRepName} → {row.coveringRepName}
                </span>
                <V4Chip tone={row.status === 'ACTIVE' ? 'info' : 'neutral'}>
                  {ASSIGNMENT_STATUS_LABEL[row.status] ?? row.status}
                </V4Chip>
                <span className="tabular-nums text-stone">{formatDate(row.activatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </ExceptionPanel>
    </div>
  )
}
