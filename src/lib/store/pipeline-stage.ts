/**
 * Pipeline stage aggregate.
 *
 * The board's stage vocabulary (`to_contact`, `observe`, `waiting`,
 * `follow_up_due`, `needs_reply`, `done`, `cold`) is derived from lead status,
 * verdict, message bodies, the lifecycle policy and the follow-up clock. This
 * module encodes that exact derivation in SQL so the board can count stages and
 * select cards without reading every lead row.
 *
 * The JS authority is `derivePipelineStage` in
 * `src/components/leads/pipeline-utils.ts`. The two are pinned together by
 * `PIPELINE_SQL_STAGE_PARITY` in `tests/relay-pipeline-aggregate.test.ts`.
 */

export type PipelineStageKey =
  | 'to_contact'
  | 'observe'
  | 'waiting'
  | 'follow_up_due'
  | 'needs_reply'
  | 'done'
  | 'cold'

export type PipelineStageCounts = Record<PipelineStageKey, number>

/** The owner/workspace scope the board applies. */
export interface PipelineStageScope {
  ownerRepId?: string | null
  revenueIdentityId?: string | null
  profileId?: string | null
}

export const PIPELINE_STAGE_KEYS: PipelineStageKey[] = [
  'to_contact',
  'observe',
  'waiting',
  'follow_up_due',
  'needs_reply',
  'done',
  'cold',
]

export function emptyPipelineStageCounts(): PipelineStageCounts {
  return { to_contact: 0, observe: 0, waiting: 0, follow_up_due: 0, needs_reply: 0, done: 0, cold: 0 }
}

/** Board card order: needs_reply first, done last. */
export const PIPELINE_CARD_ORDER: Record<PipelineStageKey, number> = {
  needs_reply: 0,
  follow_up_due: 1,
  to_contact: 2,
  observe: 3,
  waiting: 4,
  cold: 5,
  done: 6,
}

/**
 * Message CTE. The board's exact "has a body" rule: a message counts as
 * outbound/inbound only when `sent_text` is non-empty. The 454 connection-only
 * messages with an empty body therefore never set `last_outbound_at` /
 * `last_inbound_at`. `last_activity_at` uses every message (drafts included),
 * matching `enrichLeads`.
 */
const MSG_CTE = `msg AS (
  SELECT
    lead_id,
    MAX(sent_at) FILTER (WHERE direction <> 'inbound' AND sent_text IS NOT NULL AND btrim(sent_text) <> '') AS last_outbound_at,
    MAX(sent_at) FILTER (WHERE direction = 'inbound' AND sent_text IS NOT NULL AND btrim(sent_text) <> '') AS last_inbound_at,
    BOOL_OR(type = 'dm' AND direction <> 'inbound' AND sent_text IS NOT NULL AND btrim(sent_text) <> '') AS has_dm_sent,
    BOOL_OR(direction <> 'inbound' AND sent_at IS NOT NULL) AS has_any_outbound,
    MAX(COALESCE(sent_at, created_at)) AS last_activity_at
  FROM messages
  WHERE organization_id = ?
  GROUP BY lead_id
)`

const CS_CTE = `cs AS (
  SELECT lead_id, COALESCE(followup_count, 0) AS followup_count
  FROM conversation_states
  WHERE organization_id = ?
)`

/**
 * Ranked CTE. `owner_rep_id` / `revenue_identity_id` / `sender_profile_id` are
 * carried so the caller can apply the same owner/workspace scope as
 * `loadBoardData`. `now` is a parameter so the lifecycle and follow-up clocks
 * are evaluated at one instant.
 */
function rankedCte(scopeClause: string): string {
  return `ranked AS (
  SELECT
    l.id,
    l.owner_rep_id,
    l.revenue_identity_id,
    l.sender_profile_id,
    l.status,
    l.verdict,
    l.direction,
    l.inbound_message,
    l.connection_accepted_at,
    l.locked_reason,
    l.created_at,
    msg.last_outbound_at,
    msg.last_inbound_at,
    msg.has_dm_sent,
    msg.has_any_outbound,
    msg.last_activity_at,
    cs.followup_count,
    CASE
      WHEN l.status IN ('won', 'lost', 'dead', 'no') THEN 'active'
      WHEN l.status = 'replied' THEN 'active'
      WHEN l.status = 'new' THEN
        CASE
          WHEN EXTRACT(EPOCH FROM (?::timestamptz - l.created_at)) / 86400 >= 30 THEN 'cold'
          WHEN EXTRACT(EPOCH FROM (?::timestamptz - l.created_at)) / 86400 >= 14 THEN 'stale'
          ELSE 'active'
        END
      WHEN l.status = 'contacted' AND l.connection_accepted_at IS NULL AND l.locked_reason = 'connection_note_sent' THEN
        CASE
          WHEN EXTRACT(EPOCH FROM (?::timestamptz - COALESCE(msg.last_outbound_at, l.created_at))) / 86400 >= 14 THEN 'cold'
          WHEN EXTRACT(EPOCH FROM (?::timestamptz - COALESCE(msg.last_outbound_at, l.created_at))) / 86400 >= 7 THEN 'stale'
          ELSE 'active'
        END
      WHEN l.status IN ('contacted', 'followed_up') THEN
        CASE
          WHEN msg.last_outbound_at IS NULL THEN 'active'
          WHEN cs.followup_count >= 3
            AND NOT (msg.last_inbound_at IS NOT NULL AND msg.last_inbound_at > msg.last_outbound_at)
            AND EXTRACT(EPOCH FROM (?::timestamptz - msg.last_outbound_at)) / 86400 >= 3
            THEN 'frozen'
          WHEN EXTRACT(EPOCH FROM (?::timestamptz - msg.last_outbound_at)) / 86400 >= 21 THEN 'cold'
          WHEN EXTRACT(EPOCH FROM (?::timestamptz - msg.last_outbound_at)) / 86400 >= 7 THEN 'stale'
          ELSE 'active'
        END
      ELSE 'active'
    END AS lifecycle_state
  FROM leads l
  LEFT JOIN msg ON msg.lead_id = l.id
  LEFT JOIN cs ON cs.lead_id = l.id
  WHERE ${scopeClause}
)`
}

/** The canonical stage derivation, applied to the ranked columns. */
const STAGE_CASE = `CASE
      WHEN status IN ('won', 'lost', 'dead', 'no') THEN 'done'
      WHEN status = 'replied' THEN 'needs_reply'
      WHEN verdict = 'skip' THEN 'observe'
      WHEN verdict = 'research_more'
        AND NOT (connection_accepted_at IS NOT NULL OR COALESCE(has_any_outbound, false))
        THEN 'observe'
      WHEN lifecycle_state IN ('cold', 'frozen') THEN 'cold'
      WHEN direction = 'inbound' AND inbound_message IS NOT NULL AND btrim(inbound_message) <> '' AND last_outbound_at IS NULL THEN 'needs_reply'
      WHEN direction = 'inbound' AND inbound_message IS NOT NULL AND btrim(inbound_message) <> ''
        AND (last_inbound_at IS NULL OR last_inbound_at <= last_outbound_at) THEN 'waiting'
      WHEN last_outbound_at IS NOT NULL
        AND (last_inbound_at IS NULL OR last_inbound_at < last_outbound_at)
        AND COALESCE(followup_count, 0) < 3
        AND EXTRACT(EPOCH FROM (?::timestamptz - last_outbound_at)) / 86400 >= (CASE COALESCE(followup_count, 0) WHEN 0 THEN 3 ELSE 6 END)
        THEN 'follow_up_due'
      WHEN status = 'followed_up' THEN
        CASE
          WHEN last_inbound_at IS NOT NULL AND last_outbound_at IS NOT NULL AND last_inbound_at > last_outbound_at THEN 'needs_reply'
          ELSE 'waiting'
        END
      WHEN status = 'contacted' THEN
        CASE
          WHEN connection_accepted_at IS NOT NULL AND NOT COALESCE(has_dm_sent, false) THEN 'to_contact'
          WHEN last_outbound_at IS NOT NULL AND last_inbound_at IS NULL THEN 'waiting'
          WHEN last_inbound_at IS NOT NULL AND last_outbound_at IS NOT NULL AND last_inbound_at > last_outbound_at THEN 'needs_reply'
          ELSE 'waiting'
        END
      ELSE 'to_contact'
    END`

/** Scope fragment: organization + non-archived, plus the caller's owner/workspace scope. */
export function pipelineScopeClause(scope: PipelineStageScope): string {
  const parts = ['l.organization_id = ?', 'l.archived = false']
  if (scope.ownerRepId) parts.push('l.owner_rep_id = ?')
  if (scope.revenueIdentityId) {
    parts.push(
      '(l.revenue_identity_id = ? OR (l.revenue_identity_id IS NULL AND l.sender_profile_id = ?))',
    )
  }
  return parts.join(' AND ')
}

/** Parameter order shared by the counts and card-id queries. */
export function pipelineScopeParams(
  orgId: string,
  nowIso: string,
  scope: PipelineStageScope,
): unknown[] {
  return [
    orgId,
    orgId,
    nowIso,
    nowIso,
    nowIso,
    nowIso,
    nowIso,
    nowIso,
    nowIso,
    orgId,
    ...(scope.ownerRepId ? [scope.ownerRepId] : []),
    ...(scope.revenueIdentityId ? [scope.revenueIdentityId, scope.profileId ?? null] : []),
    nowIso,
  ]
}

export function pipelineStageSql(scopeClause: string): string {
  return `WITH ${MSG_CTE}, ${CS_CTE}, ${rankedCte(scopeClause)}
SELECT
  COUNT(*) FILTER (WHERE stage = 'to_contact') AS to_contact,
  COUNT(*) FILTER (WHERE stage = 'observe') AS observe,
  COUNT(*) FILTER (WHERE stage = 'waiting') AS waiting,
  COUNT(*) FILTER (WHERE stage = 'follow_up_due') AS follow_up_due,
  COUNT(*) FILTER (WHERE stage = 'needs_reply') AS needs_reply,
  COUNT(*) FILTER (WHERE stage = 'done') AS done,
  COUNT(*) FILTER (WHERE stage = 'cold') AS cold
FROM (
  SELECT ${STAGE_CASE} AS stage
  FROM ranked
) t`
}

export function pipelineCardIdsSql(scopeClause: string): string {
  return `WITH ${MSG_CTE}, ${CS_CTE}, ${rankedCte(scopeClause)}
SELECT id
FROM (
  SELECT id, created_at, last_activity_at, ${STAGE_CASE} AS stage
  FROM ranked
) t
ORDER BY
  CASE stage
    WHEN 'needs_reply' THEN 0
    WHEN 'follow_up_due' THEN 1
    WHEN 'to_contact' THEN 2
    WHEN 'observe' THEN 3
    WHEN 'waiting' THEN 4
    WHEN 'cold' THEN 5
    WHEN 'done' THEN 6
    ELSE 7
  END,
  COALESCE(last_activity_at, created_at) DESC
LIMIT ?`
}
