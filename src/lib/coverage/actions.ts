import { createServerSupabase } from '@/lib/supabase/server'
import type { DbClient } from '@/lib/db/types'
import type { CoverageMode } from './engine'
import { notifyOnce } from '@/lib/notifications/deliver'
import { isMissingRelation } from '@/lib/operations/db-errors'

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
      actor_rep_id: input.actorRepId,
    })

    await notifyCoverageActivated(client, {
      organizationId: input.organizationId,
      profileId: item.profileId,
      primaryRepId: item.primaryRepId,
      coveringRepId: item.coveringRepId,
      actorRepId: input.actorRepId,
      reason: item.reason,
    })

    results.push({ profileId: item.profileId, coveringRepId: item.coveringRepId, applied: true, assignmentId })
  }

  return { ok: results.every((result) => result.applied), results }
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
  },
): Promise<void> {
  await notifyOnce(client, {
    organizationId: input.organizationId,
    recipientId: input.coveringRepId,
    type: 'coverage_activated',
    title: 'You are covering a profile today',
    body: input.reason,
    link: '/dashboard',
    dedupeKey: `coverage_activated:${input.profileId}:${input.coveringRepId}`,
  })
  if (input.primaryRepId !== input.actorRepId) {
    await notifyOnce(client, {
      organizationId: input.organizationId,
      recipientId: input.primaryRepId,
      type: 'coverage_activated_primary',
      title: 'Coverage activated while you are away',
      body: input.reason,
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
  client?: DbClient
}): Promise<{ ok: boolean; assignmentId?: string; error?: string }> {
  const client = input.client ?? (await createServerSupabase())

  const { data: active } = await client
    .from('coverage_assignments')
    .select('id, covering_rep_id, primary_rep_id')
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
    .eq('status', 'ACTIVE')
    .maybeSingle()

  if (!active) return { ok: true, assignmentId: undefined }

  const { error } = await client
    .from('coverage_assignments')
    .update({
      status: 'COMPLETED',
      effective_until: input.businessDate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', active.id as string)
  if (error) return { ok: false, error: error.message }

  await client.from('coverage_events').insert({
    organization_id: input.organizationId,
    profile_id: input.profileId,
    assignment_id: active.id as string,
    event_type: 'COVERAGE_RESTORED',
    primary_rep_id: active.primary_rep_id as string,
    covering_rep_id: active.covering_rep_id as string,
    reason: input.reason,
    actor_rep_id: input.actorRepId,
  })

  await notifyOnce(client, {
    organizationId: input.organizationId,
    recipientId: active.covering_rep_id as string,
    type: 'coverage_ended',
    title: 'Coverage ended',
    body: input.reason,
    link: '/dashboard',
    dedupeKey: `coverage_ended:${input.profileId}`,
  })

  return { ok: true, assignmentId: active.id as string }
}

export async function revokeCoverage(input: {
  organizationId: string
  profileId: string
  actorRepId: string
  reason: string
  client?: DbClient
}): Promise<{ ok: boolean; error?: string }> {
  const client = input.client ?? (await createServerSupabase())
  const now = new Date().toISOString()

  const { data: active } = await client
    .from('coverage_assignments')
    .select('id, covering_rep_id, primary_rep_id')
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
    .eq('status', 'ACTIVE')
    .maybeSingle()
  if (!active) return { ok: true }

  const { error } = await client
    .from('coverage_assignments')
    .update({
      status: 'REVOKED',
      revoked_at: now,
      revoked_by: input.actorRepId,
      revoke_reason: input.reason,
      updated_at: now,
    })
    .eq('id', active.id as string)
  if (error) return { ok: false, error: error.message }

  await client.from('coverage_events').insert({
    organization_id: input.organizationId,
    profile_id: input.profileId,
    assignment_id: active.id as string,
    event_type: 'COVERAGE_REVOKED',
    primary_rep_id: active.primary_rep_id as string,
    covering_rep_id: active.covering_rep_id as string,
    reason: input.reason,
    actor_rep_id: input.actorRepId,
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

  const { error: insertError } = await client.from('profile_coverage').insert(
    rows.map((row) => ({
      organization_id: input.organizationId,
      profile_id: input.profileId,
      rep_id: row.repId,
      role: row.role,
      priority: row.priority,
      active: true,
      created_by: input.actorRepId,
    })),
  )
  if (insertError) return { ok: false, error: insertError.message }

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
