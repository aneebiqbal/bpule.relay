import { createServiceSupabase } from '@/lib/supabase/service'
import { requireProductAdmin } from '@/lib/auth/admin-page'
import { computeHealth } from '@/lib/admin/health'
import { DashHeader, EmptyNote, Panel, Pill, StatTile } from '@/components/dashboard/kit'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

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
            <Pill tone={report.healthy ? 'success' : 'danger'}>
              {report.healthy ? 'Healthy' : 'Degraded'}
            </Pill>
          ) : null
        }
      />

      {loadError ? (
        <EmptyNote>Release health could not be loaded. The database is unreachable or a table is missing.</EmptyNote>
      ) : !report ? null : (
        <>
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
                ? 'No missing tables and the AI failure ratio is inside tolerance.'
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
