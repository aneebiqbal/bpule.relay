'use client'

/**
 * Persistent acknowledgement banner.
 *
 * Shown on Rep Home until every new responsibility is acknowledged. Survives
 * navigation and reload because it is server-derived. Acknowledgement is
 * separate from device readiness and from any access issue.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogActions } from '@/components/ui/dialog'
import type { ResponsibilityAcknowledgementView } from '@/lib/responsibility/load'

export function AcknowledgementBanner({
  acknowledgements,
}: {
  acknowledgements: ResponsibilityAcknowledgementView[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accessIssueAck, setAccessIssueAck] = useState<ResponsibilityAcknowledgementView | null>(null)
  const [accessIssue, setAccessIssue] = useState('')
  const [accessIssueNote, setAccessIssueNote] = useState('')

  if (acknowledgements.length === 0) return null

  async function call(key: string, body: Record<string, unknown>) {
    setBusy(key)
    setError(null)
    try {
      const res = await fetch('/api/rep/coverage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload.error ?? 'Something went wrong. Please try again.')
        return
      }
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div
        role="alert"
        className="mb-6 rounded-2xl border border-status-warning/30 bg-status-warning/5 p-1.5"
      >
        <div className="rounded-[calc(1rem-0.25rem)] bg-bone-raised px-4 py-3 ring-1 ring-line/70">
          <p className="text-[13px] font-medium text-ink">Action required</p>
          <p className="mt-0.5 text-[12px] text-graphite">
            You have {acknowledgements.length} new responsibilit
            {acknowledgements.length === 1 ? 'y' : 'ies'} to acknowledge.
          </p>
          <ul className="mt-3 space-y-2">
            {acknowledgements.map((ack) => (
              <li key={ack.id} className="rounded-xl bg-bone px-3 py-2 ring-1 ring-line/70">
                <p className="text-[12px] font-medium text-ink">
                  {ack.profileName}
                  {ack.channel ? ` · ${ack.channel}` : ''}
                </p>
                <p className="mt-0.5 text-[11px] text-stone">
                  {ack.subject === 'PRIMARY'
                    ? 'Permanent owner'
                    : ack.mode === 'SHARED'
                      ? 'Temporary · Shared coverage'
                      : 'Temporary · Replacing the primary'}
                  {' · Assigned '}
                  {ack.elapsedMinutes}m ago
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void call(`ack:${ack.id}`, {
                        action: 'acknowledge',
                        acknowledgementId: ack.id,
                      })
                    }
                    className="rounded-lg bg-solid px-3 py-1.5 text-[12px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      setAccessIssueAck(ack)
                      setAccessIssue('')
                      setAccessIssueNote('')
                      setError(null)
                    }}
                    className="rounded-lg border border-line bg-bone px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-bone-raised disabled:opacity-60"
                  >
                    Report access issue
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {error && (
            <p className="mt-2 text-[12px] text-status-danger">{error}</p>
          )}
        </div>
      </div>

      <Dialog
        open={accessIssueAck !== null}
        onClose={() => setAccessIssueAck(null)}
        title="Report an access issue"
        description={
          accessIssueAck
            ? `${accessIssueAck.profileName} — reporting an issue does not change your acknowledgement or ownership.`
            : undefined
        }
      >
        <label className="mb-3 block">
          <span className="mb-1 block text-[12px] font-medium text-ink">What is wrong?</span>
          <select
            value={accessIssue}
            onChange={(event) => setAccessIssue(event.target.value)}
            className="w-full rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] text-ink"
          >
            <option value="">Select an issue</option>
            <option value="CANNOT_LOG_IN">Cannot log in</option>
            <option value="CREDENTIALS_MISSING">Credentials missing</option>
            <option value="TWO_FA_BLOCKED">2FA blocked</option>
            <option value="ACCOUNT_RESTRICTED">Account restricted</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-[12px] font-medium text-ink">Details (optional)</span>
          <textarea
            value={accessIssueNote}
            onChange={(event) => setAccessIssueNote(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-line bg-bone-raised px-3 py-2 text-[13px] text-ink"
          />
        </label>
        <DialogActions className="mt-4">
          <button
            type="button"
            onClick={() => setAccessIssueAck(null)}
            className="rounded-lg border border-line bg-bone-raised px-4 py-2 text-[13px] font-medium text-graphite transition-colors hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy !== null || !accessIssue}
            onClick={() => {
              if (!accessIssueAck) return
              void call(`issue:${accessIssueAck.id}`, {
                action: 'access_issue',
                acknowledgementId: accessIssueAck.id,
                issue: accessIssue,
                note: accessIssueNote || null,
              }).then(() => setAccessIssueAck(null))
            }}
            className="rounded-lg bg-solid px-4 py-2 text-[13px] font-medium text-on-solid transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy !== null ? 'Reporting…' : 'Report issue'}
          </button>
        </DialogActions>
      </Dialog>
    </>
  )
}
