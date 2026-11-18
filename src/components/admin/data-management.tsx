'use client'

/**
 * Data Management — duplicate candidates, dependency inspection and gated
 * deletion.
 *
 * Deletion is never implicit: the admin picks a record, reads exactly what
 * references it, and the server re-checks every count before deleting. A
 * protected record is refused with its blockers.
 */
import { useCallback, useEffect, useState } from 'react'
import { cn } from 'cn'
import { ChannelBadge } from '@/components/ui/channel-badge'
import type { TeamProfileDirectoryRow } from '@/lib/team/profiles'

interface Duplicate {
  identityName: string
  channel: string
  identities: Array<{ id: string; profileId: string | null; status: string | null }>
}

interface Report {
  counts: Record<string, number>
  protected: boolean
  blockers: string[]
}

const LABELS: Record<string, string> = {
  assignments: 'Operator assignments',
  leads: 'Leads',
  messages: 'Messages',
  tasks: 'Tasks',
  targets: 'Targets',
  knowledge: 'Knowledge entries',
  audit: 'Audit events',
}

export function DataManagement({ profiles }: { profiles: TeamProfileDirectoryRow[] }) {
  const [duplicates, setDuplicates] = useState<Duplicate[]>([])
  const [selected, setSelected] = useState<string>('')
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const archived = profiles
    .flatMap((profile) => profile.channelDetails)
    .filter((channel) => channel.status !== 'active')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/data-management')
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
      setDuplicates(body.duplicates ?? [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load duplicates.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!selected) {
      setReport(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/admin/data-management?identityId=${encodeURIComponent(selected)}`)
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
        if (!cancelled) setReport(body.report)
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Could not inspect dependencies.')
      }
    })()
    return () => { cancelled = true }
  }, [selected])

  async function remove() {
    if (!report || report.protected) return
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/data-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identityId: selected, confirm: true }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
      setMessage('Record deleted.')
      setSelected('')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-[12px] text-stone">
        {loading
          ? 'Scanning…'
          : `${duplicates.length} duplicate candidate group${duplicates.length === 1 ? '' : 's'} · ${archived.length} non-active channel${archived.length === 1 ? '' : 's'}`}
        {' · '}Nothing is merged or deleted automatically.
      </p>

      {archived.length > 0 && (
        <section>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Non-active channels</p>
          <ul className="mt-1.5 space-y-1">
            {archived.map((channel) => (
              <li key={channel.identityId} className="flex items-center gap-2 rounded-lg border border-line bg-bone px-3 py-2">
                <ChannelBadge channel={channel.channel} />
                <span className="flex-1 truncate text-[13px] text-ink">{channel.identityName}</span>
                <span className="text-[11px] uppercase tracking-[0.1em] text-stone">{channel.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">Duplicate candidates</p>
        {duplicates.length === 0 ? (
          <p className="mt-1.5 rounded-lg border border-dashed border-line px-3 py-4 text-center text-[13px] text-graphite">
            No two channels share the same name and platform.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {duplicates.map((group) => (
              <li key={`${group.identityName}|${group.channel}`} className="rounded-lg border border-line bg-bone px-3 py-2">
                <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
                  <span className="font-medium">{group.identityName}</span>
                  <ChannelBadge channel={group.channel} />
                  <span className="text-stone">× {group.identities.length}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.identities.map((identity) => (
                    <button
                      key={identity.id}
                      type="button"
                      onClick={() => setSelected(identity.id === selected ? '' : identity.id)}
                      aria-pressed={selected === identity.id}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        selected === identity.id ? 'border-line bg-bone-raised text-ink' : 'border-line/70 text-graphite hover:text-ink',
                      )}
                    >
                      {identity.id.slice(0, 8)} · {identity.status ?? 'unknown'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && report && (
        <section className="rounded-xl border border-line bg-bone p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone">
            Dependencies for {selected.slice(0, 8)}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {Object.entries(report.counts).map(([key, value]) => (
              <li key={key} className="rounded-lg border border-line px-2 py-1.5">
                <p className="text-[11px] text-stone">{LABELS[key] ?? key}</p>
                <p className={cn('text-[15px] tabular-nums', value > 0 ? 'text-status-danger' : 'text-ink')}>{value}</p>
              </li>
            ))}
          </ul>
          {report.protected ? (
            <p className="mt-2 rounded-lg border border-status-warning/30 bg-status-warning/5 px-3 py-2 text-[12px] text-graphite">
              Cannot be permanently deleted — referenced by {report.blockers.map((key) => LABELS[key] ?? key).join(', ')}.
              Archive it instead so the history stays intact.
            </p>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[12px] text-graphite">No protected dependencies. Permanent deletion is allowed.</p>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          )}
        </section>
      )}

      {message && <p className="text-[12px] text-graphite">{message}</p>}
    </div>
  )
}
