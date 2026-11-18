import type { DbClient } from '@/lib/db/types'

/**
 * Channel lifecycle.
 *
 *   ACTIVE ⇄ INACTIVE, ACTIVE → SUSPENDED, INACTIVE → SUSPENDED
 *   ACTIVE/INACTIVE/SUSPENDED → ARCHIVED
 *   ARCHIVED → ACTIVE (restore)
 *
 * State lives in `revenue_identities.status`; the reason and the actor are
 * recorded in `accountability_audit_log` so nothing is lost and no schema
 * migration is required. Archived rows are never hard-deleted here.
 *
 * Execution is decided by the canonical readers, which only return
 * `status = 'active'` identities — so a non-active channel is invisible to
 * operators but still inspectable by authorized admins.
 */

export type IdentityLifecycleStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED'

const TRANSITIONS: Record<IdentityLifecycleStatus, IdentityLifecycleStatus[]> = {
  ACTIVE: ['INACTIVE', 'SUSPENDED', 'ARCHIVED'],
  INACTIVE: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
}

const STORED: Record<string, IdentityLifecycleStatus> = {
  active: 'ACTIVE',
  inactive: 'INACTIVE',
  suspended: 'SUSPENDED',
  archived: 'ARCHIVED',
}

export function toLifecycleStatus(value: string | null | undefined): IdentityLifecycleStatus | null {
  if (!value) return null
  return STORED[value.trim().toLowerCase()] ?? null
}

export function isValidLifecycleTransition(from: IdentityLifecycleStatus, to: IdentityLifecycleStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export interface LifecycleResult {
  ok: boolean
  error?: string
  from?: IdentityLifecycleStatus
  to?: IdentityLifecycleStatus
}

export async function setIdentityLifecycle(
  client: DbClient,
  input: {
    organizationId: string
    identityId: string
    to: IdentityLifecycleStatus
    reason: string
    actorRepId: string
  },
): Promise<LifecycleResult> {
  const { data: identity, error } = await client
    .from('revenue_identities')
    .select('id, status, identity_name')
    .eq('id', input.identityId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!identity) return { ok: false, error: 'That channel was not found in your organization.' }

  const from = toLifecycleStatus(identity.status as string)
  if (!from) return { ok: false, error: `Unknown channel status: ${String(identity.status)}` }
  if (from === input.to) return { ok: false, error: `The channel is already ${input.to.toLowerCase()}.` }
  if (!isValidLifecycleTransition(from, input.to)) {
    return { ok: false, error: `Cannot move a ${from.toLowerCase()} channel to ${input.to.toLowerCase()}.` }
  }

  const reason = input.reason.trim().slice(0, 500)
  if (input.to !== 'ACTIVE' && !reason) {
    return { ok: false, error: 'A reason is required when deactivating, suspending or archiving a channel.' }
  }

  const { error: updateError } = await client
    .from('revenue_identities')
    .update({ status: input.to.toLowerCase(), updated_at: new Date().toISOString() })
    .eq('id', input.identityId)
    .eq('organization_id', input.organizationId)
  if (updateError) return { ok: false, error: updateError.message }

  const { error: auditError } = await client.from('accountability_audit_log').insert({
    organization_id: input.organizationId,
    rep_id: input.actorRepId,
    revenue_identity_id: input.identityId,
    event_type: 'identity_lifecycle',
    detail: { from, to: input.to, reason: reason || null },
  })
  if (auditError) return { ok: false, error: auditError.message }

  return { ok: true, from, to: input.to }
}

/** Latest lifecycle reason for display, from the audit trail. */
export async function readLifecycleReasons(
  client: DbClient,
  organizationId: string,
  identityIds: string[],
): Promise<Map<string, { to: string; reason: string | null; actorRepId: string | null }>> {
  const out = new Map<string, { to: string; reason: string | null; actorRepId: string | null }>()
  if (identityIds.length === 0) return out
  const { data, error } = await client
    .from('accountability_audit_log')
    .select('revenue_identity_id, detail, rep_id, created_at')
    .eq('organization_id', organizationId)
    .eq('event_type', 'identity_lifecycle')
    .in('revenue_identity_id', identityIds)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return out
  for (const row of (data ?? []) as Array<{ revenue_identity_id: string; detail: unknown; rep_id: string | null }>) {
    if (out.has(row.revenue_identity_id)) continue
    const detail = (row.detail ?? {}) as { to?: unknown; reason?: unknown }
    out.set(row.revenue_identity_id, {
      to: typeof detail.to === 'string' ? detail.to : '',
      reason: typeof detail.reason === 'string' ? detail.reason : null,
      actorRepId: row.rep_id,
    })
  }
  return out
}
