/**
 * Release health computation, shared by /api/admin/health and the
 * /admin/health dashboard so the two can never disagree.
 *
 * Pure DB aggregation — no AI calls, no writes.
 */
import type { DbClient } from '@/lib/db/types'

export interface HealthReport {
  timestamp: string
  aiHealth: { total: number; succeeded: number; failed: number; fallback: number }
  actionHealth: { total: number; byType: Record<string, number> }
  releaseHealth: {
    inboxSendsToday: number
    tasksCreatedToday: number
    tasksCompletedToday: number
    coverageActivatedToday: number
    coveragePrimaryToday: number
    assignmentsCreatedToday: number
  }
  leadHealth: { total: number; byStatus: Record<string, number>; withScore: number }
  repHealth: { total: number; activeToday: number }
  missingMigrations: string[]
  healthy: boolean
}

const SEND_TYPES = ['DM_SENT', 'FOLLOWUP_SENT', 'REPLY_SENT', 'CONNECTION_SENT']

export async function computeHealth(client: DbClient, orgId: string): Promise<HealthReport> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: aiTraces } = await client
    .from('ai_traces')
    .select('status, feature')
    .eq('organization_id', orgId)
    .gte('created_at', since24h)

  const aiHealth = {
    total: aiTraces?.length ?? 0,
    succeeded: aiTraces?.filter((t) => t.status === 'SUCCESS').length ?? 0,
    failed: aiTraces?.filter((t) => t.status === 'FAILED').length ?? 0,
    fallback: aiTraces?.filter((t) => t.status === 'FALLBACK').length ?? 0,
  }

  const { data: actionEvents } = await client
    .from('action_events')
    .select('action_type')
    .eq('organization_id', orgId)
    .gte('occurred_at', since24h)

  const actionHealth: HealthReport['actionHealth'] = { total: actionEvents?.length ?? 0, byType: {} }
  for (const e of actionEvents ?? []) {
    const type = e.action_type as string
    actionHealth.byType[type] = (actionHealth.byType[type] ?? 0) + 1
  }

  const { data: leads } = await client
    .from('leads')
    .select('status, canonical_score')
    .eq('organization_id', orgId)

  const leadHealth: HealthReport['leadHealth'] = {
    total: leads?.length ?? 0,
    byStatus: {},
    withScore: leads?.filter((l) => (l as { canonical_score?: unknown }).canonical_score != null).length ?? 0,
  }
  for (const l of leads ?? []) {
    const status = l.status as string
    leadHealth.byStatus[status] = (leadHealth.byStatus[status] ?? 0) + 1
  }

  const { data: reps } = await client.from('reps').select('id, name, role').eq('organization_id', orgId)

  const repHealth: HealthReport['repHealth'] = { total: reps?.length ?? 0, activeToday: 0 }
  if (reps) {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const { data: activeReps } = await client
      .from('action_events')
      .select('actor_id')
      .eq('organization_id', orgId)
      .gte('occurred_at', startOfDay.toISOString())
    const activeIds = new Set((activeReps ?? []).map((e) => e.actor_id))
    repHealth.activeToday = [...activeIds].filter((id) => reps.some((r) => r.id === id)).length
  }

  // Release metrics for the daily operating rhythm. All UTC-day windows so the
  // numbers agree regardless of where the viewer sits.
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayStartIso = dayStart.toISOString()

  const [todayEvents, todayTasksCreated, todayTasksCompleted, todayCoverage, todayAssignments] =
    await Promise.all([
      client.from('action_events').select('action_type').eq('organization_id', orgId).gte('occurred_at', dayStartIso),
      client.from('assigned_tasks').select('id').eq('organization_id', orgId).gte('created_at', dayStartIso),
      client
        .from('assigned_tasks')
        .select('id')
        .eq('organization_id', orgId)
        .eq('status', 'DONE')
        .gte('completed_at', dayStartIso),
      client
        .from('profile_coverage')
        .select('id, role')
        .eq('organization_id', orgId)
        .gte('created_at', dayStartIso),
      client
        .from('identity_assignments')
        .select('id')
        .eq('organization_id', orgId)
        .gte('created_at', dayStartIso),
    ])

  const releaseHealth: HealthReport['releaseHealth'] = {
    inboxSendsToday: (todayEvents.data ?? []).filter((e) => SEND_TYPES.includes(e.action_type as string)).length,
    tasksCreatedToday: todayTasksCreated.data?.length ?? 0,
    tasksCompletedToday: todayTasksCompleted.data?.length ?? 0,
    coverageActivatedToday: todayCoverage.data?.length ?? 0,
    coveragePrimaryToday: (todayCoverage.data ?? []).filter((c) => c.role === 'PRIMARY').length,
    assignmentsCreatedToday: todayAssignments.data?.length ?? 0,
  }

  const missingMigrations: string[] = []
  for (const table of ['action_events', 'ai_traces', 'leads', 'reps', 'signal_events']) {
    const { error } = await client.from(table).select('id').limit(1)
    if (error && (error as { code?: string }).code === '42P01') missingMigrations.push(table)
  }

  return {
    timestamp: new Date().toISOString(),
    aiHealth,
    actionHealth,
    releaseHealth,
    leadHealth,
    repHealth,
    missingMigrations,
    healthy:
      missingMigrations.length === 0 &&
      // No traffic is healthy, not broken: only a failure ratio can fail here.
      (aiHealth.total === 0 || aiHealth.failed < aiHealth.total * 0.1),
  }
}
