import { createServerSupabase } from '@/lib/supabase/server'
import type { DbClient } from '@/lib/db/types'
import type { CoverageMode } from './engine'
import { isCoverageExecutionMode, type CoverageExecutionMode } from './access'
import {
  ensureCoverageAcknowledgement,
  ensurePrimaryAcknowledgement,
} from '@/lib/responsibility/load'
import { notifyOnce } from '@/lib/notifications/deliver'
import { isMissingRelation } from '@/lib/operations/db-errors'
import { reassignAssignedTask } from '@/lib/tasks/assigned-tasks'
import { channelLabel } from '@/lib/profiles/channel'
import type { AuthContext } from '@/lib/auth/organization'

/** The profile's human label — identity name plus channel, never a bare id. */
async function coverageProfileLabel(
  client: DbClient,
  organizationId: string,
  profileId: string,
): Promise<string> {
  const { data: identity } = await client
    .from('revenue_identities')
    .select('identity_name, channel')
    .eq('organization_id', organizationId)
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  const name = (identity?.identity_name as string | null) ?? 'Profile'
  const channel = identity?.channel as string | null
  return channel ? `${name} · ${channelLabel(channel)}` : name
}

async function repLabel(
  client: DbClient,
  organizationId: string,
  repId: string,
  fallback: string,
): Promise<string> {
  const { data } = await client
    .from('reps')
    .select('name')
    .eq('organization_id', organizationId)
    .eq('id', repId)
    .maybeSingle()
  return (data?.name as string | null) ?? fallback
}

/**
 * Coverage writes. Every mutation is explicit, audited and idempotent where a
 * double-click is possible. The first release only acts on APPROVAL_REQUIRED
 * items an admin approved — nothing here runs on a timer.
 *
 * Partial failure is reported, never hidden: `approveCoveragePlan` returns one
 * result per item so the UI can show "Coverage partially applied" and retry.
 */

function isMissing(error: { code?: string; message?: string } | null): boolean {
  return isMissingRelation(error)
}

export interface SetAvailabilityInput {
  organizationId: string
  repId: string
  businessDate: string
  state: 'AVAILABLE' | 'WORKING' | 'ON_LEAVE' | 'OFFLINE' | 'CHECKED_OUT' | 'UNAVAILABLE'
  source: 'SCHEDULE' | 'SELF' | 'MANAGER' | 'ADMIN' | 'SYSTEM'
  note?: string | null
  effectiveFrom?: string | null
  effectiveUntil?: string | null
  actorRepId: string
  client?: DbClient
}

export async function setRepAvailability(input: SetAvailabilityInput): Promise<{ ok: boolean; error?: string }> {
  const client = input.client ?? (await createServerSupabase())
  const now = new Date().toISOString()
  const payload = {
    organization_id: input.organizationId,
    rep_id: input.repId,
    business_date: input.businessDate,
    state: input.state,
    source: input.source,
    note: input.note ?? null,
    effective_from: input.effectiveFrom ?? null,
    effective_until: input.effectiveUntil ?? null,
    created_by: input.actorRepId,
    updated_at: now,
  }

  const { error } = await client
    .from('rep_availability')
    .upsert(payload, { onConflict: 'organization_id,rep_id,business_date' })
  if (error) {
    if (isMissing(error)) return { ok: false, error: 'The availability table is not migrated yet.' }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function acknowledgeReadiness(input: {
  organizationId: string
  profileId: string
  repId: string
  note?: string | null
  actorRepId: string
  client?: DbClient
}): Promise<{ ok: boolean; error?: string }> {
  const client = input.client ?? (await createServerSupabase())
  const { error } = await client
    .from('profile_readiness')
    .upsert(
      {
        organization_id: input.organizationId,
        profile_id: input.profileId,
        rep_id: input.repId,
        acknowledged_by: input.actorRepId,
        acknowledged_at: new Date().toISOString(),
        note: input.note ?? null,
      },
      { onConflict: 'organization_id,profile_id,rep_id' },
    )
  if (error) {
    if (isMissing(error)) return { ok: false, error: 'The readiness table is not migrated yet.' }
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export interface CoverageApprovalItemInput {
  profileId: string
  primaryRepId: string
  coveringRepId: string
  kind: 'COVER' | 'RESTORE_PRIMARY'
  reason: string
  effectiveUntil?: string | null
  /** Supplied by the server; never trusted from the request body. */
  businessDate: string
  /** SHARED keeps the primary executing; REPLACE excludes it. */
  mode?: CoverageExecutionMode
  /** Restore only: move open profile-bound tasks back to the primary. */
  returnOpenTasks?: boolean
  /** Restore only: a specific subset of open tasks. Takes precedence. */
  returnTaskIds?: string[]
}

export interface CoverageApprovalResult {
  profileId: string
  coveringRepId: string
  applied: boolean
  assignmentId?: string
  error?: string
}

/**
 * Apply an approved coverage plan. One result per item: a failed item does not
 * roll back the others, and the caller must surface the partial state.
 */
export async function approveCoveragePlan(input: {
  organizationId: string
  items: CoverageApprovalItemInput[]
  actorRepId: string
  actorName: string
  /** Required for the profile-bound task handoff; without it coverage still
   *  activates, but tasks stay with the primary. */
  auth?: AuthContext
  client?: DbClient
}): Promise<{ ok: boolean; results: CoverageApprovalResult[] }> {
  const client = input.client ?? (await createServerSupabase())
  const results: CoverageApprovalResult[] = []

  for (const item of input.items) {
    if (item.kind === 'RESTORE_PRIMARY') {
      const restored = await restorePrimaryCoverage({
        organizationId: input.organizationId,
        profileId: item.profileId,
        actorRepId: input.actorRepId,
        actorName: input.actorName,
        reason: item.reason,
        businessDate: item.businessDate,
        returnOpenTasks: item.returnOpenTasks ?? false,
        returnTaskIds: item.returnTaskIds,
        auth: input.auth,
        client,
      })
      results.push({
        profileId: item.profileId,
        coveringRepId: item.coveringRepId,
        applied: restored.ok,
        assignmentId: restored.assignmentId,
        error: restored.error,
      })
      continue
    }

    const mode: CoverageExecutionMode = item.mode ?? 'REPLACE'

    // Conflict guard: all overlapping active coverage for one profile must
    // share a mode. A mix is never allowed to be ambiguous.
    const { data: existingActive } = await client
      .from('coverage_assignments')
      .select('id, coverage_mode')
      .eq('organization_id', input.organizationId)
      .eq('profile_id', item.profileId)
      .eq('status', 'ACTIVE')
      .limit(50)
    const conflicting = (existingActive ?? []).some(
      (row) =>
        isCoverageExecutionMode(row.coverage_mode) && row.coverage_mode !== mode,
    )
    if (conflicting) {
      results.push({
        profileId: item.profileId,
        coveringRepId: item.coveringRepId,
        applied: false,
        error: 'Conflicting coverage mode for this profile. End the existing coverage first.',
      })
      continue
    }

    // Eligibility guard: the covering rep must hold eligibility on this profile.
    // The plan already recommends eligible backups; this keeps the action safe
    // for any caller.
    const { data: profileIdentities } = await client
      .from('revenue_identities')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('profile_id', item.profileId)
      .eq('status', 'active')
      .limit(50)
    const identityIds = (profileIdentities ?? []).map((row) => row.id as string)
    let eligible = false
    if (identityIds.length > 0) {
      const { data: eligibilityRows } = await client
        .from('identity_assignments')
        .select('id')
        .eq('organization_id', input.organizationId)
        .eq('rep_id', item.coveringRepId)
        .in('revenue_identity_id', identityIds)
        .limit(1)
      eligible = (eligibilityRows?.length ?? 0) > 0
    }
    if (!eligible) {
      results.push({
        profileId: item.profileId,
        coveringRepId: item.coveringRepId,
        applied: false,
        error: 'The covering rep has no eligibility on this profile.',
      })
      continue
    }

    const { data, error } = await client
      .from('coverage_assignments')
      .insert({
        organization_id: input.organizationId,
        profile_id: item.profileId,
        primary_rep_id: item.primaryRepId,
        covering_rep_id: item.coveringRepId,
        effective_from: item.businessDate,
        effective_until: item.effectiveUntil ?? null,
        reason: item.reason,
        status: 'ACTIVE',
        coverage_mode: mode,
        approved_by: input.actorRepId,
        created_by: input.actorRepId,
      })
      .select('id')
      .maybeSingle()

    if (error || !data) {
      results.push({
        profileId: item.profileId,
        coveringRepId: item.coveringRepId,
        applied: false,
        error: error?.message ?? 'Insert failed',
      })
      continue
    }

    const assignmentId = data.id as string
    const assignedAt = new Date().toISOString()
    await client.from('coverage_events').insert({
      organization_id: input.organizationId,
      profile_id: item.profileId,
      assignment_id: assignmentId,
      event_type: 'COVERAGE_ACTIVATED',
      primary_rep_id: item.primaryRepId,
      covering_rep_id: item.coveringRepId,
      reason: item.reason,
      effective_from: item.businessDate,
      effective_until: item.effectiveUntil ?? null,
      coverage_mode: mode,
      actor_rep_id: input.actorRepId,
    })

    await ensureCoverageAcknowledgement(client, {
      organizationId: input.organizationId,
      profileId: item.profileId,
      repId: item.coveringRepId,
      coverageAssignmentId: assignmentId,
      assignedAt,
    })

    await notifyCoverageActivated(client, {
      organizationId: input.organizationId,
      profileId: item.profileId,
      primaryRepId: item.primaryRepId,
      coveringRepId: item.coveringRepId,
      actorRepId: input.actorRepId,
      reason: item.reason,
      mode,
    })

    // REPLACE moves profile-bound work to the covering rep; SHARED does not
    // duplicate or move anything. Personal tasks never move.
    if (input.auth && mode === 'REPLACE') {
      await handoffProfileTasks(client, input.auth, {
        profileId: item.profileId,
        fromRepId: item.primaryRepId,
        toRepId: item.coveringRepId,
      })
    }

    results.push({ profileId: item.profileId, coveringRepId: item.coveringRepId, applied: true, assignmentId })
  }

  return { ok: results.every((result) => result.applied), results }
}

/**
 * Move profile-bound tasks from the primary to the covering rep. Personal
 * tasks (no profile_id) are never touched. Uses the canonical reassign path,
 * so scope, audit and notification behave exactly like a manual reassignment.
 */
async function handoffProfileTasks(
  client: DbClient,
  auth: AuthContext,
  input: { profileId: string; fromRepId: string; toRepId: string },
): Promise<void> {
  const { data: tasks, error } = await client
    .from('assigned_tasks')
    .select('id')
    .eq('organization_id', auth.orgId)
    .eq('profile_id', input.profileId)
    .eq('assignee_rep_id', input.fromRepId)
    .in('status', ['OPEN', 'IN_PROGRESS', 'WAITING'])
    .limit(200)
  if (error || !tasks || tasks.length === 0) return

  for (const task of tasks) {
    try {
      await reassignAssignedTask(client, auth, task.id as string, input.toRepId)
    } catch (err) {
      // A task that cannot move (scope, permissions) must not block coverage.
      console.warn('[coverage] task handoff failed', {
        taskId: task.id,
        profileId: input.profileId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

async function notifyCoverageActivated(
  client: DbClient,
  input: {
    organizationId: string
    profileId: string
    primaryRepId: string
    coveringRepId: string
    actorRepId: string
    reason: string
    mode: CoverageExecutionMode
  },
): Promise<void> {
  const label = await coverageProfileLabel(client, input.organizationId, input.profileId)
  const primaryName = await repLabel(client, input.organizationId, input.primaryRepId, 'the primary')
  const coveringName = await repLabel(client, input.organizationId, input.coveringRepId, 'A colleague')

  const operatorLine =
    input.mode === 'SHARED'
      ? `${label} — you'll work this profile alongside ${primaryName}. ${input.reason}`.trim()
      : `${label} — you're covering this profile for ${primaryName}. ${input.reason}`.trim()

  await notifyOnce(client, {
    organizationId: input.organizationId,
    recipientId: input.coveringRepId,
    type: 'coverage_activated',
    title: 'Temporary responsibility assigned',
    body: operatorLine,
    link: '/dashboard',
    dedupeKey: `coverage_activated:${input.profileId}:${input.coveringRepId}`,
  })
  if (input.primaryRepId !== input.actorRepId) {
    const ownerLine =
      input.mode === 'SHARED'
        ? `${coveringName} is joining you on ${label} temporarily. Your ownership is unchanged.`
        : `${coveringName} is covering ${label} temporarily. Your ownership is unchanged. Execution is paused for you until restore.`
    await notifyOnce(client, {
      organizationId: input.organizationId,
      recipientId: input.primaryRepId,
      type: 'coverage_activated_primary',
      title: 'Coverage activated',
      body: ownerLine,
      link: '/dashboard',
      dedupeKey: `coverage_activated_primary:${input.profileId}:${input.primaryRepId}`,
    })
  }
}

/**
 * End an active coverage assignment and restore the primary. Historical
 * attribution is untouched — this only closes the temporary responsibility.
 */
export async function restorePrimaryCoverage(input: {
  organizationId: string
  profileId: string
  actorRepId: string
  actorName: string
  reason: string
  businessDate: string
  /** Move the covering rep's open profile-bound tasks back to the primary. */
  returnOpenTasks?: boolean
  /** A specific subset of tasks to return; when set, only these move. */
  returnTaskIds?: string[]
  auth?: AuthContext
  client?: DbClient
}): Promise<{ ok: boolean; assignmentId?: string; error?: string }> {
  const client = input.client ?? (await createServerSupabase())

  const { data: activeRows } = await client
    .from('coverage_assignments')
    .select('id, covering_rep_id, primary_rep_id, coverage_mode')
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
    .eq('status', 'ACTIVE')
    .limit(50)

  if (!activeRows || activeRows.length === 0) return { ok: true, assignmentId: undefined }

  const { error } = await client
    .from('coverage_assignments')
    .update({
      status: 'COMPLETED',
      effective_until: input.businessDate,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
    .eq('status', 'ACTIVE')
  if (error) return { ok: false, error: error.message }

  for (const row of activeRows) {
    await client.from('coverage_events').insert({
      organization_id: input.organizationId,
      profile_id: input.profileId,
      assignment_id: row.id as string,
      event_type: 'COVERAGE_RESTORED',
      primary_rep_id: row.primary_rep_id as string,
      covering_rep_id: row.covering_rep_id as string,
      reason: input.reason,
      coverage_mode: isCoverageExecutionMode(row.coverage_mode) ? row.coverage_mode : null,
      actor_rep_id: input.actorRepId,
    })
  }

  const label = await coverageProfileLabel(client, input.organizationId, input.profileId)
  const primaryRepId = activeRows[0].primary_rep_id as string
  const primaryName = await repLabel(client, input.organizationId, primaryRepId, 'the primary')
  const coveringRepIds = [...new Set(activeRows.map((row) => row.covering_rep_id as string))]

  for (const coveringRepId of coveringRepIds) {
    await notifyOnce(client, {
      organizationId: input.organizationId,
      recipientId: coveringRepId,
      type: 'coverage_ended',
      title: 'Coverage ended',
      body: `${label} is restored to ${primaryName}. ${input.reason}`.trim(),
      link: '/dashboard',
      dedupeKey: `coverage_ended:${input.profileId}:${coveringRepId}`,
    })
  }
  await notifyOnce(client, {
    organizationId: input.organizationId,
    recipientId: primaryRepId,
    type: 'coverage_restored_primary',
    title: 'Responsibility restored',
    body: `${label} is restored to you. Your ownership never changed.`,
    link: '/dashboard',
    dedupeKey: `coverage_restored_primary:${input.profileId}`,
  })

  // Manual restore decision: open profile-bound work may return to the primary.
  // Completed work stays attributed to the covering rep — never rewritten.
  if ((input.returnOpenTasks || (input.returnTaskIds && input.returnTaskIds.length > 0)) && input.auth) {
    for (const coveringRepId of coveringRepIds) {
      await returnProfileTasksToPrimary(client, input.auth, {
        profileId: input.profileId,
        fromRepId: coveringRepId,
        toRepId: primaryRepId,
      }, input.returnTaskIds)
    }
  }

  return { ok: true, assignmentId: activeRows[0].id as string }
}

/**
 * Return open profile-bound tasks to the primary after a manual restore.
 * Personal tasks (no profile_id) and completed/cancelled work are untouched.
 */
async function returnProfileTasksToPrimary(
  client: DbClient,
  auth: AuthContext,
  input: { profileId: string; fromRepId: string; toRepId: string },
  onlyTaskIds?: string[],
): Promise<void> {
  let query = client
    .from('assigned_tasks')
    .select('id')
    .eq('organization_id', auth.orgId)
    .eq('profile_id', input.profileId)
    .eq('assignee_rep_id', input.fromRepId)
    .in('status', ['OPEN', 'IN_PROGRESS', 'WAITING'])
    .limit(200)
  if (onlyTaskIds && onlyTaskIds.length > 0) {
    query = query.in('id', onlyTaskIds.slice(0, 200))
  }
  const { data: tasks, error } = await query
  if (error || !tasks || tasks.length === 0) return

  for (const task of tasks) {
    try {
      await reassignAssignedTask(client, auth, task.id as string, input.toRepId, 'Primary returned to work')
    } catch (err) {
      console.warn('[coverage] task return failed', {
        taskId: task.id,
        profileId: input.profileId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export async function revokeCoverage(input: {
  organizationId: string
  profileId: string
  actorRepId: string
  reason: string
  businessDate?: string
  /** Move the covering rep's open profile-bound tasks back to the primary. */
  returnOpenTasks?: boolean
  /** A specific subset of tasks to return; when set, only these move. */
  returnTaskIds?: string[]
  auth?: AuthContext
  client?: DbClient
}): Promise<{ ok: boolean; error?: string }> {
  const client = input.client ?? (await createServerSupabase())
  const now = new Date().toISOString()
  const businessDate = input.businessDate ?? now.slice(0, 10)

  const { data: activeRows } = await client
    .from('coverage_assignments')
    .select('id, covering_rep_id, primary_rep_id, coverage_mode')
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
    .eq('status', 'ACTIVE')
    .limit(50)
  if (!activeRows || activeRows.length === 0) return { ok: true }

  const { error } = await client
    .from('coverage_assignments')
    .update({
      status: 'REVOKED',
      effective_until: businessDate,
      revoked_at: now,
      revoked_by: input.actorRepId,
      revoke_reason: input.reason,
      updated_at: now,
    })
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
    .eq('status', 'ACTIVE')
  if (error) return { ok: false, error: error.message }

  for (const row of activeRows) {
    await client.from('coverage_events').insert({
      organization_id: input.organizationId,
      profile_id: input.profileId,
      assignment_id: row.id as string,
      event_type: 'COVERAGE_REVOKED',
      primary_rep_id: row.primary_rep_id as string,
      covering_rep_id: row.covering_rep_id as string,
      reason: input.reason,
      coverage_mode: isCoverageExecutionMode(row.coverage_mode) ? row.coverage_mode : null,
      actor_rep_id: input.actorRepId,
    })
  }

  // Revoke uses the same canonical task policy as restore: open profile-bound
  // work returns to the primary; completed/cancelled and personal tasks stay.
  const primaryRepId = activeRows[0].primary_rep_id as string
  const coveringRepIds = [...new Set(activeRows.map((row) => row.covering_rep_id as string))]
  if ((input.returnOpenTasks || (input.returnTaskIds && input.returnTaskIds.length > 0)) && input.auth) {
    for (const coveringRepId of coveringRepIds) {
      await returnProfileTasksToPrimary(client, input.auth, {
        profileId: input.profileId,
        fromRepId: coveringRepId,
        toRepId: primaryRepId,
      }, input.returnTaskIds)
    }
  }

  const label = await coverageProfileLabel(client, input.organizationId, input.profileId)
  for (const coveringRepId of coveringRepIds) {
    await notifyOnce(client, {
      organizationId: input.organizationId,
      recipientId: coveringRepId,
      type: 'coverage_ended',
      title: 'Coverage revoked',
      body: `${label} coverage was revoked. ${input.reason}`.trim(),
      link: '/dashboard',
      dedupeKey: `coverage_revoked:${input.profileId}:${coveringRepId}`,
    })
  }
  await notifyOnce(client, {
    organizationId: input.organizationId,
    recipientId: primaryRepId,
    type: 'coverage_restored_primary',
    title: 'Responsibility restored',
    body: `${label} is restored to you. Your ownership never changed.`,
    link: '/dashboard',
    dedupeKey: `coverage_restored_primary:${input.profileId}`,
  })

  return { ok: true }
}

/**
 * Configure the ordered coverage chain for one profile. Replaces the existing
 * configuration in a single pass; the previous chain is deactivated, not
 * deleted, so the audit trail keeps it.
 */
export async function configureCoverage(input: {
  organizationId: string
  profileId: string
  primaryRepId: string
  backups: Array<{ repId: string; priority: number }>
  actorRepId: string
  client?: DbClient
}): Promise<{ ok: boolean; error?: string }> {
  const client = input.client ?? (await createServerSupabase())
  const now = new Date().toISOString()

  const { error: deactivateError } = await client
    .from('profile_coverage')
    .update({ active: false, updated_at: now })
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
  if (deactivateError) return { ok: false, error: deactivateError.message }

  // priority is 1-based: the column carries `check (priority >= 1)`, so the
  // primary is 1 and backups follow in order. The engine orders by this value.
  const rows = [
    { role: 'PRIMARY' as const, repId: input.primaryRepId, priority: 1 },
    ...input.backups.map((backup, index) => ({
      role: 'BACKUP' as const,
      repId: backup.repId,
      priority: index + 2,
    })),
  ]

  const { data: inserted, error: insertError } = await client.from('profile_coverage').insert(
    rows.map((row) => ({
      organization_id: input.organizationId,
      profile_id: input.profileId,
      rep_id: row.repId,
      role: row.role,
      priority: row.priority,
      active: true,
      created_by: input.actorRepId,
    })),
  ).select('id')
  if (insertError) return { ok: false, error: insertError.message }

  // The PRIMARY row is first in `rows`, so its id is the new ownership episode.
  const primaryRowId = (inserted?.[0]?.id as string | undefined) ?? null
  if (primaryRowId) {
    await ensurePrimaryAcknowledgement(client, {
      organizationId: input.organizationId,
      profileId: input.profileId,
      repId: input.primaryRepId,
      sourceRowId: primaryRowId,
      assignedAt: now,
    })
  }

  await client.from('coverage_events').insert({
    organization_id: input.organizationId,
    profile_id: input.profileId,
    event_type: 'BACKUP_CONFIGURED',
    primary_rep_id: input.primaryRepId,
    reason: `${rows.length - 1} backup${rows.length === 1 ? '' : 's'} configured`,
    actor_rep_id: input.actorRepId,
  })

  return { ok: true }
}

export type { CoverageMode }
