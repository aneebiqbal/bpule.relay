import type { DbClient } from '@/lib/db/types'

/**
 * The responsibility-chain mutation as ONE parameterized SQL statement.
 *
 * `configureCoverage` used ~12–18 sequential round trips; on this host a bare
 * `select 1` costs ~970 ms, so the chain took 14–30 s. Every step below is a
 * CTE in a single statement, so the whole reconcile is one round trip while
 * staying atomic and organization-scoped.
 *
 * Semantics preserved from the previous step-by-step path:
 *   - one seat per rep (PRIMARY wins), seats deactivated not deleted;
 *   - eligibility upserted for every seat on every ACTIVE channel identity;
 *   - eligibility revoked for seats that disappeared;
 *   - OPERATOR acknowledgements created, re-armed on a new source row, and
 *     dropped with the seat;
 *   - PRIMARY acknowledgement created;
 *   - coverage event written.
 *
 * The accountability audit row is written by `saveResponsibilityChain`, which
 * knows the event type and the channel identity.
 */

export interface ConfigureCoverageStatementInput {
  organizationId: string
  profileId: string
  primaryRepId: string | null
  operators: Array<{ repId: string; priority: number }>
  backups: Array<{ repId: string; priority: number }>
  actorRepId: string
  reason: string
  now: Date
}

type Seat = { repId: string; role: 'PRIMARY' | 'OPERATOR' | 'BACKUP'; priority: number }

/** One seat per rep — PRIMARY wins, then lowest priority. Mirrors the SQL `uniq`. */
export function uniqueSeats(seats: Seat[]): Seat[] {
  const rank = (seat: Seat) => (seat.role === 'PRIMARY' ? 0 : 1)
  const byRep = new Map<string, Seat>()
  for (const seat of seats) {
    const existing = byRep.get(seat.repId)
    if (!existing || rank(seat) < rank(existing) || (rank(seat) === rank(existing) && seat.priority < existing.priority)) {
      byRep.set(seat.repId, seat)
    }
  }
  return [...byRep.values()]
}

export function sameSeatSet(
  current: Array<{ rep_id?: string | null; role?: string | null; priority?: number | null }>,
  desired: Seat[],
): boolean {
  if (current.length !== desired.length) return false
  const key = (repId: string, role: string, priority: number) => `${repId}|${role}|${priority}`
  const want = new Set(desired.map((seat) => key(seat.repId, seat.role, seat.priority)))
  for (const row of current) {
    if (!row.rep_id) return false
    if (!want.has(key(row.rep_id, String(row.role), Number(row.priority)))) return false
  }
  return true
}

export async function configureCoverageStatement(
  client: DbClient,
  input: ConfigureCoverageStatementInput,
): Promise<{ ok: boolean; error?: string; unchanged?: boolean }> {
  const seats: Seat[] = [
    ...(input.primaryRepId ? [{ repId: input.primaryRepId, role: 'PRIMARY' as const, priority: 1 }] : []),
    ...input.operators.map((row) => ({ repId: row.repId, role: 'OPERATOR' as const, priority: row.priority })),
    ...input.backups.map((row) => ({ repId: row.repId, role: 'BACKUP' as const, priority: row.priority })),
  ]

  if (!client.raw) return { ok: false, error: 'Raw query is not available on this client.' }

  // Idempotence guard (BUG-42). The statement below always inserted a fresh set
  // of coverage rows, and ack_arm re-arms an acknowledgement whenever
  // source_row_id changes — so re-saving an unchanged chain silently reset
  // every operator's "I have this" for the day and re-created the assignment.
  // An unchanged chain must be a no-op.
  const desired = uniqueSeats(seats)
  const { data: current, error: readError } = await client.raw(
    `SELECT rep_id, role, priority FROM profile_coverage
     WHERE organization_id = $1 AND profile_id = $2 AND active = true`,
    [input.organizationId, input.profileId],
  )
  if (readError) return { ok: false, error: readError.message }
  if (sameSeatSet(current ?? [], desired)) return { ok: true, unchanged: true }

  const sql = `
WITH params AS (
  SELECT $1::uuid AS org, $2::uuid AS profile_id, $3::uuid AS actor,
         $4::uuid AS primary_rep, $5::timestamptz AS now_ts,
         $6::jsonb AS seats, $7::text AS reason
),
seats AS (
  SELECT (s->>'repId')::uuid AS rep_id, s->>'role' AS role, (s->>'priority')::int AS priority
  FROM params, jsonb_array_elements(params.seats) AS s
),
uniq AS (
  SELECT rep_id, role, priority
  FROM (
    SELECT rep_id, role, priority,
           row_number() OVER (PARTITION BY rep_id ORDER BY CASE role WHEN 'PRIMARY' THEN 0 ELSE 1 END, priority) AS rn
    FROM seats
  ) ranked
  WHERE rn = 1
),
prev AS (
  -- Everyone who has held a seat on this profile. The previous chain was
  -- deactivated in the statement before this one, so "active" would be empty
  -- here; the full history is the correct revocation set.
  SELECT DISTINCT rep_id FROM profile_coverage
  WHERE organization_id = (SELECT org FROM params) AND profile_id = (SELECT profile_id FROM params)
),
ins AS (
  INSERT INTO profile_coverage (organization_id, profile_id, rep_id, role, priority, active, created_by)
  SELECT (SELECT org FROM params), (SELECT profile_id FROM params), rep_id, role, priority, true, (SELECT actor FROM params)
  FROM uniq
  RETURNING id, rep_id, role
),
elig_up AS (
  INSERT INTO identity_assignments (organization_id, revenue_identity_id, rep_id, assigned_by)
  SELECT (SELECT org FROM params), ri.id, ins.rep_id, (SELECT actor FROM params)
  FROM ins
  JOIN revenue_identities ri ON ri.profile_id = (SELECT profile_id FROM params) AND ri.status = 'active'
  ON CONFLICT (revenue_identity_id, rep_id) DO NOTHING
),
elig_del AS (
  DELETE FROM identity_assignments
  WHERE organization_id = (SELECT org FROM params)
    AND revenue_identity_id IN (SELECT id FROM revenue_identities WHERE profile_id = (SELECT profile_id FROM params) AND status = 'active')
    AND rep_id IN (SELECT rep_id FROM prev)
    AND rep_id NOT IN (SELECT rep_id FROM ins)
),
ack_del AS (
  DELETE FROM responsibility_acknowledgements
  WHERE organization_id = (SELECT org FROM params) AND profile_id = (SELECT profile_id FROM params)
    AND subject = 'OPERATOR' AND rep_id NOT IN (SELECT rep_id FROM ins WHERE role = 'OPERATOR')
),
ack_ins AS (
  INSERT INTO responsibility_acknowledgements (organization_id, profile_id, rep_id, subject, source_row_id, assigned_at, acknowledged_at)
  SELECT (SELECT org FROM params), (SELECT profile_id FROM params), rep_id, 'OPERATOR', id, (SELECT now_ts FROM params), NULL
  FROM ins
  WHERE role = 'OPERATOR'
    AND NOT EXISTS (
      SELECT 1 FROM responsibility_acknowledgements a
      WHERE a.organization_id = (SELECT org FROM params) AND a.profile_id = (SELECT profile_id FROM params)
        AND a.rep_id = ins.rep_id AND a.subject = 'OPERATOR'
    )
),
ack_arm AS (
  UPDATE responsibility_acknowledgements a
  SET source_row_id = ins.id, assigned_at = (SELECT now_ts FROM params), acknowledged_at = NULL, updated_at = (SELECT now_ts FROM params)
  FROM ins
  WHERE a.organization_id = (SELECT org FROM params) AND a.profile_id = (SELECT profile_id FROM params)
    AND a.rep_id = ins.rep_id AND a.subject = 'OPERATOR' AND ins.role = 'OPERATOR'
    AND a.source_row_id IS DISTINCT FROM ins.id
),
ack_primary AS (
  INSERT INTO responsibility_acknowledgements (organization_id, profile_id, rep_id, subject, source_row_id, assigned_at, acknowledged_at)
  SELECT (SELECT org FROM params), (SELECT profile_id FROM params), rep_id, 'PRIMARY', id, (SELECT now_ts FROM params), NULL
  FROM ins WHERE role = 'PRIMARY'
  ON CONFLICT DO NOTHING
),
event AS (
  INSERT INTO coverage_events (organization_id, profile_id, event_type, primary_rep_id, reason, actor_rep_id)
  SELECT (SELECT org FROM params), (SELECT profile_id FROM params), 'BACKUP_CONFIGURED',
         (SELECT primary_rep FROM params), (SELECT reason FROM params), (SELECT actor FROM params)
)
SELECT (SELECT count(*)::int FROM ins) AS seats`

  // Deactivate the previous chain first. A data-modifying CTE cannot see its
  // sibling's changes, so inserting a seat that reuses an active
  // (role, priority) in the same statement would violate pc_active_chain_uniq.
  const deactivate = await client.raw(
    `UPDATE profile_coverage SET active = false, updated_at = $1
     WHERE organization_id = $2 AND profile_id = $3`,
    [input.now.toISOString(), input.organizationId, input.profileId],
  )
  if (deactivate.error) return { ok: false, error: deactivate.error.message }

  const { error } = await client.raw(sql, [
    input.organizationId,
    input.profileId,
    input.actorRepId,
    input.primaryRepId,
    input.now.toISOString(),
    JSON.stringify(seats),
    input.reason,
  ])
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
