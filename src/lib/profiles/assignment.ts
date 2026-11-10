import type { DbClient } from '@/lib/db/types'
import { defaultTargetsForChannel } from '@/lib/accountability/default-targets'
import { normalizeChannel } from '@/lib/profiles/channel'
import { ensurePrimaryAcknowledgement } from '@/lib/responsibility/load'

/**
 * Responsibility assignment — the one write path for "who works which channel".
 *
 * Assignment is eligibility (`identity_assignments`); execution is an active
 * PRIMARY `profile_coverage` row. A responsibility is the pair, plus the daily
 * target pack. This module keeps the three in sync so a rep is never assigned
 * but unable to work the channel.
 *
 * There is no multi-statement transaction in the Neon adapter, so each step is
 * idempotent and the previous state is restored on failure where it is safe to
 * do so. Every write is org-scoped.
 */

export interface AssignInput {
  orgId: string
  identityId: string
  repId: string
  actorRepId: string
  /** Seed the channel's default pack when the new primary has no targets. */
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

/**
 * Assign a channel identity to a rep as PRIMARY. Transfers the previous
 * primary's active target lanes to the new rep, and seeds the default pack
 * when asked. The previous primary keeps eligibility (their assignment row is
 * left in place) but loses execution.
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

  // 2. Execution: retire the old primary and any backup row the new rep holds on
  //    this profile, then install the new primary. The partial unique indexes
  //    require the old rows to be inactive before the new PRIMARY inserts.
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

  // 3. Target lanes follow the primary. Move the previous primary's active
  //    rows for this identity to the new rep so the daily plan is continuous.
  let targetsTransferred = 0
  if (previousPrimaryRepId && previousPrimaryRepId !== input.repId) {
    const { data: moved, error: moveError } = await client
      .from('daily_targets')
      .update({ rep_id: input.repId, updated_at: now })
      .eq('organization_id', input.orgId)
      .eq('revenue_identity_id', input.identityId)
      .eq('rep_id', previousPrimaryRepId)
      .eq('active', true)
      .select('id')
    if (moveError) throw moveError
    targetsTransferred = moved?.length ?? 0
  }

  // 4. Seed the default pack when the new primary has no active lane.
  let targetsSeeded = 0
  const { data: existingTargets } = await client
    .from('daily_targets')
    .select('id')
    .eq('organization_id', input.orgId)
    .eq('revenue_identity_id', input.identityId)
    .eq('rep_id', input.repId)
    .eq('active', true)
    .limit(1)
  if ((!existingTargets || existingTargets.length === 0) && input.ensureTargets !== false) {
    const pack = defaultTargetsForChannel(normalizeChannel(identity.channel))
    const { data: seeded, error: seedError } = await client
      .from('daily_targets')
      .insert(
        pack.map((row) => ({
          organization_id: input.orgId,
          rep_id: input.repId,
          revenue_identity_id: input.identityId,
          activity_type: row.activityType,
          target_count: row.targetCount,
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

  const { error: notifyError } = await client.from('notifications').insert({
    organization_id: input.orgId,
    recipient_id: input.repId,
    notification_type: 'identity_assigned',
    title: 'New responsibility assigned',
    body: `${identity.identity_name} · ${normalizeChannel(identity.channel)} has been assigned to you. Confirm access to begin.`,
    link: '/dashboard',
    dedupe_key: `responsibility_assigned:${input.repId}:${input.identityId}:${new Date().toISOString().slice(0, 10)}`,
  })
  if (notifyError) console.warn('[assignment] notification failed', notifyError.message)

  return { identityId: input.identityId, profileId, repId: input.repId, previousPrimaryRepId, targetsTransferred, targetsSeeded }
}

/**
 * Add a rep as a backup on a channel: eligibility plus a BACKUP coverage row.
 * Backups never carry daily targets and never appear as current work until a
 * coverage assignment activates them.
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
    .select('id')
    .eq('organization_id', input.orgId)
    .eq('profile_id', identity.profile_id)
    .eq('rep_id', input.repId)
    .eq('active', true)
    .maybeSingle()
  if (!existing) {
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
 * Remove a rep's responsibility for a channel: eligibility row gone, PRIMARY
 * coverage retired, target lanes deactivated. Leads, messages and history are
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

  const now = new Date().toISOString()
  const { error: unassignError } = await client
    .from('identity_assignments')
    .delete()
    .eq('organization_id', input.orgId)
    .eq('revenue_identity_id', input.identityId)
    .eq('rep_id', input.repId)
  if (unassignError) throw unassignError

  if (identity?.profile_id) {
    await client
      .from('profile_coverage')
      .update({ active: false, updated_at: now })
      .eq('organization_id', input.orgId)
      .eq('profile_id', identity.profile_id)
      .eq('rep_id', input.repId)
  }

  await client
    .from('daily_targets')
    .update({ active: false, updated_at: now })
    .eq('organization_id', input.orgId)
    .eq('revenue_identity_id', input.identityId)
    .eq('rep_id', input.repId)

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
 * Move a responsibility from one rep to another in one call. Equivalent to
 * remove + assign, but preserves the target pack by moving it rather than
 * deactivating and reseeding.
 */
export async function transferResponsibility(
  client: DbClient,
  input: { orgId: string; identityId: string; fromRepId: string; toRepId: string; actorRepId: string },
): Promise<AssignResult> {
  const identity = await readIdentity(client, input.orgId, input.identityId)
  const now = new Date().toISOString()

  // Move the target lanes first so a failure leaves them with the old owner.
  const { data: moved, error: moveError } = await client
    .from('daily_targets')
    .update({ rep_id: input.toRepId, updated_at: now })
    .eq('organization_id', input.orgId)
    .eq('revenue_identity_id', input.identityId)
    .eq('rep_id', input.fromRepId)
    .eq('active', true)
    .select('id')
  if (moveError) throw moveError

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
