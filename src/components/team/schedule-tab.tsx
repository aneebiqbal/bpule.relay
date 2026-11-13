'use client'

/**
 * Operator schedule — the time-aware responsibility surface for ONE person.
 *
 * Shows who is working each channel profile now, who is next, and any coverage
 * gap. Admins edit the shift set in one review step; saving replaces the rep's
 * active rows, so a resubmit can never create a second seat.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from 'cn'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { V4Chip, V4Panel, V4PanelHeader } from '@/components/v4/primitives'
import { ChannelBadge } from '@/components/ui/channel-badge'
import { formatClock } from '@/lib/schedules/model'
import type { ScheduleInput } from '@/lib/schedules/model'

export interface OperatorStatus {
  current: Array<{ repId: string; repName: string | null; startMinutes: number; endMinutes: number; crossesMidnight: boolean }>
  next: { repId: string; repName: string | null; startMinutes: number; endMinutes: number } | null
  gaps: Array<{ start: string; end: string; minutes: number }>
}

interface ScheduleTabProps {
  model: {
    personName: string
    channels: Array<{ profileId: string; identityId: string; channel: string; identityName: string }>
  }
  canManage: boolean
  reps: Array<{ id: string; name: string }>
  schedules: ScheduleInput[]
  operatorStatus: Record<string, OperatorStatus>
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function shiftLabel(startMinutes: number, endMinutes: number): string {
  return `${formatClock(startMinutes)}–${formatClock(endMinutes)}`
}

function repName(reps: Array<{ id: string; name: string }>, id: string, fallback?: string | null): string {
  return reps.find((rep) => rep.id === id)?.name ?? fallback ?? 'Unknown'
}

export function ScheduleTab({ model, canManage, reps, schedules, operatorStatus }: ScheduleTabProps) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)

  const byProfile = useMemo(() => {
    const map = new Map<string, ScheduleInput[]>()
    for (const row of schedules) {
      const list = map.get(row.profileId) ?? []
      list.push(row)
      map.set(row.profileId, list)
    }
    return map
  }, [schedules])

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-stone">
        One shared plan per channel. Shifts decide who is executable at a given time — they never change ownership.
      </p>
      {model.channels.length === 0 && (
        <V4Panel>
          <V4PanelHeader eyebrow="Schedule" title="No channels yet" />
          <p className="mt-3 text-[12px] text-stone">
            Schedules are per channel. Add a channel to make this person time-aware.
          </p>
        </V4Panel>
      )}
      {model.channels.map((channel) => {
        const status = operatorStatus[channel.profileId]
        const rows = byProfile.get(channel.profileId) ?? []
        return (
          <V4Panel key={channel.identityId}>
            <V4PanelHeader
              eyebrow="Schedule"
              title={<ChannelBadge channel={channel.channel} />}
              hint={channel.identityName}
              action={
                canManage ? (
                  <button
                    type="button"
                    onClick={() => setEditing(channel.profileId)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone"
                  >
                    <Pencil className="size-3" aria-hidden />
                    Edit schedule
                  </button>
                ) : undefined
              }
            />

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-bone p-3 ring-1 ring-line/70">
                <p className="text-[10px] uppercase tracking-[0.12em] text-stone">Working now</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {status && status.current.length > 0 ? (
                    status.current.map((row) => (
                      <V4Chip key={row.repId}>{repName(reps, row.repId, row.repName)}</V4Chip>
                    ))
                  ) : (
                    <span className="text-[12px] text-stone">No active operator</span>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-bone p-3 ring-1 ring-line/70">
                <p className="text-[10px] uppercase tracking-[0.12em] text-stone">Next shift</p>
                <p className="mt-1.5 text-[13px] text-ink">
                  {status?.next
                    ? `${repName(reps, status.next.repId, status.next.repName)} · ${shiftLabel(status.next.startMinutes, status.next.endMinutes)}`
                    : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-bone p-3 ring-1 ring-line/70">
                <p className="text-[10px] uppercase tracking-[0-0.12em] text-stone">24h coverage</p>
                <p className={cn('mt-1.5 text-[13px]', status && status.gaps.length === 0 ? 'text-ink' : 'text-warning')}>
                  {status && status.gaps.length === 0
                    ? 'Continuous'
                    : status && status.gaps.length > 0
                      ? `Gap ${Math.round(status.gaps.reduce((sum, gap) => sum + gap.minutes, 0) / 60)}h`
                      : '—'}
                </p>
              </div>
            </div>

            {rows.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="text-ink">{repName(reps, row.repId)}</span>
                    <span className="tabular-nums text-graphite">{shiftLabel(
                      parseMinutes(row.startTime),
                      parseMinutes(row.endTime),
                    )}</span>
                    <span className="text-[11px] text-stone">
                      {row.daysOfWeek.length === 7
                        ? 'Every day'
                        : [...row.daysOfWeek].sort((a, b) => a - b).map((day) => DAY_LABELS[day]).join(' ')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[12px] text-stone">No shifts scheduled. The plan is still shared by every operator.</p>
            )}
          </V4Panel>
        )
      })}

      <ScheduleEditor
        open={editing !== null}
        onClose={() => setEditing(null)}
        profileId={editing}
        reps={reps}
        initial={editing ? byProfile.get(editing) ?? [] : []}
        onSaved={() => {
          setEditing(null)
          router.refresh()
        }}
      />
    </div>
  )
}

function parseMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours || 0) * 60 + (minutes || 0)
}

interface DraftShift {
  repId: string
  startTime: string
  endTime: string
  daysOfWeek: number[]
}

function ScheduleEditor({
  open,
  onClose,
  profileId,
  reps,
  initial,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  profileId: string | null
  reps: Array<{ id: string; name: string }>
  initial: ScheduleInput[]
  onSaved: () => void
}) {
  const [shifts, setShifts] = useState<DraftShift[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed the draft whenever a different profile is opened.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (open && seededFor !== profileId) {
    setSeededFor(profileId)
    setShifts(
      initial.map((row) => ({
        repId: row.repId,
        startTime: row.startTime,
        endTime: row.endTime,
        daysOfWeek: [...row.daysOfWeek],
      })),
    )
    setError(null)
  }

  function update(index: number, patch: Partial<DraftShift>) {
    setShifts((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function save() {
    if (!profileId) return
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/team/profiles/${profileId}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shifts }),
    }).catch(() => null)
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}))
      setError(body?.error ?? 'Could not save the schedule')
      setBusy(false)
      return
    }
    setBusy(false)
    onSaved()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Edit schedule" description="Shifts decide who is executable when. Ownership is unchanged.">
      <div className="mt-4 space-y-3">
        {shifts.length === 0 && (
          <p className="text-[12px] text-stone">No shifts. Add one to make this profile time-aware.</p>
        )}
        {shifts.map((shift, index) => (
          <div key={index} className="rounded-xl bg-bone p-3 ring-1 ring-line/70">
            <div className="flex items-center gap-2">
              <select
                aria-label="Operator"
                value={shift.repId}
                onChange={(event) => update(index, { repId: event.target.value })}
                className="flex-1 rounded-lg border border-line bg-bone-raised px-2 py-1.5 text-[13px] text-ink"
              >
                <option value="">Select operator</option>
                {reps.map((rep) => (
                  <option key={rep.id} value={rep.id}>{rep.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShifts((current) => current.filter((_, i) => i !== index))}
                aria-label="Remove shift"
                className="rounded-lg p-1.5 text-stone transition-colors hover:bg-bone hover:text-ink"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="time"
                aria-label="Start time"
                value={shift.startTime}
                onChange={(event) => update(index, { startTime: event.target.value })}
                className="rounded-lg border border-line bg-bone-raised px-2 py-1.5 text-[13px] tabular-nums text-ink"
              />
              <span className="text-[12px] text-stone">to</span>
              <input
                type="time"
                aria-label="End time"
                value={shift.endTime}
                onChange={(event) => update(index, { endTime: event.target.value })}
                className="rounded-lg border border-line bg-bone-raised px-2 py-1.5 text-[13px] tabular-nums text-ink"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {DAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={shift.daysOfWeek.includes(day)}
                  onClick={() =>
                    update(index, {
                      daysOfWeek: shift.daysOfWeek.includes(day)
                        ? shift.daysOfWeek.filter((d) => d !== day)
                        : [...shift.daysOfWeek, day].sort((a, b) => a - b),
                    })
                  }
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] transition-colors',
                    shift.daysOfWeek.includes(day)
                      ? 'bg-solid font-medium text-on-solid'
                      : 'bg-bone text-stone ring-1 ring-line hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setShifts((current) => [
              ...current,
              { repId: '', startTime: '08:00', endTime: '16:00', daysOfWeek: [1, 2, 3, 4, 5] },
            ])
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-[12px] font-medium text-graphite transition-colors hover:bg-bone hover:text-ink"
        >
          <Plus className="size-3.5" aria-hidden />
          Add shift
        </button>
      </div>

      {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}

      <DialogActions>
        <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy || shifts.some((shift) => !shift.repId)}>
          {busy ? 'Saving…' : 'Save schedule'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
