'use client'

/**
 * Rep Home — profile responsibilities.
 *
 * The profiles are the primary object: who the rep writes as today, whether
 * they are primary or covering, and the work attached to each. Readiness is
 * interruptive, not a section — one compact warning opens a dialog that walks
 * the rep through each unconfirmed profile.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { V4Avatar, V4Panel, V4PanelHeader } from '@/components/v4/primitives'
import { ProfileSwitcher } from '@/components/shell/profile-switcher'
import type { RepCoverageView } from '@/lib/coverage/load'
import type { CoverageProfileResult } from '@/lib/coverage/engine'
import type { ProfileToday } from '@/lib/rep-home/profile-completion'

const ACTION =
  'inline-flex items-center gap-1 rounded-md border border-line bg-bone px-2 py-1 text-[11px] font-medium text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40'

/** The human reason a rep is covering — the primary's own availability. */
const COVERING_REASON: Record<string, string> = {
  AVAILABLE: 'primary available',
  WORKING: 'primary working',
  ON_LEAVE: 'primary on leave',
  OFFLINE: 'primary offline',
  CHECKED_OUT: 'primary checked out',
  UNAVAILABLE: 'primary unavailable',
}

function formatDate(date: string | null): string {
  if (!date) return ''
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
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
  const responsible = [...own, ...covering]
  const unvalidated = responsible.filter((profile) => !readiness.get(profile.profileId))

  function openReview() {
    setQueue(unvalidated)
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

  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow="Your profiles today"
        title="Who you write as"
        hint={coverage ? `${own.length} own · ${covering.length} covering` : undefined}
        action={<ProfileSwitcher role={role} />}
      />

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
              {unvalidated.map((profile) => profile.name).join(', ')}
            </span>
          </span>
          <span className="shrink-0 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid">
            Review
          </span>
        </button>
      )}

      {responsible.length === 0 ? (
        <p className="mt-4 text-[13px] text-graphite">No profiles assigned yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {own.map((profile) => (
            <ProfileRow
              key={profile.profileId}
              profile={profile}
              kind="own"
              progress={progressById.get(profile.profileId)}
            />
          ))}
          {covering.map((profile) => (
            <ProfileRow
              key={profile.profileId}
              profile={profile}
              kind="covering"
              progress={progressById.get(profile.profileId)}
            />
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
            <p className="text-[12px] text-graphite">{current.channels.join(' · ')}</p>
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
            href="/team/coverage"
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

function ProfileRow({
  profile,
  kind,
  progress,
}: {
  profile: CoverageProfileResult
  kind: 'own' | 'covering'
  progress?: ProfileToday
}) {
  const isLinkedIn = profile.channels.includes('linkedin')
  const isUpwork = profile.channels.includes('upwork')
  const continueHref = profile.identityIds[0] ? `/workspace/${profile.identityIds[0]}` : '/dashboard'
  const done = progress?.completedCount ?? 0
  const target = progress?.targetCount ?? 0
  const remaining = progress?.remaining ?? 0
  const replies = profile.work?.replies ?? 0
  const followUps = profile.work?.followUps ?? 0

  return (
    <li className="rounded-xl bg-bone-raised p-3 ring-1 ring-line/70">
      <div className="flex items-start gap-3">
        <V4Avatar name={profile.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">{profile.name}</p>
          <p className="text-[11px] text-stone">{profile.channels.join(' · ') || 'No channel'}</p>
          <p className="mt-1 text-[12px] text-graphite">
            {kind === 'covering' ? (
              <>
                Covering for {profile.primaryRepName ?? 'primary'}
                {profile.primaryAvailability
                  ? ` · ${COVERING_REASON[profile.primaryAvailability] ?? profile.primaryAvailability.toLowerCase()}`
                  : ''}
                {profile.activeCoverageUntil ? ` · until ${formatDate(profile.activeCoverageUntil)}` : ''}
              </>
            ) : (
              'Primary'
            )}
          </p>
          <p className="mt-0.5 text-[12px] text-graphite">
            {target > 0 ? (
              <>
                <span className="font-medium text-ink">{done}</span>
                <span className="text-stone"> / {target} done</span>
                <span className="text-stone"> · </span>
                <span className="font-medium text-ink">{remaining}</span>
                <span className="text-stone"> remaining</span>
              </>
            ) : (
              <span className="text-stone">No daily target</span>
            )}
            {replies > 0 && (
              <>
                <span className="text-stone"> · </span>
                <span className="text-status-warning">{replies} waiting</span>
              </>
            )}
            {followUps > 0 && (
              <>
                <span className="text-stone"> · </span>
                <span>{followUps} follow-ups</span>
              </>
            )}
          </p>
        </div>
        <Link
          href={continueHref}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-solid px-2.5 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40"
        >
          Continue
          <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
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
