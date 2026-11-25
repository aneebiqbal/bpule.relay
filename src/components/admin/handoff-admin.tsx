'use client'

/**
 * Admin → Handoffs. Preview every item before transferring; execute through the
 * durable /api/admin/handoff writer. Untransferable items are shown, never hidden.
 */
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { V4Empty, V4Error, V4Eyebrow, V4Panel } from '@/components/v4/primitives'
import { Button } from '@/components/ui/button'

interface Plan {
  accounts: number
  responsibilities: number
  targetUnits: number
  estimatedMinutes: number
  leads: number
  tasks: number
  followUps: number
  applications: number
  preparedFollowAccess: number
  acknowledgementsToCreate: number
  accessIssues: number
  capacityWarnings: string[]
  ineligibleReasons: string[]
  untransferable: Array<{ kind: string; count: number; reason: string }>
}

const selectClass = 'h-9 w-full rounded-md border border-line bg-bone px-2 text-[13px] text-ink outline-none focus:border-orange/50'

export function HandoffAdmin() {
  const [reps, setReps] = useState<Array<{ id: string; name: string }>>([])
  const [fromRepId, setFromRepId] = useState('')
  const [toRepId, setToRepId] = useState('')
  const [suspend, setSuspend] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/work-setup')
      .then((response) => (response.ok ? response.json() : { reps: [] }))
      .then((data: { reps?: Array<{ id: string; name: string }> }) => setReps(data.reps ?? []))
      .catch(() => {})
  }, [])

  const preview = useCallback(async () => {
    if (!fromRepId) return
    setBusy(true); setError(null); setResult(null)
    try {
      const params = new URLSearchParams({ fromRepId })
      if (toRepId) params.set('toRepId', toRepId)
      const response = await fetch(`/api/admin/handoff?${params.toString()}`, { cache: 'no-store' })
      const body = (await response.json().catch(() => ({}))) as { plan?: Plan; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Preview failed.')
      setPlan(body.plan ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed.')
    } finally {
      setBusy(false)
    }
  }, [fromRepId, toRepId])

  async function run() {
    if (!fromRepId || !toRepId) return
    setBusy(true); setError(null); setResult(null)
    try {
      const response = await fetch('/api/admin/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromRepId, toRepId, suspendFromRep: suspend }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        status?: string
        operationId?: string
        transferred?: Record<string, number>
        failedItems?: unknown[]
        error?: string
      }
      if (!response.ok) throw new Error(body.error ?? 'Handoff failed.')
      const t = body.transferred ?? {}
      const moved = Object.entries(t).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${key} ${value}`).join(', ')
      setResult(`${body.status?.toUpperCase()} · operation ${body.operationId ?? ''} · ${moved || 'nothing moved'}${body.failedItems?.length ? ` · ${body.failedItems.length} failed` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Handoff failed.')
    } finally {
      setBusy(false)
    }
  }

  const blocked = !fromRepId || !toRepId || Boolean(plan?.ineligibleReasons.length) || Boolean(plan?.capacityWarnings.length)

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <V4Eyebrow>Admin · People</V4Eyebrow>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Handoffs</h1>
      <p className="mt-2 max-w-2xl text-sm text-graphite">
        Transfer current operational ownership — seats, allocations, active leads, open tasks, application responsibility and
        acknowledgements. History, requirements and credits stay untouched.
      </p>

      {error && <div className="mt-4"><V4Error message={error} /></div>}
      {result && <p className="mt-4 rounded-lg bg-bone-raised px-3 py-2 text-xs text-graphite ring-1 ring-line" role="status">{result}</p>}

      <V4Panel className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[11px] font-medium text-stone">
            Departing rep
            <select className={`${selectClass} mt-1`} value={fromRepId} onChange={(event) => { setFromRepId(event.target.value); setPlan(null) }}>
              <option value="">Choose…</option>
              {reps.map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-stone">
            Replacement rep
            <select className={`${selectClass} mt-1`} value={toRepId} onChange={(event) => { setToRepId(event.target.value); setPlan(null) }}>
              <option value="">Choose…</option>
              {reps.filter((rep) => rep.id !== fromRepId).map((rep) => <option key={rep.id} value={rep.id}>{rep.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={busy || !fromRepId} onClick={preview}>Preview impact</Button>
          <label className="flex items-center gap-2 text-[12px] text-graphite">
            <input type="checkbox" checked={suspend} onChange={(event) => setSuspend(event.target.checked)} />
            Suspend departing rep after transfer
          </label>
        </div>
      </V4Panel>

      {plan && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <V4Panel>
            <h2 className="text-sm font-medium text-ink">Impact</h2>
            <dl className="mt-3 space-y-1.5 text-[12px] text-graphite">
              <Row label="Accounts" value={plan.accounts} />
              <Row label="Responsibilities" value={plan.responsibilities} />
              <Row label="Target units moving" value={plan.targetUnits} />
              <Row label="Estimated minutes" value={plan.estimatedMinutes} />
              <Row label="Leads" value={plan.leads} />
              <Row label="Open tasks" value={plan.tasks} />
              <Row label="Follow-ups" value={plan.followUps} />
              <Row label="Applications" value={plan.applications} />
              <Row label="Prepared work (access)" value={plan.preparedFollowAccess} />
              <Row label="New acknowledgements" value={plan.acknowledgementsToCreate} />
              <Row label="Access issues" value={plan.accessIssues} />
            </dl>
          </V4Panel>
          <div className="space-y-4 lg:col-span-2">
            {(plan.capacityWarnings.length > 0 || plan.ineligibleReasons.length > 0) && (
              <V4Panel>
                <h2 className="flex items-center gap-2 text-sm font-medium text-ink"><TriangleAlert className="size-4 text-status-warning" aria-hidden /> Review required</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-graphite">
                  {plan.ineligibleReasons.map((line) => <li key={line}>{line}</li>)}
                  {plan.capacityWarnings.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </V4Panel>
            )}
            {plan.untransferable.length > 0 && (
              <V4Panel>
                <h2 className="text-sm font-medium text-ink">Not automatically transferred</h2>
                <ul className="mt-2 space-y-1 text-[12px] text-graphite">
                  {plan.untransferable.map((row) => <li key={row.kind}>{row.count} {row.kind.replace(/_/g, ' ')} — {row.reason}</li>)}
                </ul>
              </V4Panel>
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="orange" disabled={busy || blocked} onClick={run}>
                Transfer responsibilities <ArrowRight className="size-3.5" aria-hidden />
              </Button>
              {blocked && <span className="text-[11px] text-stone">Resolve the review items above first.</span>}
            </div>
          </div>
        </div>
      )}

      {!plan && !error && <div className="mt-4"><V4Empty title="No preview yet" body="Choose a departing rep to see everything that will move." /></div>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between gap-3"><dt>{label}</dt><dd className="tabular-nums text-ink">{value}</dd></div>
}
