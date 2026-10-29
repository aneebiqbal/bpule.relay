/**
 * Operating-policy loader.
 *
 * One row per organization. Cached for a minute per process because the policy
 * changes only when an admin edits it, and every Today load needs it.
 *
 * Degrades safely: if the migration has not been applied yet (42P01) the loader
 * falls back to what `organizations` already declares. The clock keeps working;
 * only the configurable window and target pack are unavailable.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceSupabase } from '@/lib/supabase/service'
import { currentInstant, orgDate } from './index'
import {
  DEFAULT_POLICY,
  normalizePolicy,
  timeColumnToClock,
  type OperatingPolicy,
} from './policy'

const TTL_MS = 60_000
const cache = new Map<string, { policy: OperatingPolicy; expiresAt: number }>()

export function invalidateOperatingPolicy(organizationId?: string): void {
  if (organizationId) cache.delete(organizationId)
  else cache.clear()
}

function rowToPolicy(row: Record<string, unknown>): OperatingPolicy {
  return normalizePolicy({
    organizationId: row.organization_id as string,
    timezone: row.timezone as string,
    workdayStart: timeColumnToClock(row.workday_start),
    workdayEnd: timeColumnToClock(row.workday_end),
    workingDays: Array.isArray(row.working_days) ? (row.working_days as number[]) : undefined,
    dailyResetTime: timeColumnToClock(row.daily_reset_time),
    warningThresholds: row.warning_thresholds as OperatingPolicy['warningThresholds'],
    targetPack: row.target_pack as OperatingPolicy['targetPack'],
    cutoverDate: row.cutover_date as string,
  })
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  return /does not exist|schema cache/i.test(String(error.message ?? ''))
}

async function loadFromOrganizations(
  client: SupabaseClient,
  organizationId: string,
): Promise<OperatingPolicy> {
  const { data } = await client
    .from('organizations')
    .select('id, timezone, working_days')
    .eq('id', organizationId)
    .maybeSingle()

  return normalizePolicy({
    organizationId,
    timezone: (data?.timezone as string) || DEFAULT_POLICY.timezone,
    workingDays: Array.isArray(data?.working_days) ? (data.working_days as number[]) : undefined,
    workdayStart: DEFAULT_POLICY.workdayStart,
    workdayEnd: DEFAULT_POLICY.workdayEnd,
    dailyResetTime: DEFAULT_POLICY.dailyResetTime,
    warningThresholds: DEFAULT_POLICY.warningThresholds,
    targetPack: [],
    cutoverDate: DEFAULT_POLICY.cutoverDate,
  })
}

export async function loadOperatingPolicy(
  organizationId: string,
  client?: SupabaseClient,
): Promise<OperatingPolicy> {
  if (!organizationId) return { ...DEFAULT_POLICY }

  const cached = cache.get(organizationId)
  if (cached && cached.expiresAt > Date.now()) return cached.policy

  const db = client ?? createServiceSupabase()

  const { data, error } = await db
    .from('organization_operating_policy')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()

  let policy: OperatingPolicy
  if (error) {
    if (!isMissingRelation(error)) throw error
    policy = await loadFromOrganizations(db, organizationId)
  } else if (!data) {
    policy = await loadFromOrganizations(db, organizationId)
  } else {
    policy = rowToPolicy(data as Record<string, unknown>)
  }

  cache.set(organizationId, { policy, expiresAt: Date.now() + TTL_MS })
  return policy
}

/** Convenience for a request that already knows the organization. */
export async function operatingPolicyFor(organizationId: string): Promise<OperatingPolicy> {
  return loadOperatingPolicy(organizationId)
}

/**
 * The organization-local business date right now.
 * The one replacement for `new Date().toISOString().slice(0, 10)`.
 */
export async function businessDateForOrg(
  organizationId: string,
  client?: SupabaseClient,
): Promise<string> {
  const policy = await loadOperatingPolicy(organizationId, client)
  return orgDate(currentInstant(), policy.timezone)
}
