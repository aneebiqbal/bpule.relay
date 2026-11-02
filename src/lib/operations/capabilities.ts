import type { DbClient } from '@/lib/db/types'
/**
 * Database capability registry (Phase 8 / Slice C).
 *
 * Phase 8 features depend on migrations that are verified locally but NOT
 * applied to production (docs/RELAY_PHASE8_DATABASE_CONTRACTS.md). Every
 * DB-dependent feature asks this registry and renders an honest
 * "Available after database activation" state instead of throwing or
 * pretending to succeed.
 *
 * Resolution order (no per-request probing):
 * 1. RELAY_DB_CAPABILITIES env — "all", "none", or a comma list of keys.
 *    This is the switch the activation runbook flips.
 * 2. Otherwise a process-cached probe (10 min TTL): one zero-row read per
 *    table / one helper RPC, run at most once per TTL per server process.
 *    Capabilities that cannot be introspected through PostgREST (constraint
 *    contents) default to false until the env says otherwise.
 */
import { isMissingRelation } from '@/lib/operations/db-errors'

export const CAPABILITY_KEYS = [
  'assignedTasks',
  'internalNotes',
  'savedViews',
  'teamScopedActivity',
  'meetingEvents',
  'notifications',
  'targets',
  'messagePreviews',
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]
export type DatabaseCapabilities = Record<CapabilityKey, boolean>

export const CAPABILITY_LABEL: Record<CapabilityKey, string> = {
  assignedTasks: 'Assigned tasks',
  internalNotes: 'Internal notes',
  savedViews: 'Saved views',
  teamScopedActivity: 'Manager team visibility',
  meetingEvents: 'Meeting events',
  notifications: 'Notifications',
  targets: 'Targets',
  messagePreviews: 'Bounded message previews',
}

export const NOT_AVAILABLE_MESSAGE = 'Available after database activation'

/** Pure: parse the env override. null = no override. Unknown keys are ignored. */
export function parseCapabilityEnv(raw: string | undefined | null): DatabaseCapabilities | null {
  const value = raw?.trim()
  if (!value) return null
  const all = value.toLowerCase() === 'all'
  const none = value.toLowerCase() === 'none'
  const listed = new Set(value.split(',').map((s) => s.trim()))
  const out = {} as DatabaseCapabilities
  for (const key of CAPABILITY_KEYS) out[key] = all ? true : none ? false : listed.has(key)
  return out
}

export function allCapabilities(value: boolean): DatabaseCapabilities {
  const out = {} as DatabaseCapabilities
  for (const key of CAPABILITY_KEYS) out[key] = value
  return out
}

const TTL_MS = 10 * 60_000
let cached: { at: number; value: DatabaseCapabilities } | null = null
let inflight: Promise<DatabaseCapabilities> | null = null

/**
 * Zero-row read of the columns the feature actually uses. A bare `id` check
 * is not enough: production's `notifications` exists in an older shape
 * (rep_id / type / message) that the canonical writer cannot use.
 */
async function tableExists(client: DbClient, table: string, columns = 'id'): Promise<boolean> {
  const { error } = await client.from(table).select(columns, { head: true, count: 'exact' }).limit(0)
  if (!error) return true
  if (isMissingRelation(error)) return false
  // Permission / network errors: do not claim the feature works.
  return false
}

async function rpcExists(client: DbClient, fn: string, args: Record<string, unknown>): Promise<boolean> {
  const { error } = await client.rpc(fn, args)
  if (!error) return true
  const code = (error as { code?: string }).code
  // PGRST202 / 42883 = function not found. Anything else means it exists.
  return !(code === 'PGRST202' || code === '42883')
}

export async function probeCapabilities(client: DbClient): Promise<DatabaseCapabilities> {
  const [assignedTasks, internalNotes, savedViews, notifications, targets, teamScopedActivity, messagePreviews] = await Promise.all([
    tableExists(client, 'assigned_tasks'),
    tableExists(client, 'internal_notes'),
    tableExists(client, 'saved_views'),
    tableExists(client, 'notifications', 'id, recipient_id, notification_type, body, link, dedupe_key, read'),
    tableExists(client, 'daily_targets'),
    rpcExists(client, 'manages_team', { target_team_id: null }),
    tableExists(client, 'lead_message_previews', 'lead_id, preview'),
  ])
  return {
    assignedTasks,
    internalNotes,
    savedViews,
    notifications,
    targets,
    teamScopedActivity,
    messagePreviews,
    // The MEETING_BOOKED constraint cannot be introspected through PostgREST.
    meetingEvents: false,
  }
}

/** Server-side. Env override wins; otherwise a cached probe. Never throws. */
export async function getDatabaseCapabilities(client: DbClient | null): Promise<DatabaseCapabilities> {
  const env = parseCapabilityEnv(process.env.RELAY_DB_CAPABILITIES)
  if (env) return env
  if (process.env.SCOUT_DB === 'demo' || !client) return allCapabilities(false)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  if (!inflight) {
    inflight = probeCapabilities(client)
      .then((value) => {
        cached = { at: Date.now(), value }
        return value
      })
      .catch(() => allCapabilities(false))
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Test hook. */
export function resetCapabilityCache(): void {
  cached = null
  inflight = null
}

/** Standard JSON body for a route whose capability is off. */
export function notAvailableBody(key: CapabilityKey) {
  return { error: `${CAPABILITY_LABEL[key]}: ${NOT_AVAILABLE_MESSAGE}.`, available: false, capability: key }
}
