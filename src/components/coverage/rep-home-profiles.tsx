'use client'

/**
 * Rep Home — the profile surface.
 *
 * One compact list: every profile the rep may work today, its channel, today's
 * progress and its access state. Access is confirmed in a small pop-up, never a
 * wall of cards — the rep sees one prompt and taps "I have access".
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { V4Chip, V4Empty, V4Panel, V4PanelHeader } from '@/components/v4/primitives'
import { ProfileSwitcher } from '@/components/shell/profile-switcher'
import type { RepCoverageView } from '@/lib/coverage/load'
import type { ProfileToday } from '@/lib/rep-home/profile-completion'

export function RepHomeProfiles({
  coverage,
  profilesToday,
  role,
}: {
  coverage?: RepCoverageView | null
  profilesToday?: ProfileToday[]
  role: 'admin' | 'rep' | 'sourcer' | 'manager'
}) {
  const router = useRouter()
  const [pending, setPending] = useState<{ profileId: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const own = coverage?.own ?? []
  const covering = coverage?.covering ?? []
  const readiness = new Map((coverage?.readiness ?? []).map((row) => [row.profileId, row.ready]))
  const progressById = new Map((profilesToday ?? []).map((profile) => [profile.profileId, profile]))
  const unvalidated = own.filter((profile) => !readiness.get(profile.profileId))

  async function confirmAccess() {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/rep/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: pending.profileId, note: 'I have access on this device' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not confirm access. Try again.')
        return
      }
      setPending(null)
      router.refresh()
    } catch {
      setError('Network error. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow="Your profiles"
        title="Who you write as today"
        hint={
          own.length === 0
            ? 'No profile assigned'
            : `${own.length} assigned · ${unvalidated.length === 0 ? 'all confirmed' : `${unvalidated.length} access${unvalidated.length === 1 ? '' : 'es'} to confirm`}`
        }
        action={<ProfileSwitcher role={role} />}
      />

      {unvalidated.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-status-warning/30 bg-status-warning/5 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink">Confirm profile access</p>
            <p className="text-[12px] text-graphite">
              {unvalidated.map((profile) => profile.name).join(', ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPending({ profileId: unvalidated[0].profileId, name: unvalidated[0].name })}
            className="shrink-0 rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98]"
          >
            Confirm access
          </button>
        </div>
      )}

      {own.length === 0 ? (
        <div className="mt-4">
          <V4Empty
            title="No profiles assigned"
            body="When a manager or admin assigns you a profile, it appears here. Until then you can still analyze a prospect."
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line/70 overflow-hidden rounded-xl ring-1 ring-line">
          {own.map((profile) => {
            const progress = progressById.get(profile.profileId)
            const ready = readiness.get(profile.profileId) ?? false
            const href = profile.identityIds[0] ? `/workspace/${profile.identityIds[0]}` : '/dashboard'
            return (
              <li key={profile.profileId}>
                <Link
                  href={href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bone"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{profile.name}</p>
                    <p className="mt-0.5 text-[11px] text-stone">
                      {profile.channels.join(' · ') || 'No channel'}
                      <span className="text-line"> · </span>
                      {progress
                        ? `${progress.completedCount} / ${progress.targetCount} today`
                        : 'No daily target'}
                    </p>
                  </div>
                  {ready ? (
                    <V4Chip tone="success">Ready</V4Chip>
                  ) : (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setPending({ profileId: profile.profileId, name: profile.name })
                      }}
                      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-status-warning ring-1 ring-status-warning/30 transition-colors hover:bg-status-warning/10"
                    >
                      Confirm access
                    </button>
                  )}
                  <ChevronRight className="size-3.5 shrink-0 text-stone" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {covering.length > 0 && (
        <div className="mt-4 border-t border-line/70 pt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
            Covering today
          </p>
          <ul className="space-y-1.5">
            {covering.map((profile) => (
              <li key={profile.profileId} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-ink">{profile.name}</span>
                <span className="shrink-0 text-stone">
                  for {profile.primaryRepName ?? 'primary'}
                  {profile.activeCoverageUntil ? ` · until ${profile.activeCoverageUntil.slice(5)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Profile access"
        description={
          pending
            ? `Do you have ${pending.name} logged in on this device? Confirming lets you send and reply from it today.`
            : undefined
        }
      >
        {error && (
          <p role="alert" className="mb-3 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
            {error}
          </p>
        )}
        <div className="rounded-xl bg-bone px-4 py-3 text-[12px] text-graphite ring-1 ring-line/70">
          Relay never stores passwords or session cookies — this is an operational confirmation only.
        </div>
        <DialogActions className="mt-5">
          <button
            type="button"
            onClick={() => setPending(null)}
            className="rounded-lg border border-line bg-bone-raised px-4 py-2 text-[13px] font-medium text-graphite transition-colors hover:text-ink"
          >
            Not yet
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmAccess()}
            className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? 'Confirming…' : 'Yes, I have access'}
          </button>
        </DialogActions>
      </Dialog>
    </V4Panel>
  )
}
