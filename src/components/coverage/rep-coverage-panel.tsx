'use client'

/**
 * Rep Home — "Your responsibilities today".
 *
 * One operational surface: the daily check-in/out control, explicit
 * availability, the profiles the rep owns, the profiles they are temporarily
 * covering (with the primary named and the end date), and the device-readiness
 * acknowledgement. Coverage never changes ownership — it is execution
 * responsibility, shown as such.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { cn } from 'cn'
import type { RepCoverageView } from '@/lib/coverage/load'
import type { CoverageProfileResult } from '@/lib/coverage/engine'
import {
  V4Avatar,
  V4Chip,
  V4Empty,
  V4Panel,
  V4PanelHeader,
} from '@/components/v4/primitives'

interface RepDayLike {
  businessDate?: string
  timezone?: string
  isWorkingDay?: boolean
  checkInAt?: string | null
  closedAt?: string | null
  state?: string
}

function formatTime(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const AVAILABILITY_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  WORKING: 'Working today',
  ON_LEAVE: 'On leave today',
  OFFLINE: 'Offline today',
  CHECKED_OUT: 'Day complete',
  UNAVAILABLE: 'Unavailable',
}

export function RepCoveragePanel({
  coverage,
  repDay,
}: {
  coverage: RepCoverageView | null | undefined
  repDay?: RepDayLike
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [until, setUntil] = useState('')

  async function call(key: string, init: { url: string; method: string; body?: unknown }) {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch(init.url, {
        method: init.method,
        headers: { 'Content-Type': 'application/json' },
        body: init.body ? JSON.stringify(init.body) : undefined,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Something went wrong. Please try again.')
        return
      }
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const timeZone = repDay?.timezone ?? 'UTC'
  const checkedIn = Boolean(repDay?.checkInAt)
  const closed = Boolean(repDay?.closedAt)
  const workingDay = repDay?.isWorkingDay ?? true

  const own = coverage?.own ?? []
  const covering = coverage?.covering ?? []
  const readinessByProfile = new Map((coverage?.readiness ?? []).map((row) => [row.profileId, row.ready]))
  const responsible = [...own, ...covering]

  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow="Your responsibilities today"
        title="What belongs to you, and what you are covering"
        hint={coverage ? `${own.length} own · ${covering.length} covering` : undefined}
      />

      {/* Return-to-work: what was covered while the rep was away. */}
      {coverage && coverage.returning.length > 0 && (
        <div className="mb-4 rounded-xl border border-cobalt/20 bg-cobalt/5 px-4 py-3">
          <p className="text-[13px] font-medium text-ink">Welcome back</p>
          <p className="mt-0.5 text-[12px] text-graphite">
            {coverage.returning.length} profile{coverage.returning.length === 1 ? ' was' : 's were'} covered while
            you were away.
          </p>
          <ul className="mt-2 space-y-1">
            {coverage.returning.map((row) => (
              <li key={row.profileId} className="text-[12px] text-graphite">
                <span className="font-medium text-ink">{row.profileName}</span>
                {' · covered by '}
                {row.coveringRepName}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-stone">
            Historical work stays attributed to the covering rep.
          </p>
        </div>
      )}

      {/* Daily operating control — reuses the canonical rep_day check-in/out. */}
      <div className="mt-4 rounded-xl bg-bone px-4 py-3 ring-1 ring-line/70">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink">
              {closed
                ? `Day complete · Ended ${formatTime(repDay?.closedAt ?? '', timeZone)}`
                : checkedIn
                  ? `Working today · Started ${formatTime(repDay?.checkInAt ?? '', timeZone)}`
                  : workingDay
                    ? 'You have not started your day'
                    : 'Not a working day'}
            </p>
            <p className="mt-0.5 text-[12px] text-stone">
              {coverage
                ? `Availability: ${AVAILABILITY_LABEL[coverage.availability] ?? coverage.availability}`
                : 'Availability not loaded'}
            </p>
          </div>
          {!closed && (
            <div className="flex flex-wrap items-center gap-2">
              {!checkedIn ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => call('checkin', { url: '/api/rep/day', method: 'POST' })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-solid px-3 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  Start day
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => call('close', { url: '/api/rep/day/close', method: 'POST', body: { mode: 'incomplete' } })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-bone disabled:opacity-60"
                >
                  End day
                </button>
              )}
            </div>
          )}
        </div>

        {/* Explicit availability — leave is never inferred from silence. */}
        {!closed && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Availability</span>
            <AvailabilityButton
              label="On leave today"
              active={coverage?.availability === 'ON_LEAVE'}
              disabled={busy !== null}
              onClick={() => call('leave', { url: '/api/rep/availability', method: 'POST', body: { state: 'ON_LEAVE', note: 'On leave today' } })}
            />
            <AvailabilityButton
              label="Offline today"
              active={coverage?.availability === 'OFFLINE'}
              disabled={busy !== null}
              onClick={() => call('offline', { url: '/api/rep/availability', method: 'POST', body: { state: 'OFFLINE', note: 'Offline today' } })}
            />
            <AvailabilityButton
              label="Available today"
              active={coverage?.availability === 'AVAILABLE'}
              disabled={busy !== null}
              onClick={() => call('available', { url: '/api/rep/availability', method: 'POST', body: { state: 'AVAILABLE', note: 'Available today' } })}
            />
            <label className="flex flex-wrap items-center gap-1.5 text-[12px] text-graphite">
              <span>Unavailable until</span>
              <input
                type="date"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-line bg-bone-raised px-2 py-1 text-[12px] text-ink sm:flex-none"
              />
              <button
                type="button"
                disabled={busy !== null || !until}
                onClick={() => call('unavailable', { url: '/api/rep/availability', method: 'POST', body: { state: 'UNAVAILABLE', effectiveUntil: until, note: `Unavailable until ${until}` } })}
                className="rounded-md border border-line bg-bone-raised px-2 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-bone disabled:opacity-60"
              >
                Set
              </button>
            </label>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-[12px] text-graphite">
          {error}
        </p>
      )}

      {responsible.length === 0 ? (
        <div className="mt-4">
          <V4Empty
            title="No profiles assigned"
            body="When a manager or admin assigns you a profile, it appears here before anywhere else."
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {own.map((profile) => (
            <ResponsibilityCard
              key={profile.profileId}
              profile={profile}
              kind="own"
              ready={readinessByProfile.get(profile.profileId) ?? false}
              busy={busy !== null}
              onConfirm={() => call(`ready:${profile.profileId}`, { url: '/api/rep/coverage', method: 'POST', body: { profileId: profile.profileId, note: 'I have access on this device' } })}
            />
          ))}
          {covering.map((profile) => (
            <ResponsibilityCard
              key={profile.profileId}
              profile={profile}
              kind="covering"
              ready={readinessByProfile.get(profile.profileId) ?? false}
              busy={busy !== null}
              onConfirm={() => call(`ready:${profile.profileId}`, { url: '/api/rep/coverage', method: 'POST', body: { profileId: profile.profileId, note: 'I have access on this device' } })}
            />
          ))}
        </div>
      )}
    </V4Panel>
  )
}

function AvailabilityButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-[12px] font-medium ring-1 transition-colors disabled:opacity-60',
        active
          ? 'bg-solid text-on-solid ring-solid'
          : 'bg-bone-raised text-ink ring-line hover:bg-bone',
      )}
    >
      {label}
    </button>
  )
}

function ResponsibilityCard({
  profile,
  kind,
  ready,
  busy,
  onConfirm,
}: {
  profile: CoverageProfileResult
  kind: 'own' | 'covering'
  ready: boolean
  busy: boolean
  onConfirm: () => void
}) {
  const href = profile.identityIds[0] ? `/workspace/${profile.identityIds[0]}` : '/dashboard'
  return (
    <div className="flex h-full flex-col rounded-xl bg-bone-raised p-4 ring-1 ring-line/70">
      <div className="flex items-start gap-3">
        <V4Avatar name={profile.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-ink">{profile.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {profile.channels.map((channel) => (
              <V4Chip key={channel} tone="neutral">{channel}</V4Chip>
            ))}
          </div>
        </div>
        {kind === 'covering' ? (
          <V4Chip tone="warning">Covering</V4Chip>
        ) : (
          <V4Chip tone="info">Yours</V4Chip>
        )}
      </div>

      {kind === 'covering' && (
        <p className="mt-3 text-[12px] text-graphite">
          Primary rep: <span className="font-medium text-ink">{profile.primaryRepName ?? 'Unknown'}</span>
          {' · '}
          {profile.activeCoverageUntil
            ? `Coverage until ${formatDate(profile.activeCoverageUntil)}`
            : 'Coverage open-ended'}
          {profile.coverageExpiring && <span className="text-status-warning"> · ends today</span>}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-graphite">
        <span>{profile.work.replies} replies waiting</span>
        <span>{profile.work.followUps} follow-ups due</span>
        <span>{profile.work.tasks} assigned task{profile.work.tasks === 1 ? '' : 's'}</span>
      </div>

      {/* Readiness — explicit operational confirmation, never a credential. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-3">
        {ready ? (
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-status-success">
            <span aria-hidden>✓</span> Confirmed on this device
          </p>
        ) : (
          <p className="text-[12px] text-graphite">Device access not confirmed</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {ready ? (
            <V4Chip tone="success">Ready</V4Chip>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              Confirm ready
            </button>
          )}
          <Link
            href={href}
            className="group inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-bone px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone-raised"
          >
            Continue work
            <ChevronRight className="size-3.5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  )
}
