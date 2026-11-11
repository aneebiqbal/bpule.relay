import type { DbClient } from '@/lib/db/types'
import { activityLabel, defaultTargetsForChannel } from '@/lib/accountability/default-targets'
import { normalizeChannel } from '@/lib/profiles/channel'
import { ensureOperatorAcknowledgement, ensurePrimaryAcknowledgement } from '@/lib/responsibility/load'
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
  const now = new Date().toISOString()

  const { data: previousPrimary } = await client
    .from('profile_coverage')
    .select('rep_id')
    .eq('organization_id', input.orgId)
    .eq('profile_id', profileId)
    .eq('role', 'PRIMARY')
    .eq('active', true)
    .maybeSingle()
  const previousPrimaryRepId = (previousPrimary?.rep_id as string | null) ?? null

  // 1. Eligibility first — the assignment row is what the canonical scope reads
  //    alongside PRIMARY coverage.
  const { error: assignmentError } = await client
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
  if (assignmentError) throw assignmentError

  // 2. Execution: retire the OLD PRIMARY and any row the NEW owner already holds
  //    on this profile (one active row per rep is enforced by pc_active_rep_uniq).
  //    Other operators and backups are deliberately NOT matched here.
  const { error: retireError } = await client
    .from('profile_coverage')
    .update({ active: false, updated_at: now })
    .eq('organization_id', input.orgId)
    .eq('profile_id', profileId)
    .eq('active', true)
    .or(`rep_id.eq.${input.repId},role.eq.PRIMARY`)
  if (retireError) throw retireError

  const { data: primaryInserted, error: primaryError } = await client
    .from('profile_coverage')
    .insert({
      organization_id: input.orgId,
      profile_id: profileId,
      rep_id: input.repId,
      role: 'PRIMARY',
      priority: 1,
      active: true,
      created_by: input.actorRepId,
    })
    .select('id')
  if (primaryError) throw primaryError

  const primaryRowId = (primaryInserted?.[0]?.id as string | undefined) ?? null
  if (primaryRowId) {
    await ensurePrimaryAcknowledgement(client, {
      organizationId: input.orgId,
      profileId,
      repId: input.repId,
      sourceRowId: primaryRowId,
      assignedAt: now,
    })
  }

  // 3. The plan belongs to the CHANNEL, not the operator, so a transfer never
  //    moves it. Ownership changes; the requirement does not.
  const targetsTransferred = 0

  // 4. Seed the identity's plan only when it has none.
  let targetsSeeded = 0
  const { data: existingPlans } = await client
    .from('daily_target_plans')
    .select('id')
    .eq('organization_id', input.orgId)
    .eq('revenue_identity_id', input.identityId)
    .eq('active', true)
    .limit(1)
  if ((!existingPlans || existingPlans.length === 0) && input.ensureTargets !== false) {
    const pack = defaultTargetsForChannel(normalizeChannel(identity.channel))
    const { data: seeded, error: seedError } = await client
      .from('daily_target_plans')
      .insert(
        pack.map((row) => ({
          organization_id: input.orgId,
          revenue_identity_id: input.identityId,
          activity_type: row.activityType,
          target_count: row.targetCount,
          targetable: row.activityType !== 'proposal',
          active: true,
          created_by: input.actorRepId,
        })),
      )
      .select('id')
    if (seedError) throw seedError
    targetsSeeded = seeded?.length ?? 0
  }

  await client.from('coverage_events').insert({
    organization_id: input.orgId,
    profile_id: profileId,
    event_type: previousPrimaryRepId && previousPrimaryRepId !== input.repId ? 'COVERAGE_TRANSFERRED' : 'COVERAGE_ASSIGNED',
    primary_rep_id: input.repId,
    reason: previousPrimaryRepId ? `Transferred from ${previousPrimaryRepId}` : 'Assigned',
    actor_rep_id: input.actorRepId,
  })

  await client.from('accountability_audit_log').insert({
    organization_id: input.orgId,
    rep_id: input.actorRepId,
    revenue_identity_id: input.identityId,
    event_type: 'identity_assigned',
    detail: { rep_id: input.repId, previous_primary_rep_id: previousPrimaryRepId },
  })

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

  return { identityId: input.identityId, profileId, repId: input.repId, previousPrimaryRepId, targetsTransferred, targetsSeeded }
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
  const now = new Date().toISOString()

  const { data: existingRow } = await client
    .from('profile_coverage')
    .select('id, role, priority')
    .eq('organization_id', input.orgId)
    .eq('profile_id', profileId)
    .eq('rep_id', input.repId)
    .eq('active', true)
    .maybeSingle()

  // Already the owner: an operator seat would be a second active row for the
  // same rep, which the model forbids. Report it rather than silently demoting.
  if (existingRow?.role === 'PRIMARY') {
    return {
      identityId: input.identityId,
      profileId,
      repId: input.repId,
      previousPrimaryRepId: input.repId,
      targetsTransferred: 0,
      targetsSeeded: 0,
    }
  }

  const { error: assignmentError } = await client
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
  if (assignmentError) throw assignmentError

  let operatorRowId: string | null = null
  if (existingRow?.role === 'OPERATOR') {
    operatorRowId = existingRow.id as string
  } else {
    // A BACKUP seat is promoted in place; a new seat takes the next priority.
    if (existingRow?.role === 'BACKUP') {
      const { error: promoteError } = await client
        .from('profile_coverage')
        .update({ role: 'OPERATOR', updated_at: now })
        .eq('id', existingRow.id as string)
      if (promoteError) throw promoteError
      operatorRowId = existingRow.id as string
    } else {
      const { data: chain } = await client
        .from('profile_coverage')
        .select('priority')
        .eq('organization_id', input.orgId)
        .eq('profile_id', profileId)
        .eq('role', 'OPERATOR')
        .eq('active', true)
        .order('priority', { ascending: false })
        .limit(1)
      const priority = ((chain?.[0]?.priority as number | undefined) ?? 0) + 1
      const { data: inserted, error: insertError } = await client
        .from('profile_coverage')
        .insert({
          organization_id: input.orgId,
          profile_id: profileId,
          rep_id: input.repId,
          role: 'OPERATOR',
          priority,
          active: true,
          created_by: input.actorRepId,
        })
        .select('id')
      if (insertError) throw insertError
      operatorRowId = (inserted?.[0]?.id as string | undefined) ?? null
    }
  }

  if (operatorRowId) {
    await ensureOperatorAcknowledgement(client, {
      organizationId: input.orgId,
      profileId,
      repId: input.repId,
      sourceRowId: operatorRowId,
      assignedAt: now,
    })
  }

  await client.from('coverage_events').insert({
    organization_id: input.orgId,
    profile_id: profileId,
    event_type: 'OPERATOR_ADDED',
    primary_rep_id: input.repId,
    reason: 'Operator added',
    actor_rep_id: input.actorRepId,
  })

  await client.from('accountability_audit_log').insert({
    organization_id: input.orgId,
    rep_id: input.actorRepId,
    revenue_identity_id: input.identityId,
    event_type: 'identity_operator_added',
    detail: { rep_id: input.repId },
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

  const { data: existingRow } = await client
    .from('profile_coverage')
    .select('id, role')
    .eq('organization_id', input.orgId)
    .eq('profile_id', profileId)
    .eq('rep_id', input.repId)
    .eq('active', true)
    .maybeSingle()

  if (existingRow?.role === 'PRIMARY') {
    throw new Error('CANNOT_REMOVE_PRIMARY')
  }

  const { error: unassignError } = await client
    .from('identity_assignments')
    .delete()
    .eq('organization_id', input.orgId)
    .eq('revenue_identity_id', input.identityId)
    .eq('rep_id', input.repId)
  if (unassignError) throw unassignError

  if (profileId && existingRow) {
    await client
      .from('profile_coverage')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', existingRow.id as string)
  }
  if (profileId) {
    await client
      .from('responsibility_acknowledgements')
      .delete()
      .eq('organization_id', input.orgId)
      .eq('profile_id', profileId)
      .eq('rep_id', input.repId)
      .eq('subject', 'OPERATOR')
  }

  if (profileId) {
    await client.from('coverage_events').insert({
      organization_id: input.orgId,
      profile_id: profileId,
      event_type: 'OPERATOR_REMOVED',
      primary_rep_id: input.repId,
      reason: 'Operator removed',
      actor_rep_id: input.actorRepId,
    })
  }

  await client.from('accountability_audit_log').insert({
    organization_id: input.orgId,
    rep_id: input.actorRepId,
    revenue_identity_id: input.identityId,
    event_type: 'identity_operator_removed',
    detail: { rep_id: input.repId },
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

  const { error: assignmentError } = await client
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
  if (assignmentError) throw assignmentError

  const { data: existing } = await client
    .from('profile_coverage')
    .select('id, role')
    .eq('organization_id', input.orgId)
    .eq('profile_id', identity.profile_id)
    .eq('rep_id', input.repId)
    .eq('active', true)
    .maybeSingle()
  // An existing PRIMARY or OPERATOR seat already outranks a backup: keep it.
  if (!existing || existing.role === 'BACKUP') {
    if (existing) {
      await client
        .from('profile_coverage')
        .update({ role: 'BACKUP', updated_at: new Date().toISOString() })
        .eq('id', existing.id as string)
    } else {
      const { data: chain } = await client
        .from('profile_coverage')
        .select('priority')
        .eq('organization_id', input.orgId)
        .eq('profile_id', identity.profile_id)
        .eq('active', true)
        .order('priority', { ascending: false })
        .limit(1)
      const priority = ((chain?.[0]?.priority as number | undefined) ?? 1) + 1
      const { error: backupError } = await client
        .from('profile_coverage')
        .insert({
          organization_id: input.orgId,
          profile_id: identity.profile_id,
          rep_id: input.repId,
          role: 'BACKUP',
          priority,
          active: true,
          created_by: input.actorRepId,
        })
      if (backupError) throw backupError
    }
  }

  await client.from('accountability_audit_log').insert({
    organization_id: input.orgId,
    rep_id: input.actorRepId,
    revenue_identity_id: input.identityId,
    event_type: 'identity_backup_assigned',
    detail: { rep_id: input.repId },
  })

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

  const { data: existingRow } = await client
    .from('profile_coverage')
    .select('id, role')
    .eq('organization_id', input.orgId)
    .eq('profile_id', identity.profile_id)
    .eq('rep_id', input.repId)
    .eq('active', true)
    .maybeSingle()
  if (existingRow?.role === 'PRIMARY') {
    throw new Error('CANNOT_REMOVE_PRIMARY')
  }

  const now = new Date().toISOString()
  const { error: unassignError } = await client
    .from('identity_assignments')
    .delete()
    .eq('organization_id', input.orgId)
    .eq('revenue_identity_id', input.identityId)
    .eq('rep_id', input.repId)
  if (unassignError) throw unassignError

  if (identity?.profile_id && existingRow) {
    await client
      .from('profile_coverage')
      .update({ active: false, updated_at: now })
      .eq('id', existingRow.id as string)
    await client
      .from('responsibility_acknowledgements')
      .delete()
      .eq('organization_id', input.orgId)
      .eq('profile_id', identity.profile_id)
      .eq('rep_id', input.repId)
      .eq('subject', 'OPERATOR')
  }

  // The channel's plan and its completion history are untouched: removing an
  // operator never rewrites what the profile still owes or has already done.

  await client.from('accountability_audit_log').insert({
    organization_id: input.orgId,
    rep_id: input.actorRepId,
    revenue_identity_id: input.identityId,
    event_type: 'identity_unassigned',
    detail: { rep_id: input.repId },
  })

  return { profileId: (identity?.profile_id as string | null) ?? null }
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
  const now = new Date().toISOString()

  // The plan belongs to the channel, so a transfer never moves it. Ownership
  // changes; the requirement and its completion history stay put.
  const moved: never[] = []

  const { error: removeAssignmentError } = await client
    .from('identity_assignments')
    .delete()
    .eq('organization_id', input.orgId)
    .eq('revenue_identity_id', input.identityId)
    .eq('rep_id', input.fromRepId)
  if (removeAssignmentError) throw removeAssignmentError

  const { error: retireError } = await client
    .from('profile_coverage')
    .update({ active: false, updated_at: now })
    .eq('organization_id', input.orgId)
    .eq('profile_id', identity.profile_id)
    .eq('active', true)
    .or(`rep_id.eq.${input.toRepId},role.eq.PRIMARY`)
  if (retireError) throw retireError

  const { error: assignmentError } = await client
    .from('identity_assignments')
    .upsert(
      {
        organization_id: input.orgId,
        revenue_identity_id: input.identityId,
        rep_id: input.toRepId,
        assigned_by: input.actorRepId,
      },
      { onConflict: 'revenue_identity_id,rep_id' },
    )
  if (assignmentError) throw assignmentError

  const { error: primaryError } = await client
    .from('profile_coverage')
    .insert({
      organization_id: input.orgId,
      profile_id: identity.profile_id,
      rep_id: input.toRepId,
      role: 'PRIMARY',
      priority: 1,
      active: true,
      created_by: input.actorRepId,
    })
  if (primaryError) throw primaryError

  await client.from('coverage_events').insert({
    organization_id: input.orgId,
    profile_id: identity.profile_id,
    event_type: 'COVERAGE_TRANSFERRED',
    primary_rep_id: input.toRepId,
    reason: `Transferred from ${input.fromRepId}`,
    actor_rep_id: input.actorRepId,
  })

  await client.from('accountability_audit_log').insert({
    organization_id: input.orgId,
    rep_id: input.actorRepId,
    revenue_identity_id: input.identityId,
    event_type: 'identity_transferred',
    detail: { from_rep_id: input.fromRepId, to_rep_id: input.toRepId },
  })

  return {
    identityId: input.identityId,
    profileId: identity.profile_id,
    repId: input.toRepId,
    previousPrimaryRepId: input.fromRepId,
    targetsTransferred: moved?.length ?? 0,
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
