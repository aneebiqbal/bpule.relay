import type { DbClient } from '@/lib/db/types'
import { personNameFromProfile } from '@/lib/profiles/person-name'
import {
  acknowledgementStage,
  elapsedMinutes,
  type AcknowledgementStage,
} from './ack-policy'

/**
 * Responsibility acknowledgement — the canonical read/write model.
 *
 * ACKNOWLEDGED means "I saw and accepted this responsibility".
 * ACCESS ISSUE means "I cannot operate this account".
 * Neither implies the other; neither changes ownership or execution.
 */

export const ACCESS_ISSUES = [
  'CANNOT_LOG_IN',
  'CREDENTIALS_MISSING',
  'TWO_FA_BLOCKED',
  'ACCOUNT_RESTRICTED',
  'OTHER',
] as const

export type AccessIssue = (typeof ACCESS_ISSUES)[number]

export function isAccessIssue(value: unknown): value is AccessIssue {
  return typeof value === 'string' && (ACCESS_ISSUES as readonly string[]).includes(value)
}

export interface ResponsibilityAcknowledgementView {
  id: string
  profileId: string
  profileName: string
  channel: string | null
  repId: string
  subject: 'PRIMARY' | 'COVERAGE' | 'OPERATOR'
  mode: 'SHARED' | 'REPLACE' | null
  assignedAt: string
  acknowledgedAt: string | null
  stage: AcknowledgementStage
  elapsedMinutes: number
  accessIssue: AccessIssue | null
  accessIssueNote: string | null
  coverageAssignmentId: string | null
  sourceRowId: string | null
}

export interface ResponsibilityAttentionItem extends ResponsibilityAcknowledgementView {
  repName: string
}

type AckRow = {
  id: string
  profile_id: string
  rep_id: string
  subject: string
  coverage_assignment_id: string | null
  source_row_id: string | null
  assigned_at: string
  acknowledged_at: string | null
  access_issue: string | null
  access_issue_note: string | null
}

const ACK_COLUMNS =
  'id, profile_id, rep_id, subject, coverage_assignment_id, source_row_id, assigned_at, acknowledged_at, access_issue, access_issue_note'

async function loadProfileLabels(
  client: DbClient,
  orgId: string,
  profileIds: string[],
): Promise<Map<string, { name: string; channel: string | null }>> {
  const out = new Map<string, { name: string; channel: string | null }>()
  if (profileIds.length === 0) return out
  const [profileRows, identityRows] = await Promise.all([
    client
      .from('profiles')
      .select('id, display_name, full_name, label')
      .eq('organization_id', orgId)
      .in('id', profileIds)
      .limit(500),
    client
      .from('revenue_identities')
      .select('profile_id, channel')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(500),
  ])
  const channelByProfile = new Map<string, string | null>()
  for (const row of (identityRows.data ?? []) as Array<{ profile_id: string | null; channel: string | null }>) {
    if (row.profile_id && !channelByProfile.has(row.profile_id)) {
      channelByProfile.set(row.profile_id, row.channel ?? null)
    }
  }
  for (const row of (profileRows.data ?? []) as Array<{
    id: string
    display_name: string | null
    full_name: string | null
    label: string | null
  }>) {
    out.set(row.id, {
      name: personNameFromProfile(row),
      channel: channelByProfile.get(row.id) ?? null,
    })
  }
  return out
}

function toView(
  row: AckRow,
  label: { name: string; channel: string | null },
  now: string,
  mode: 'SHARED' | 'REPLACE' | null,
): ResponsibilityAcknowledgementView {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileName: label.name,
    channel: label.channel,
    repId: row.rep_id,
    subject: row.subject === 'COVERAGE' ? 'COVERAGE' : row.subject === 'OPERATOR' ? 'OPERATOR' : 'PRIMARY',
    mode,
    assignedAt: row.assigned_at,
    acknowledgedAt: row.acknowledged_at,
    stage: acknowledgementStage(row.assigned_at, now, row.acknowledged_at),
    elapsedMinutes: elapsedMinutes(row.assigned_at, now),
    accessIssue: isAccessIssue(row.access_issue) ? row.access_issue : null,
    accessIssueNote: row.access_issue_note ?? null,
    coverageAssignmentId: row.coverage_assignment_id ?? null,
    sourceRowId: row.source_row_id ?? null,
  }
}

/** Unacknowledged (and open-access-issue) responsibilities for one rep. */
export async function listAcknowledgementsForRep(
  client: DbClient,
  orgId: string,
  repId: string,
  now: string,
  options: { modeByAssignment?: Map<string, 'SHARED' | 'REPLACE' | null> } = {},
): Promise<ResponsibilityAcknowledgementView[]> {
  const { data, error } = await client
    .from('responsibility_acknowledgements')
    .select(ACK_COLUMNS)
    .eq('organization_id', orgId)
    .eq('rep_id', repId)
    .is('acknowledged_at', null)
    .limit(100)
  if (error) throw error
  const rows = (data ?? []) as AckRow[]
  if (rows.length === 0) return []
  const labels = await loadProfileLabels(
    client,
    orgId,
    [...new Set(rows.map((row) => row.profile_id))],
  )
  return rows.map((row) =>
    toView(
      row,
      labels.get(row.profile_id) ?? { name: 'Profile', channel: null },
      now,
      row.coverage_assignment_id
        ? (options.modeByAssignment?.get(row.coverage_assignment_id) ?? null)
        : null,
    ),
  )
}

/**
 * Admin attention: unacknowledged responsibilities and open access issues
 * across the organization. This is the canonical projection Project 3 renders.
 */
export async function listAttentionForOrg(
  client: DbClient,
  orgId: string,
  now: string,
): Promise<ResponsibilityAttentionItem[]> {
  const { data, error } = await client
    .from('responsibility_acknowledgements')
    .select(ACK_COLUMNS)
    .eq('organization_id', orgId)
    .or('acknowledged_at.is.null,access_issue_at.not.is.null')
    .limit(500)
  if (error) throw error
  const rows = ((data ?? []) as AckRow[]).filter(
    (row) => !row.acknowledged_at || row.access_issue,
  )
  if (rows.length === 0) return []

  const profileIds = [...new Set(rows.map((row) => row.profile_id))]
  const repIds = [...new Set(rows.map((row) => row.rep_id))]
  const [labels, repRows, assignmentRows] = await Promise.all([
    loadProfileLabels(client, orgId, profileIds),
    client.from('reps').select('id, name').eq('organization_id', orgId).in('id', repIds).limit(500),
    client
      .from('coverage_assignments')
      .select('id, coverage_mode')
      .eq('organization_id', orgId)
      .in(
        'id',
        rows.map((row) => row.coverage_assignment_id).filter((id): id is string => Boolean(id)),
      )
      .limit(500),
  ])
  const repName = new Map(
    ((repRows.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]),
  )
  const modeByAssignment = new Map<string, 'SHARED' | 'REPLACE' | null>()
  for (const row of (assignmentRows.data ?? []) as Array<{ id: string; coverage_mode: string | null }>) {
    modeByAssignment.set(
      row.id,
      row.coverage_mode === 'SHARED' || row.coverage_mode === 'REPLACE' ? row.coverage_mode : null,
    )
  }

  return rows.map((row) => ({
    ...toView(
      row,
      labels.get(row.profile_id) ?? { name: 'Profile', channel: null },
      now,
      row.coverage_assignment_id ? (modeByAssignment.get(row.coverage_assignment_id) ?? null) : null,
    ),
    repName: repName.get(row.rep_id) ?? 'Unknown',
  }))
}

/** A rep acknowledges their own responsibility. Idempotent. */
export async function acknowledgeResponsibility(input: {
  client: DbClient
  orgId: string
  repId: string
  acknowledgementId: string
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await input.client
    .from('responsibility_acknowledgements')
    .update({ acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', input.acknowledgementId)
    .eq('organization_id', input.orgId)
    .eq('rep_id', input.repId)
    .is('acknowledged_at', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** A rep reports an access issue on their own responsibility. */
export async function reportAccessIssue(input: {
  client: DbClient
  orgId: string
  repId: string
  acknowledgementId: string
  issue: AccessIssue
  note?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await input.client
    .from('responsibility_acknowledgements')
    .update({
      access_issue: input.issue,
      access_issue_note: input.note?.slice(0, 500) ?? null,
      access_issue_at: new Date().toISOString(),
      access_issue_reported_by: input.repId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.acknowledgementId)
    .eq('organization_id', input.orgId)
    .eq('rep_id', input.repId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Admin/manager resolves an access issue. */
export async function resolveAccessIssue(input: {
  client: DbClient
  orgId: string
  actorRepId: string
  acknowledgementId: string
  note?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await input.client
    .from('responsibility_acknowledgements')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: input.actorRepId,
      resolve_note: input.note?.slice(0, 500) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.acknowledgementId)
    .eq('organization_id', input.orgId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Seed the acknowledgement row for a temporary coverage assignment. One row
 * per assignment; a repeat activation is idempotent.
 */
export async function ensureCoverageAcknowledgement(
  client: DbClient,
  input: {
    organizationId: string
    profileId: string
    repId: string
    coverageAssignmentId: string
    assignedAt: string
  },
): Promise<void> {
  const { data: existing } = await client
    .from('responsibility_acknowledgements')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('coverage_assignment_id', input.coverageAssignmentId)
    .maybeSingle()
  if (existing) return

  const { error } = await client.from('responsibility_acknowledgements').insert({
    organization_id: input.organizationId,
    profile_id: input.profileId,
    rep_id: input.repId,
    subject: 'COVERAGE',
    coverage_assignment_id: input.coverageAssignmentId,
    source_row_id: input.coverageAssignmentId,
    assigned_at: input.assignedAt,
    acknowledged_at: null,
  })
  if (error && (error as { code?: string }).code !== '23505') {
    console.warn('[responsibility] coverage acknowledgement seed failed', error.message)
  }
}

/**
 * Seed the acknowledgement row for permanent ownership. A genuinely new
 * assignment episode (different `source_row_id`) re-arms the banner; re-saving
 * an unchanged chain does not.
 */
export async function ensurePrimaryAcknowledgement(
  client: DbClient,
  input: {
    organizationId: string
    profileId: string
    repId: string
    sourceRowId: string
    assignedAt: string
  },
): Promise<void> {
  const { data: existing } = await client
    .from('responsibility_acknowledgements')
    .select('id, source_row_id')
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
    .eq('rep_id', input.repId)
    .eq('subject', 'PRIMARY')
    .maybeSingle()

  if (existing && existing.source_row_id === input.sourceRowId) return

  if (existing) {
    const { error } = await client
      .from('responsibility_acknowledgements')
      .update({
        source_row_id: input.sourceRowId,
        assigned_at: input.assignedAt,
        acknowledged_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id as string)
    if (error) console.warn('[responsibility] primary acknowledgement re-arm failed', error.message)
    return
  }

  const { error } = await client.from('responsibility_acknowledgements').insert({
    organization_id: input.organizationId,
    profile_id: input.profileId,
    rep_id: input.repId,
    subject: 'PRIMARY',
    source_row_id: input.sourceRowId,
    assigned_at: input.assignedAt,
    acknowledged_at: null,
  })
  if (error && (error as { code?: string }).code !== '23505') {
    console.warn('[responsibility] primary acknowledgement seed failed', error.message)
  }
}

/**
 * Seed the acknowledgement row for a permanent OPERATOR seat. A genuinely new
 * seat (different `source_row_id`) re-arms the banner; re-saving an unchanged
 * chain does not. Removing the seat deletes the row, so a removed operator
 * never lingers in Admin attention.
 */
export async function ensureOperatorAcknowledgement(
  client: DbClient,
  input: {
    organizationId: string
    profileId: string
    repId: string
    sourceRowId: string
    assignedAt: string
  },
): Promise<void> {
  const { data: existing } = await client
    .from('responsibility_acknowledgements')
    .select('id, source_row_id')
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
    .eq('rep_id', input.repId)
    .eq('subject', 'OPERATOR')
    .maybeSingle()

  if (existing && existing.source_row_id === input.sourceRowId) return

  if (existing) {
    const { error } = await client
      .from('responsibility_acknowledgements')
      .update({
        source_row_id: input.sourceRowId,
        assigned_at: input.assignedAt,
        acknowledged_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id as string)
    if (error) console.warn('[responsibility] operator acknowledgement re-arm failed', error.message)
    return
  }

  const { error } = await client.from('responsibility_acknowledgements').insert({
    organization_id: input.organizationId,
    profile_id: input.profileId,
    rep_id: input.repId,
    subject: 'OPERATOR',
    source_row_id: input.sourceRowId,
    assigned_at: input.assignedAt,
    acknowledged_at: null,
  })
  if (error && (error as { code?: string }).code !== '23505') {
    console.warn('[responsibility] operator acknowledgement seed failed', error.message)
  }
}

/** Drop the OPERATOR acknowledgement when the seat is removed. */
export async function deleteOperatorAcknowledgement(
  client: DbClient,
  input: { organizationId: string; profileId: string; repId: string },
): Promise<void> {
  await client
    .from('responsibility_acknowledgements')
    .delete()
    .eq('organization_id', input.organizationId)
    .eq('profile_id', input.profileId)
    .eq('rep_id', input.repId)
    .eq('subject', 'OPERATOR')
}
