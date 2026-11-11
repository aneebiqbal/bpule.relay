'use client'

/**
 * Rep Home — today by profile.
 *
 * One progress-first execution card per executable profile: what is left, what
 * needs attention, and whether the day is on track. Readiness stays a single
 * interruptive warning, never a per-card control.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { ChannelBadge } from '@/components/ui/channel-badge'
import { V4Avatar, V4Chip, V4Panel, V4PanelHeader } from '@/components/v4/primitives'
import { ProfileSwitcher } from '@/components/shell/profile-switcher'
import type { RepCoverageView } from '@/lib/coverage/load'
import type { CoverageProfileResult } from '@/lib/coverage/engine'
import type { ProfileToday } from '@/lib/rep-home/profile-completion'
import {
  buildActivityBreakdown,
  buildAttentionLine,
  buildProfileCards,
  ownershipLine,
  statusLabel,
  statusTone,
  summarizeProfileCards,
  type AttentionPart,
  type ProfileCardModel,
  type ProfileCardTone,
} from '@/lib/rep-home/profile-card-view'

const ACTION =
  'inline-flex items-center gap-1 rounded-md border border-line bg-bone px-2 py-1 text-[11px] font-medium text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40'

const CONTINUE =
  'inline-flex items-center gap-1 rounded-lg bg-solid px-2.5 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40'

function formatDate(date: string | null): string {
  if (!date) return ''
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function barTone(tone: ProfileCardTone): string {
  switch (tone) {
    case 'success':
      return 'bg-status-success'
    case 'warning':
      return 'bg-status-warning'
    case 'danger':
      return 'bg-status-danger'
    case 'info':
      return 'bg-orange'
    default:
      return 'bg-stone'
  }
}

export function RepProfilesToday({
  coverage,
  profilesToday,
  role,
}: {
  coverage?: RepCoverageView | null
  profilesToday?: ProfileToday[]
  role: 'admin' | 'rep' | 'sourcer' | 'manager'
}) {
  const router = useRouter()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [queue, setQueue] = useState<CoverageProfileResult[]>([])
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const own = coverage?.own ?? []
  const covering = coverage?.covering ?? []
  const readiness = new Map((coverage?.readiness ?? []).map((row) => [row.profileId, row.ready]))
  const progressById = new Map((profilesToday ?? []).map((profile) => [profile.profileId, profile]))
  const cards = buildProfileCards(
    own,
    covering,
    progressById,
    new Set(coverage?.operatorProfileIds ?? []),
  )
  const unvalidated = cards.filter((card) => !readiness.get(card.profile.profileId))
  const summary = summarizeProfileCards(cards, unvalidated.length)

  function openReview() {
    setQueue(unvalidated.map((card) => card.profile))
    setIndex(0)
    setError(null)
    setReviewOpen(true)
  }

  /** Confirm device access from the dialog — never a credential. */
  async function confirmAccess() {
    const profile = queue[index]
    if (!profile) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/rep/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: profile.profileId, note: 'I have access on this device' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not confirm access. Try again.')
        return
      }
      if (index + 1 < queue.length) {
        setIndex(index + 1)
      } else {
        setReviewOpen(false)
        router.refresh()
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const current = queue[index]
  const exceptions: string[] = []
  if (summary.behindCount > 0) {
    exceptions.push(`${summary.behindCount} profile${summary.behindCount === 1 ? '' : 's'} behind`)
  }
  if (summary.needsAccess > 0) {
    exceptions.push(`${summary.needsAccess} needs access confirmation`)
  }

  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow="Your profiles today"
        title="Today by profile"
        hint={coverage ? `${own.length} own · ${covering.length} covering` : undefined}
        action={<ProfileSwitcher role={role} />}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-bone px-3.5 py-2.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-stone">Today</span>
        {summary.totalTarget > 0 ? (
          <span className="text-[12px] text-graphite">
            <span className="font-semibold tabular-nums text-ink">
              {summary.totalCompleted} / {summary.totalTarget}
            </span>{' '}
            complete
            <span className="text-stone"> · </span>
            <span className="font-semibold tabular-nums text-ink">{summary.totalRemaining}</span> remaining
            <span className="text-stone"> · </span>
            <span className="font-semibold tabular-nums text-ink">{summary.percent}%</span>
          </span>
        ) : (
          <span className="text-[12px] text-stone">No daily plan</span>
        )}
        {exceptions.length > 0 && (
          <span className="ml-auto text-[12px] text-stone">{exceptions.join(' · ')}</span>
        )}
      </div>

      {unvalidated.length > 0 && (
        <button
          type="button"
          onClick={openReview}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3 text-left transition-colors hover:bg-status-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-ink">
              {unvalidated.length} profile{unvalidated.length === 1 ? ' needs' : 's need'} access confirmation
            </span>
            <span className="block truncate text-[12px] text-graphite">
              {unvalidated.map((card) => card.profile.name).join(', ')}
            </span>
          </span>
          <span className="shrink-0 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid">
            Review
          </span>
        </button>
      )}

      {cards.length === 0 ? (
        <p className="mt-4 text-[13px] text-graphite">No profiles assigned yet.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {cards.map((card) => (
            <ProfileCard key={card.profile.profileId} card={card} newSince={coverage?.businessDate ?? null} />
          ))}
        </ul>
      )}

      <Dialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Profile access"
        description={
          current
            ? `Do you have ${current.name} logged in on this device? Confirming lets you send and reply from it today.`
            : undefined
        }
      >
        {current && (
          <div className="rounded-xl bg-bone px-4 py-3 ring-1 ring-line/70">
            <p className="text-[13px] font-medium text-ink">{current.name}</p>
            <p className="flex flex-wrap gap-1 text-[12px] text-graphite">
              {current.channels.map((channel) => <ChannelBadge key={channel} channel={channel} />)}
            </p>
            {queue.length > 1 && (
              <p className="mt-1 text-[11px] text-stone">
                {index + 1} of {queue.length}
              </p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
            {error}
          </p>
        )}
        <div className="mt-3 rounded-xl bg-bone px-4 py-3 text-[12px] text-graphite ring-1 ring-line/70">
          Relay never stores passwords or session cookies — this is an operational confirmation only.
        </div>
        <DialogActions className="mt-5">
          <Link
            href="/team"
            onClick={() => setReviewOpen(false)}
            className="rounded-lg border border-line bg-bone-raised px-4 py-2 text-[13px] font-medium text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
          >
            Report issue
          </Link>
          <button
            type="button"
            disabled={busy || !current}
            onClick={() => void confirmAccess()}
            className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 disabled:opacity-60"
          >
            {busy ? 'Confirming…' : 'Confirm ready'}
          </button>
        </DialogActions>
      </Dialog>
    </V4Panel>
  )
}

function ProfileCard({ card, newSince }: { card: ProfileCardModel; newSince: string | null }) {
  const { profile, kind, progress } = card
  // Deterministic NEW state: the responsibility started on the current
  // operating day and access has not been confirmed yet.
  const isNew = Boolean(
    newSince && progress?.assignedAt && progress.assignedAt.slice(0, 10) === newSince,
  )
  const isLinkedIn = profile.channels.includes('linkedin')
  const isUpwork = profile.channels.includes('upwork')
  const continueHref = profile.identityIds[0] ? `/workspace/${profile.identityIds[0]}` : '/dashboard'
  const target = progress?.targetCount ?? 0
  const done = progress?.completedCount ?? 0
  // An operator shares the profile's plan: the progress bar is the PROFILE's
  // progress, and their own contribution is reported separately.
  const isOperator = card.kind === 'operator'
  const profileDone = progress?.profileCompletedCount ?? done
  const remaining = Math.max(0, target - profileDone)
  const hasTarget = target > 0
  const percent = hasTarget ? Math.min(100, Math.round((profileDone / target) * 100)) : 0
  const label = statusLabel(progress?.status ?? null, hasTarget)
  const tone = statusTone(progress?.status ?? null, hasTarget)
  const breakdown = buildActivityBreakdown(progress)
  const attention = buildAttentionLine(profile.work ?? { replies: 0, followUps: 0, tasks: 0 })
  const quiet = hasTarget && progress?.status === 'COMPLETE'
  const coveringUntil =
    kind === 'covering' && profile.activeCoverageUntil ? formatDate(profile.activeCoverageUntil) : null
  // Each attention segment deep-links to its exact Inbox dataset, preserving
  // the profile filter so the destination equals the number.
  const profileFilter = profile.identityIds[0]
    ? `&profile=${encodeURIComponent(profile.identityIds[0])}`
    : ''
  const attentionHrefFor = (kind: AttentionPart['kind']): string | null => {
    if (kind === 'replies') return `/chats?view=waiting_me${profileFilter}`
    if (kind === 'followUps') return `/chats?view=followups${profileFilter}`
    return null
  }

  return (
    <li className={cn('rounded-xl bg-bone p-3', quiet && 'opacity-70')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <V4Avatar name={profile.name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">{profile.name}</p>
            <p className="flex flex-wrap gap-1 text-[11px] text-stone">
              {profile.channels.length > 0
                ? profile.channels.map((channel) => <ChannelBadge key={channel} channel={channel} />)
                : 'No channel'}
            </p>
            <p className="mt-0.5 text-[11px] text-graphite">{ownershipLine(card, coveringUntil)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <V4Chip tone={tone}>{label}</V4Chip>
          {isNew && (
            <span className="rounded-full bg-status-info/10 px-2 py-0.5 text-[11px] font-medium text-cobalt-ink ring-1 ring-status-info/20">
              NEW
            </span>
          )}
        </div>
      </div>

      {hasTarget ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[12px] text-graphite">
              {isOperator ? (
                <>
                  <span className="text-[14px] font-semibold tabular-nums text-ink">{profileDone}</span>
                  {' '}
                  <span className="tabular-nums">/ {target}</span> profile progress
                  {' · '}
                  <span className="font-semibold tabular-nums text-ink">{done}</span> your contribution
                </>
              ) : (
                <>
                  <span className="text-[14px] font-semibold tabular-nums text-ink">{done}</span> of{' '}
                  <span className="tabular-nums">{target}</span> done today
                </>
              )}
            </p>
            <p className="shrink-0 text-[18px] font-semibold leading-none tabular-nums text-ink">
              {remaining}
              <span className="ml-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-stone">
                left
              </span>
            </p>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-bone ring-1 ring-line/70"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${profile.name} today's target completion`}
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]',
                barTone(tone),
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-stone">No daily plan</p>
      )}

      {breakdown.items.length > 0 && (
        <dl className="mt-2.5 space-y-0.5">
          {breakdown.items.map((item) => (
            <div key={item.activityType} className="flex items-baseline justify-between gap-2 text-[12px]">
              <dt className="text-graphite">{item.label}</dt>
              <dd className="tabular-nums text-ink">
                {item.profileCompletedCount} / {item.targetCount}
                {isOperator && item.completedCount > 0 ? (
                  <span className="ml-1 text-stone">· you {item.completedCount}</span>
                ) : null}
                {item.complete && <span className="ml-1 text-status-success">✓</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {breakdown.more > 0 && <div className="mt-1 text-[11px] text-stone">+{breakdown.more} more</div>}

      <p
        className={cn(
          'mt-2.5 flex items-center gap-1.5 text-[12px]',
          attention.tone === 'warning' ? 'text-status-warning' : 'text-stone',
        )}
      >
        {attention.tone === 'warning' && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
        <span className="min-w-0">
          {attention.parts.length === 0 ? (
            attention.text
          ) : (
            attention.parts.map((part, index) => {
              const href = attentionHrefFor(part.kind)
              return (
                <span key={part.kind}>
                  {index > 0 && <span> · </span>}
                  {href ? (
                    <Link
                      href={href}
                      className="underline-offset-2 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
                    >
                      {part.label}
                    </Link>
                  ) : (
                    part.label
                  )}
                </span>
              )
            })
          )}
        </span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Link href={continueHref} className={CONTINUE}>
          Continue
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
        {isLinkedIn && (
          <Link href="/chats" className={ACTION}>
            Inbox
          </Link>
        )}
        {isLinkedIn && (
          <Link href="/prospect" className={ACTION}>
            Prospect
          </Link>
        )}
        {isUpwork && (
          <Link href="/upwork" className={ACTION}>
            Jobs
          </Link>
        )}
        {isUpwork && (
          <Link href="/upwork/new" className={ACTION}>
            Proposal
          </Link>
        )}
      </div>
    </li>
  )
}
