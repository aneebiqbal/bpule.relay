import { createServiceSupabase } from '@/lib/supabase/service'
import { requireProductAdmin } from '@/lib/auth/admin-page'
import { computeHealth } from '@/lib/admin/health'
import { DashHeader, EmptyNote, Panel, Pill, StatTile } from '@/components/dashboard/kit'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

/**
 * Honest monitoring coverage. A green signal means "no persisted signal
 * exceeded tolerance", not "nothing went wrong" — application errors are not
 * persisted anywhere this dashboard can read.
 */
const COVERAGE: Array<{ tone: 'ok' | 'warn'; label: string; detail: string }> = [
  { tone: 'ok', label: 'Model calls, fallbacks and schema failures', detail: 'Persisted in ai_traces' },
  { tone: 'ok', label: 'Product actions and throughput', detail: 'Persisted in action_events' },
  { tone: 'ok', label: 'Email delivery outcomes', detail: 'Persisted in email_delivery_events' },
  {
    tone: 'warn',
    label: 'Application exceptions and HTTP 500s',
    detail: 'Not persisted — Vercel runtime logs only, and this account cannot read them',
  },
  {
    tone: 'warn',
    label: 'Database connection and permission failures',
    detail: 'Not persisted — Vercel runtime logs only',
  },
  { tone: 'warn', label: 'Unexpected 401 / 403 responses', detail: 'Not aggregated anywhere' },
]

/**
 * Admin → System → Release health.
 *
 * One small surface over existing telemetry: AI traces, the action ledger,
 * Inbox sends, task throughput, coverage activations and daily active reps.
 * No new data collection — everything is already written by the product.
 */
export default async function AdminHealthPage() {
  const { user, authCtx } = await requireProductAdmin()
  const orgId = authCtx?.orgId ?? user.organization.id

  let report = null
  let loadError = false
  try {
    report = await computeHealth(createServiceSupabase(), orgId)
  } catch {
    loadError = true
  }

  const ai = report?.aiHealth
  const aiFailureRate = ai && ai.total > 0 ? (ai.failed / ai.total) * 100 : 0

  return (
    <div className="space-y-6">
      <DashHeader
        eyebrow="Admin / System"
        title="Release health"
        subtitle="Live operating signals from existing product telemetry. No vanity metrics — only what a duty engineer needs to decide whether to page anyone."
        actions={
          report ? (
            <div className="flex items-center gap-2">
              <Pill tone={report.healthy ? 'success' : 'danger'}>
                {report.healthy ? 'Signals OK' : 'Degraded'}
              </Pill>
              <Pill tone="neutral">Limited error visibility</Pill>
            </div>
          ) : null
        }
      />

      {loadError ? (
        <EmptyNote>Release health could not be loaded. The database is unreachable or a table is missing.</EmptyNote>
      ) : !report ? null : (
        <>
          <Panel
            title="Monitoring coverage"
            subtitle="What this dashboard can and cannot see. A lack of recorded errors is not proof that no errors occurred."
          >
            <ul className="divide-y divide-line/70">
              {COVERAGE.map((row) => (
                <li key={row.label} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  {row.tone === 'ok' ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">{row.label}</p>
                    <p className="text-[12px] text-stone">{row.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          {report.missingMigrations.length > 0 && (
            <Panel title="Missing tables">
              <p className="text-[13px] font-medium text-status-danger">
                {report.missingMigrations.join(', ')} — a migration has not run.
              </p>
            </Panel>
          )}

          <Panel
            title="Model traffic (last 24h)"
            subtitle="Persisted AI traces. Zero traffic is healthy, not broken."
            action={
              ai && ai.total > 0 ? (
                <Pill tone={ai.failed > ai.total * 0.1 ? 'danger' : 'neutral'}>
                  {aiFailureRate.toFixed(1)}% failed
                </Pill>
              ) : null
            }
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <StatTile label="Requests" value={ai?.total ?? 0} />
              <StatTile label="Succeeded" value={ai?.succeeded ?? 0} tone="success" />
              <StatTile label="Failed" value={ai?.failed ?? 0} tone={ai && ai.failed > 0 ? 'danger' : 'neutral'} />
              <StatTile label="Fallbacks" value={ai?.fallback ?? 0} />
            </div>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Inbox sends today" subtitle="Outbound messages recorded in the action ledger (UTC day).">
              <div className="flex items-baseline gap-2">
                <span className="text-display text-[32px] font-light text-ink">{report.releaseHealth.inboxSendsToday}</span>
                <span className="text-[12px] text-stone">sends</span>
              </div>
            </Panel>

            <Panel title="Tasks today" subtitle="Created versus completed (UTC day).">
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Created" value={report.releaseHealth.tasksCreatedToday} />
                <StatTile label="Completed" value={report.releaseHealth.tasksCompletedToday} tone="success" />
              </div>
            </Panel>

            <Panel title="Coverage today" subtitle="Coverage rows activated, and how many are primary.">
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Activated" value={report.releaseHealth.coverageActivatedToday} />
                <StatTile label="Primary" value={report.releaseHealth.coveragePrimaryToday} />
              </div>
            </Panel>

            <Panel title="Assignments today" subtitle="New rep ↔ identity assignments.">
              <div className="flex items-baseline gap-2">
                <span className="text-display text-[32px] font-light text-ink">
                  {report.releaseHealth.assignmentsCreatedToday}
                </span>
                <span className="text-[12px] text-stone">assignments</span>
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Reps" subtitle="Total in organisation versus active today.">
              <div className="grid grid-cols-2 gap-3">
                <StatTile label="Total reps" value={report.repHealth.total} />
                <StatTile label="Active today" value={report.repHealth.activeToday} />
              </div>
            </Panel>

            <Panel title="Lead book" subtitle="Live statuses and how many carry a canonical score.">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="neutral">{report.leadHealth.total} leads</Pill>
                <Pill tone="neutral">{report.leadHealth.withScore} scored</Pill>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(report.leadHealth.byStatus).map(([status, n]) => (
                  <Pill key={status} tone="neutral">
                    {status} {n}
                  </Pill>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="Action ledger (last 24h)" subtitle="Every recorded product action, by type.">
            {Object.keys(report.actionHealth.byType).length === 0 ? (
              <EmptyNote>No product actions in the last 24 hours.</EmptyNote>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(report.actionHealth.byType)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, n]) => (
                    <Pill key={type} tone="neutral">
                      {type} {n}
                    </Pill>
                  ))}
              </div>
            )}
          </Panel>

          <div className="flex items-center gap-2 text-[12px] text-stone">
            {report.healthy ? (
              <CheckCircle2 className="size-3.5 text-status-success" aria-hidden="true" />
            ) : (
              <AlertTriangle className="size-3.5 text-status-warning" aria-hidden="true" />
            )}
            <span>
              {report.healthy
                ? 'No missing tables and the AI failure ratio is inside tolerance — across the persisted signals only. Unmonitored failure modes are listed under Monitoring coverage.'
                : 'Check the signals above before assuming a healthy system.'}
            </span>
            <span className="ml-auto text-stone">
              as of {new Date(report.timestamp).toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
