/**
 * Release health computation, shared by /api/admin/health and the
 * /admin/health dashboard so the two can never disagree.
 *
 * Pure DB aggregation — no AI calls, no writes.
 */
import type { DbClient } from '@/lib/db/types'
import { providerConfigured } from '@/lib/enrichment/provider-registry'

export interface ProviderHealthRow {
  provider: string
  configured: boolean
  status: 'HEALTHY' | 'DEGRADED' | 'DISABLED' | 'UNCONFIGURED'
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  consecutiveFailures: number
  creditsUsedToday: number
  dailyBudget: number
  freshProspects: number
}

export interface HealthReport {
  timestamp: string
  aiHealth: { total: number; succeeded: number; failed: number; fallback: number }
  providerHealth: ProviderHealthRow[]
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

  // §25 — compact provider summary, surfaced in the existing health dashboard.
  const providerDayStart = new Date()
  providerDayStart.setUTCHours(0, 0, 0, 0)
  const [providerConfigs, providerTelemetry, freshProspects] = await Promise.all([
    client
      .from('provider_config')
      .select('provider, enabled, daily_credit_budget, credits_used_today, last_run_at, last_success_at, last_error, consecutive_failures')
      .eq('organization_id', orgId)
      .limit(20),
    client
      .from('provider_telemetry')
      .select('provider, status')
      .eq('organization_id', orgId)
      .gte('created_at', providerDayStart.toISOString())
      .limit(2000),
    client
      .from('captured_prospects')
      .select('provider')
      .eq('organization_id', orgId)
      .gte('discovered_at', providerDayStart.toISOString())
      .limit(2000),
  ])

  const telemetryByProvider = new Map<string, { operations: number; failures: number }>()
  for (const row of providerTelemetry.data ?? []) {
    const entry = telemetryByProvider.get(row.provider as string) ?? { operations: 0, failures: 0 }
    entry.operations += 1
    if (row.status !== 'OK') entry.failures += 1
    telemetryByProvider.set(row.provider as string, entry)
  }
  const freshByProvider = new Map<string, number>()
  for (const row of freshProspects.data ?? []) {
    const provider = (row.provider as string) || 'unknown'
    freshByProvider.set(provider, (freshByProvider.get(provider) ?? 0) + 1)
  }

  const providerHealth: ProviderHealthRow[] = (['prospeo', 'snov', 'apollo'] as const).map((provider) => {
    const config = (providerConfigs.data ?? []).find((row) => row.provider === provider) as Record<string, unknown> | undefined
    const telemetry = telemetryByProvider.get(provider) ?? { operations: 0, failures: 0 }
    const configured = providerConfigured(provider)
    const enabled = (config?.enabled as boolean | undefined) ?? true
    const consecutive = (config?.consecutive_failures as number | undefined) ?? 0
    const status: ProviderHealthRow['status'] = !configured
      ? 'UNCONFIGURED'
      : !enabled
        ? 'DISABLED'
        : consecutive > 0 || telemetry.failures > 0
          ? 'DEGRADED'
          : 'HEALTHY'
    return {
      provider,
      configured,
      status,
      lastRunAt: (config?.last_run_at as string | null | undefined) ?? null,
      lastSuccessAt: (config?.last_success_at as string | null | undefined) ?? null,
      lastError: (config?.last_error as string | null | undefined) ?? null,
      consecutiveFailures: consecutive,
      creditsUsedToday: (config?.credits_used_today as number | undefined) ?? 0,
      dailyBudget: (config?.daily_credit_budget as number | undefined) ?? 0,
      freshProspects: freshByProvider.get(provider) ?? 0,
    }
  })

  const missingMigrations: string[] = []
  for (const table of ['action_events', 'ai_traces', 'leads', 'reps', 'signal_events']) {
    const { error } = await client.from(table).select('id').limit(1)
    if (error && (error as { code?: string }).code === '42P01') missingMigrations.push(table)
  }

  return {
    timestamp: new Date().toISOString(),
    aiHealth,
    providerHealth,
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
