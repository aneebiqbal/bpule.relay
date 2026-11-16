import type { DbClient } from '@/lib/db/types'
import { activityLabel } from '@/lib/accountability/default-targets'
import { normalizeChannel } from '@/lib/profiles/channel'
import { configureCoverage } from '@/lib/coverage/actions'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

/**
 * Responsibility assignment — the one write path for "who works which channel".
 *
 * THREE explicit actions, never one overloaded "assign":
 *
 *   setPrimaryOwner  — moves permanent ownership. Other operators are untouched.
 *   addOperator      — grants an ongoing, executable seat. Ownership is untouched.
 *   removeOperator   — ends future execution. History and the plan are untouched.
 *
 * Eligibility is `identity_assignments`; permanent execution is an active
 * `profile_coverage` row (PRIMARY or OPERATOR); a BACKUP row is eligibility
 * only. The daily plan belongs to the CHANNEL, so no assignment action moves,
 * duplicates or reseeds it.
 *
 * There is no multi-statement transaction in the Neon adapter, so each step is
 * idempotent and every write is org-scoped.
 *
 * shortcut: this incremental per-seat path and `configureCoverage` (full-chain)
 * both write profile_coverage/identity_assignments. They must keep audit and
 * acknowledgement fields in sync; unify when a change touches both again.
 */

export interface AssignInput {
  orgId: string
  identityId: string
  repId: string
  actorRepId: string
  /** Seed the channel's default pack when it has no plan. */
  ensureTargets?: boolean
}

export interface AssignResult {
  identityId: string
  profileId: string
  repId: string
  previousPrimaryRepId: string | null
  targetsTransferred: number
  targetsSeeded: number
}

export type ResponsibilityRole = 'PRIMARY' | 'OPERATOR' | 'BACKUP'

export interface ResponsibilityChain {
  primaryRepId: string | null
  operators: Array<{ repId: string; priority: number }>
  backups: Array<{ repId: string; priority: number }>
}

/** The current active chain for one profile, from the canonical seat table. */
export async function readResponsibilityChain(
  client: DbClient,
  orgId: string,
  profileId: string,
): Promise<ResponsibilityChain> {
  const { data, error } = await client
    .from('profile_coverage')
    .select('rep_id, role, priority')
    .eq('organization_id', orgId)
    .eq('profile_id', profileId)
    .eq('active', true)
    .limit(100)
  if (error) throw error
  const chain: ResponsibilityChain = { primaryRepId: null, operators: [], backups: [] }
  for (const row of (data ?? []) as Array<{ rep_id: string; role: string; priority: number }>) {
    if (row.role === 'PRIMARY') chain.primaryRepId = row.rep_id
    else if (row.role === 'OPERATOR') chain.operators.push({ repId: row.rep_id, priority: row.priority })
    else if (row.role === 'BACKUP') chain.backups.push({ repId: row.rep_id, priority: row.priority })
  }
  chain.operators.sort((a, b) => a.priority - b.priority)
  chain.backups.sort((a, b) => a.priority - b.priority)
  return chain
}

/**
 * The ONE write path for a responsibility chain.
 *
 * `configureCoverage` is the canonical reconcile: it deactivates the previous
 * chain, inserts the new seats, syncs eligibility, arms acknowledgements and
 * records the coverage event. This wrapper adds the accountability audit row
 * and keeps the per-action event vocabulary. Every assignment API — the
 * incremental admin route, the profile dialog and the bulk command-center
 * endpoint — funnels through here, so there is no second write path.
 */
export async function saveResponsibilityChain(
  client: DbClient,
  input: {
    orgId: string
    profileId: string
    identityId: string
    primaryRepId: string | null
    operators: Array<{ repId: string; priority: number }>
    backups: Array<{ repId: string; priority: number }>
    actorRepId: string
    auditEventType: string
    auditDetail?: Record<string, unknown>
    ensureTargets?: boolean
  },
): Promise<{ ok: boolean; error?: string; seeded?: number }> {
  const result = await configureCoverage({
    organizationId: input.orgId,
    profileId: input.profileId,
    primaryRepId: input.primaryRepId,
    operators: input.operators,
    backups: input.backups,
    actorRepId: input.actorRepId,
    client,
    ensureTargets: input.ensureTargets,
  })
  if (!result.ok) return result
  const { error } = await client.from('accountability_audit_log').insert({
    organization_id: input.orgId,
    rep_id: input.actorRepId,
    revenue_identity_id: input.identityId,
    event_type: input.auditEventType,
    detail: input.auditDetail ?? {},
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, seeded: result.seeded }
}

async function readIdentity(client: DbClient, orgId: string, identityId: string) {
  const { data, error } = await client
    .from('revenue_identities')
    .select('id, profile_id, identity_name, channel, status')
    .eq('id', identityId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('IDENTITY_NOT_FOUND')
  if (!data.profile_id) throw new Error('IDENTITY_HAS_NO_PROFILE')
  if (data.status === 'archived') throw new Error('IDENTITY_ARCHIVED')
  return data as { id: string; profile_id: string; identity_name: string; channel: string; status: string }
}

/** The channel's plan, for notification copy. Never throws. */
async function planSummary(client: DbClient, orgId: string, identityId: string): Promise<string> {
  try {
    const { data } = await client
      .from('daily_target_plans')
      .select('activity_type, target_count')
      .eq('organization_id', orgId)
      .eq('revenue_identity_id', identityId)
      .eq('active', true)
      .limit(20)
    if (!data || data.length === 0) return 'No daily plan yet'
    return data
      .map((row) => `${activityLabel(row.activity_type as never)} ${row.target_count as number}`)
      .join(' · ')
  } catch {
    return 'No daily plan yet'
  }
}

async function orgBusinessDate(client: DbClient, orgId: string): Promise<string> {
  const policy = await loadOperatingPolicy(orgId, client)
  return orgDate(currentInstant(), policy.timezone)
}

/**
 * Set the permanent PRIMARY owner. Ownership moves; the channel's plan and its
 * completion history do not. Every other OPERATOR and BACKUP on the profile is
 * left exactly as it was — adding an owner is never a replacement operation.
 */
export async function assignPrimaryResponsibility(
  client: DbClient,
  input: AssignInput,
): Promise<AssignResult> {
  const identity = await readIdentity(client, input.orgId, input.identityId)
  const profileId = identity.profile_id

  const chain = await readResponsibilityChain(client, input.orgId, profileId)
  const previousPrimaryRepId = chain.primaryRepId
  const transferred = previousPrimaryRepId != null && previousPrimaryRepId !== input.repId

  // Ownership moves; the new owner's existing seat is retired so they hold
  // exactly one row. Operators and backups are carried across untouched.
  const result = await saveResponsibilityChain(client, {
    orgId: input.orgId,
    profileId,
    identityId: input.identityId,
    primaryRepId: input.repId,
    operators: chain.operators.filter((seat) => seat.repId !== input.repId),
    backups: chain.backups.filter((seat) => seat.repId !== input.repId),
    actorRepId: input.actorRepId,
    auditEventType: transferred ? 'identity_transferred' : 'identity_assigned',
    auditDetail: { rep_id: input.repId, previous_primary_rep_id: previousPrimaryRepId },
    ensureTargets: input.ensureTargets !== false,
  })
  if (!result.ok) throw new Error(result.error ?? 'ASSIGN_FAILED')

  await client.from('coverage_events').insert({
    organization_id: input.orgId,
    profile_id: profileId,
    event_type: transferred ? 'COVERAGE_TRANSFERRED' : 'COVERAGE_ASSIGNED',
    primary_rep_id: input.repId,
    reason: previousPrimaryRepId ? `Transferred from ${previousPrimaryRepId}` : 'Assigned',
    actor_rep_id: input.actorRepId,
  })

  // The plan belongs to the CHANNEL, not the operator, so a transfer never
  // moves it. `saveResponsibilityChain` seeds the default pack only when the
  // identity has no active plan and reports how many lanes it wrote.
  const targetsSeeded = result.seeded ?? 0

  await notifyAssigned(client, {
    orgId: input.orgId,
    identityId: input.identityId,
    identityName: identity.identity_name,
    channel: identity.channel,
    profileId,
    repId: input.repId,
    subject: 'PRIMARY',
    title: 'You now own this profile',
  })

  return { identityId: input.identityId, profileId, repId: input.repId, previousPrimaryRepId, targetsTransferred: 0, targetsSeeded }
}

/**
 * Add an active OPERATOR. This never moves ownership, never removes the
 * primary, and never creates a second plan: the operator executes the channel's
 * one shared plan and their contribution is counted separately.
 */
export async function addOperatorResponsibility(
  client: DbClient,
  input: AssignInput,
): Promise<AssignResult> {
  const identity = await readIdentity(client, input.orgId, input.identityId)
  const profileId = identity.profile_id
  const chain = await readResponsibilityChain(client, input.orgId, profileId)

  // Already the owner: an operator seat would be a second active row for the
  // same rep, which the model forbids. Report it rather than silently demoting.
  if (chain.primaryRepId === input.repId) {
    return {
      identityId: input.identityId,
      profileId,
      repId: input.repId,
      previousPrimaryRepId: input.repId,
      targetsTransferred: 0,
      targetsSeeded: 0,
    }
  }

  const existingOperator = chain.operators.find((seat) => seat.repId === input.repId)
  const operators = existingOperator
    ? chain.operators
    : [...chain.operators, { repId: input.repId, priority: (chain.operators.at(-1)?.priority ?? 0) + 1 }]
  // A BACKUP seat is promoted in place, so it leaves the backup chain.
  const backups = chain.backups.filter((seat) => seat.repId !== input.repId)

  const result = await saveResponsibilityChain(client, {
    orgId: input.orgId,
    profileId,
    identityId: input.identityId,
    primaryRepId: chain.primaryRepId,
    operators,
    backups,
    actorRepId: input.actorRepId,
    auditEventType: 'identity_operator_added',
    auditDetail: { rep_id: input.repId },
  })
  if (!result.ok) throw new Error(result.error ?? 'ASSIGN_FAILED')

  await client.from('coverage_events').insert({
    organization_id: input.orgId,
    profile_id: profileId,
    event_type: 'OPERATOR_ADDED',
    primary_rep_id: input.repId,
    reason: 'Operator added',
    actor_rep_id: input.actorRepId,
  })

  await notifyAssigned(client, {
    orgId: input.orgId,
    identityId: input.identityId,
    identityName: identity.identity_name,
    channel: identity.channel,
    profileId,
    repId: input.repId,
    subject: 'OPERATOR',
    title: 'New profile assigned',
  })

  return {
    identityId: input.identityId,
    profileId,
    repId: input.repId,
    previousPrimaryRepId: null,
    targetsTransferred: 0,
    targetsSeeded: 0,
  }
}

/**
 * Remove an operator or backup seat. The PRIMARY is never removable through this
 * path — ownership moves only through an explicit transfer. The channel plan,
 * the completion history, leads, messages and tasks are untouched.
 */
export async function removeOperatorResponsibility(
  client: DbClient,
  input: { orgId: string; identityId: string; repId: string; actorRepId: string },
): Promise<{ profileId: string | null }> {
  const { data: identity } = await client
    .from('revenue_identities')
    .select('id, profile_id')
    .eq('id', input.identityId)
    .eq('organization_id', input.orgId)
    .maybeSingle()
  if (!identity) throw new Error('IDENTITY_NOT_FOUND')
  const profileId = (identity.profile_id as string | null) ?? null
  if (!profileId) return { profileId: null }

  const chain = await readResponsibilityChain(client, input.orgId, profileId)
  if (chain.primaryRepId === input.repId) {
    throw new Error('CANNOT_REMOVE_PRIMARY')
  }

  const result = await saveResponsibilityChain(client, {
    orgId: input.orgId,
    profileId,
    identityId: input.identityId,
    primaryRepId: chain.primaryRepId,
    operators: chain.operators.filter((seat) => seat.repId !== input.repId),
    backups: chain.backups.filter((seat) => seat.repId !== input.repId),
    actorRepId: input.actorRepId,
    auditEventType: 'identity_operator_removed',
    auditDetail: { rep_id: input.repId },
  })
  if (!result.ok) throw new Error(result.error ?? 'REMOVE_FAILED')

  await client.from('coverage_events').insert({
    organization_id: input.orgId,
    profile_id: profileId,
    event_type: 'OPERATOR_REMOVED',
    primary_rep_id: input.repId,
    reason: 'Operator removed',
    actor_rep_id: input.actorRepId,
  })

  return { profileId }
}

/**
 * Add a rep as a backup on a channel: eligibility plus a BACKUP coverage row.
 * Backups never carry daily targets and never appear as current work until a
 * coverage assignment activates them. Adding a backup never demotes an existing
 * operator seat.
 */
export async function assignBackupResponsibility(
  client: DbClient,
  input: { orgId: string; identityId: string; repId: string; actorRepId: string },
): Promise<{ profileId: string }> {
  const identity = await readIdentity(client, input.orgId, input.identityId)
  const chain = await readResponsibilityChain(client, input.orgId, identity.profile_id)

  // An existing PRIMARY or OPERATOR seat already outranks a backup: keep it, but
  // still make sure the rep holds eligibility.
  if (chain.primaryRepId === input.repId || chain.operators.some((seat) => seat.repId === input.repId)) {
    await client
      .from('identity_assignments')
      .upsert(
        {
          organization_id: input.orgId,
          revenue_identity_id: input.identityId,
          rep_id: input.repId,
          assigned_by: input.actorRepId,
        },
        { onConflict: 'revenue_identity_id,rep_id' },
      )
    return { profileId: identity.profile_id }
  }

  const existing = chain.backups.find((seat) => seat.repId === input.repId)
  const backups = existing
    ? chain.backups
    : [...chain.backups, { repId: input.repId, priority: (chain.backups.at(-1)?.priority ?? 1) + 1 }]

  const result = await saveResponsibilityChain(client, {
    orgId: input.orgId,
    profileId: identity.profile_id,
    identityId: input.identityId,
    primaryRepId: chain.primaryRepId,
    operators: chain.operators,
    backups,
    actorRepId: input.actorRepId,
    auditEventType: 'identity_backup_assigned',
    auditDetail: { rep_id: input.repId },
  })
  if (!result.ok) throw new Error(result.error ?? 'ASSIGN_FAILED')

  return { profileId: identity.profile_id }
}

/**
 * Remove a rep's eligibility for a channel. Refuses to remove the PRIMARY —
 * ownership moves only through an explicit transfer. Targets and history are
 * never touched.
 */
export async function removeResponsibility(
  client: DbClient,
  input: { orgId: string; identityId: string; repId: string; actorRepId: string },
): Promise<{ profileId: string | null }> {
  const { data: identity } = await client
    .from('revenue_identities')
    .select('id, profile_id')
    .eq('id', input.identityId)
    .eq('organization_id', input.orgId)
    .maybeSingle()
  if (!identity) throw new Error('IDENTITY_NOT_FOUND')
  const profileId = (identity.profile_id as string | null) ?? null
  if (!profileId) return { profileId: null }

  const chain = await readResponsibilityChain(client, input.orgId, profileId)
  if (chain.primaryRepId === input.repId) {
    throw new Error('CANNOT_REMOVE_PRIMARY')
  }

  const result = await saveResponsibilityChain(client, {
    orgId: input.orgId,
    profileId,
    identityId: input.identityId,
    primaryRepId: chain.primaryRepId,
    operators: chain.operators.filter((seat) => seat.repId !== input.repId),
    backups: chain.backups.filter((seat) => seat.repId !== input.repId),
    actorRepId: input.actorRepId,
    auditEventType: 'identity_unassigned',
    auditDetail: { rep_id: input.repId },
  })
  if (!result.ok) throw new Error(result.error ?? 'REMOVE_FAILED')

  // The channel's plan and its completion history are untouched: removing an
  // operator never rewrites what the profile still owes or has already done.
  return { profileId }
}

/**
 * Move permanent ownership from one rep to another in one call. Operators and
 * backups on the profile are untouched; the new owner's existing seat is
 * retired so they hold exactly one row.
 */
export async function transferResponsibility(
  client: DbClient,
  input: { orgId: string; identityId: string; fromRepId: string; toRepId: string; actorRepId: string },
): Promise<AssignResult> {
  const identity = await readIdentity(client, input.orgId, input.identityId)
  const chain = await readResponsibilityChain(client, input.orgId, identity.profile_id)

  // The plan belongs to the channel, so a transfer never moves it. Ownership
  // changes; the requirement and its completion history stay put. The new
  // owner's existing seat is retired so they hold exactly one row.
  const result = await saveResponsibilityChain(client, {
    orgId: input.orgId,
    profileId: identity.profile_id,
    identityId: input.identityId,
    primaryRepId: input.toRepId,
    operators: chain.operators.filter((seat) => seat.repId !== input.toRepId),
    backups: chain.backups.filter((seat) => seat.repId !== input.toRepId),
    actorRepId: input.actorRepId,
    auditEventType: 'identity_transferred',
    auditDetail: { from_rep_id: input.fromRepId, to_rep_id: input.toRepId },
  })
  if (!result.ok) throw new Error(result.error ?? 'TRANSFER_FAILED')

  await client.from('coverage_events').insert({
    organization_id: input.orgId,
    profile_id: identity.profile_id,
    event_type: 'COVERAGE_TRANSFERRED',
    primary_rep_id: input.toRepId,
    reason: `Transferred from ${input.fromRepId}`,
    actor_rep_id: input.actorRepId,
  })

  return {
    identityId: input.identityId,
    profileId: identity.profile_id,
    repId: input.toRepId,
    previousPrimaryRepId: input.fromRepId,
    targetsTransferred: 0,
    targetsSeeded: 0,
  }
}

/**
 * Eligibility for a profile's channel seats — the ASSIGNMENT authority.
 *
 * The coverage config records the chain; this makes it executable. A seat that
 * was removed loses its eligibility and its operator banner, so a removed
 * operator never lingers in Admin attention.
 */
export async function syncChannelEligibility(
  client: DbClient,
  input: {
    orgId: string
    profileId: string
    seatRepIds: string[]
    removedRepIds: string[]
    actorRepId: string
  },
): Promise<void> {
  const { data: identityRows, error } = await client
    .from('revenue_identities')
    .select('id')
    .eq('organization_id', input.orgId)
    .eq('profile_id', input.profileId)
    .eq('status', 'active')
    .limit(50)
  if (error) throw error
  const identityIds = (identityRows ?? []).map((row) => row.id as string)
  if (identityIds.length === 0) return

  if (input.seatRepIds.length > 0) {
    const eligibility = input.seatRepIds.flatMap((repId) =>
      identityIds.map((identityId) => ({
        organization_id: input.orgId,
        revenue_identity_id: identityId,
        rep_id: repId,
        assigned_by: input.actorRepId,
      })),
    )
    const { error: upsertError } = await client
      .from('identity_assignments')
      .upsert(eligibility, { onConflict: 'revenue_identity_id,rep_id' })
    if (upsertError) throw upsertError
  }

  if (input.removedRepIds.length > 0) {
    const { error: revokeError } = await client
      .from('identity_assignments')
      .delete()
      .eq('organization_id', input.orgId)
      .in('revenue_identity_id', identityIds)
      .in('rep_id', input.removedRepIds)
    if (revokeError) throw revokeError
    await client
      .from('responsibility_acknowledgements')
      .delete()
      .eq('organization_id', input.orgId)
      .eq('profile_id', input.profileId)
      .in('rep_id', input.removedRepIds)
      .eq('subject', 'OPERATOR')
  }
}

/** The assignment notification, deduped per rep/channel/day. */
async function notifyAssigned(
  client: DbClient,
  input: {
    orgId: string
    identityId: string
    identityName: string
    channel: string
    profileId: string
    repId: string
    subject: ResponsibilityRole
    title: string
  },
): Promise<void> {
  try {
    const [businessDate, summary] = await Promise.all([
      orgBusinessDate(client, input.orgId),
      planSummary(client, input.orgId, input.identityId),
    ])
    const { error } = await client.from('notifications').insert({
      organization_id: input.orgId,
      recipient_id: input.repId,
      notification_type: 'identity_assigned',
      title: input.title,
      body: `${input.identityName} · ${normalizeChannel(input.channel)}\n\nDaily plan:\n${summary}`,
      link: `/team/profiles/${input.profileId}`,
      dedupe_key: `responsibility_assigned:${input.subject}:${input.repId}:${input.identityId}:${businessDate}`,
    })
    if (error) console.warn('[assignment] notification failed', error.message)
  } catch (error) {
    // A notification must never fail a committed assignment.
    console.warn('[assignment] notification failed', error instanceof Error ? error.message : error)
  }
}
