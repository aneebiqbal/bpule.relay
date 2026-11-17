'use client'

/**
 * Issues & Data — the reconciliation queue.
 *
 * Read-only by default. Repairs require ticking findings and pressing Apply;
 * the server re-scans and only repairs findings that still match, so a stale
 * approval cannot rewrite an assignment that changed.
 */
import { useState } from 'react'
import { cn } from 'cn'
import type { ReconcileReport, ReconcileFinding, ReconcileKind } from '@/lib/profiles/reconcile'

const LABELS: Record<ReconcileKind, string> = {
  eligibility_without_seat: 'Eligibility without a seat',
  seat_without_eligibility: 'Seat without eligibility',
  multiple_active_primaries: 'Multiple active primaries',
  seat_on_archived_identity: 'Seat on an archived channel',
  seat_on_archived_profile: 'Seat on an archived profile',
  orphaned_eligibility: 'Orphaned eligibility',
  orphaned_seat: 'Orphaned seat',
}

/** Only these are safe to repair without a human reading each record. */
const REPAIRABLE: ReconcileKind[] = ['eligibility_without_seat', 'seat_without_eligibility']

function key(finding: ReconcileFinding): string {
  return [finding.kind, finding.profileId ?? '', finding.identityId ?? '', finding.repId].join('|')
}

export function IssuesData({ report, isAdmin }: { report: ReconcileReport; isAdmin: boolean }) {
  const [current, setCurrent] = useState(report)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [filter, setFilter] = useState<'' | ReconcileKind>('')

  const findings = current.findings.filter((row) => !filter || row.kind === filter)
  const repairable = current.findings.filter((row) => REPAIRABLE.includes(row.kind))

  async function rescan() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/reconciliation')
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
      setCurrent(body.report)
      setSelected(new Set())
      setMessage('Scan refreshed.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Scan failed.')
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    if (selected.size === 0) {
      setMessage('Select at least one repairable finding.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const chosen = repairable.filter((row) => selected.has(key(row)))
      const res = await fetch('/api/admin/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approve: true, findings: chosen }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
      setCurrent(body.report)
      setSelected(new Set())
      setMessage(`Repaired ${body.applied?.length ?? 0}; skipped ${body.skipped?.length ?? 0}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Repair failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(LABELS) as ReconcileKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setFilter(filter === kind ? '' : kind)}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px] transition-colors',
              filter === kind ? 'border-line bg-bone text-ink' : 'border-line/70 text-graphite hover:text-ink',
            )}
          >
            {LABELS[kind]}
            <span className="ml-1.5 tabular-nums text-stone">{current.counts[kind]}</span>
          </button>
        ))}
      </div>

      <p className="text-[12px] text-stone">
        Scanned {current.scannedProfiles} people · {current.scannedSeats} seats · {current.scannedEligibility} eligibility rows.
        Only the two eligibility-seat mismatches are auto-repairable; everything else is listed for review.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={rescan}
          disabled={busy || !isAdmin}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-graphite hover:text-ink disabled:opacity-50"
        >
          Re-scan
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={busy || !isAdmin || selected.size === 0}
          className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          Apply approved ({selected.size})
        </button>
        {message && <span className="text-[12px] text-graphite">{message}</span>}
      </div>

      {findings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-graphite">
          No findings in this view.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {findings.map((finding) => {
            const id = key(finding)
            const canRepair = REPAIRABLE.includes(finding.kind)
            return (
              <li key={id} className="flex items-start gap-3 rounded-lg border border-line bg-bone px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  disabled={!canRepair || !isAdmin}
                  onChange={(event) =>
                    setSelected((prev) => {
                      const next = new Set(prev)
                      if (event.target.checked) next.add(id)
                      else next.delete(id)
                      return next
                    })
                  }
                  className="mt-0.5 size-4 accent-orange disabled:opacity-40"
                  aria-label={`Select ${LABELS[finding.kind]}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{LABELS[finding.kind]}</p>
                  <p className="truncate text-[12px] text-graphite">{finding.detail}</p>
                  <p className="text-[11px] text-stone">
                    {finding.profileId ? `Profile ${finding.profileId.slice(0, 8)}` : 'No profile'}
                    {finding.identityId ? ` · Channel ${finding.identityId.slice(0, 8)}` : ''}
                    {finding.repId ? ` · Rep ${finding.repId.slice(0, 8)}` : ''}
                  </p>
                </div>
                {!canRepair && <span className="text-[11px] text-stone">Review manually</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
