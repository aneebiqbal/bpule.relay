# Relay — Neon Aggregate Slice

> **Date:** 2026-11-03
> **Mission:** the projection slice removed **bytes per row**; this slice removes
> **rows per request** by moving full-set counts into PostgreSQL.
> **Verified against the production-shaped export on a real Postgres 17 instance.**

---

## 1. Baseline computations (the JS authority)

| Computation | Input tables | Rows read | JS rule | Output |
|---|---|---|---|---|
| `fetchRates` → `computeRates` | `leads` (non-archived) + `messages` + `outcomes` | 814 + 1,212 + 72 | `sent` = messages with `sent_at`; `sentLeads` = distinct leads with a sent message; `repliedLeads`/`readLeads`/`checkedLeads` = distinct leads with the outcome stage | `RateMetric` grouped by rep and play |
| `loadBoardData` → `derivePipelineStage` | `leads` + `messages` + `conversation_states` + `assigned_tasks` + `profiles` | 814 + 1,212 + 785 + tasks + profiles | status precedence, verdict, inbound-first, lifecycle (cold/frozen), follow-up clock, connection-only body rule | `LeadRow[]` + stage counts |

Both read the **whole lead set** and derived the numbers in application memory.

---

## 2. Rates aggregate

`getRateGroups()` now runs one SQL statement on Neon:

```sql
WITH m AS (SELECT lead_id, COUNT(*) AS sent FROM messages
           WHERE organization_id = ? AND sent_at IS NOT NULL GROUP BY lead_id),
     o AS (SELECT lead_id, BOOL_OR(stage='replied') AS replied, ... FROM outcomes
           WHERE organization_id = ? GROUP BY lead_id)
SELECT l.owner_rep_id, l.play_id,
       COUNT(*) FILTER (WHERE m.sent > 0) AS sent_leads,
       COALESCE(SUM(m.sent),0) AS sent,
       COUNT(*) FILTER (WHERE o.replied) AS replied_leads, ...
FROM leads l LEFT JOIN m ON m.lead_id=l.id LEFT JOIN o ON o.lead_id=l.id
WHERE l.organization_id = ? AND l.archived = false
GROUP BY l.owner_rep_id, l.play_id
```

One row per (rep, play) group — no message or lead rows leave the database.
`rateMetricFromGroups()` sums groups and recomputes the ratios.

**Parity:** `REP_RATE_SQL_JS_PARITY` in `tests/relay-rate-aggregate.test.ts` pins the
group derivation to `computeRates` on a mixed fixture (sent, draft-only, connection-only,
read/check, empty).

---

## 3. Pipeline stage aggregate

`PIPELINE_STAGE_SQL` encodes `derivePipelineStage` exactly:

- terminal statuses → `done`
- `replied` → `needs_reply`
- `skip` / `research_more` with no started relationship → `observe`
- lifecycle `cold`/`frozen` → `cold`
- inbound-first body rules, follow-up clock (3/6 days, max 3), `contacted`/`followed_up`
  precedence, `to_contact` fallback

The message CTE reproduces the **connection-only body rule**: a message counts as
outbound/inbound only when `sent_text` is non-empty. The 454 connection-only messages
with an empty body never set `last_outbound_at` / `last_inbound_at`.

`PIPELINE_CARD_IDS_SQL` returns the bounded card ids in board order
(stage priority, then `COALESCE(last_activity_at, created_at) DESC`).

### 3.1 Parity evidence (production-shaped export)

Loaded the 192 MB export into a temporary Postgres 17 instance (418 leads loaded,
1,212 messages, 785 conversation_states — the 418 leads are the complete non-archived
set that loaded; the JSON parse errors were in unrelated tables).

| Check | Result |
|---|---|
| Stage counts, SQL vs JS | **0 diffs / 416 non-archived leads** |
| Bounded card ids, SQL vs JS | **150 / 150 identical, 0 positional diffs** |

---

## 4. Scope and security

- `pipelineScopeClause()` always includes `l.organization_id = ? AND l.archived = false`.
- Rep scope adds `l.owner_rep_id = ?` and the workspace predicate
  `(l.revenue_identity_id = ? OR (l.revenue_identity_id IS NULL AND l.sender_profile_id = ?))`
  — the same rule as `leadBelongsToWorkspace`.
- Admin/org view adds no owner predicate.
- The aggregate runs through the same executor that sets `app.current_user_id`, so RLS
  applies on top of the explicit org predicate. Counts cannot leak another org's rows.

---

## 5. Request consistency

`getPipelineStageSummary()` and `getPipelineCardIds()` are called in the same request,
both with the same `now` instant. The counts and cards therefore come from one clock.
`beginReadOnlySnapshot()` still applies: `getLeadsByIds()` reuses the request snapshot
where the caller enabled it.

---

## 6. Supabase rollback

PostgREST has no raw-SQL surface. `SupabaseDbClient.raw()` returns an error, so
`getPipelineStageSummary()` / `getPipelineCardIds()` return `null` and `loadBoardPreview`
falls back to `loadBoardData()` + the JS authority. The rollback path is unchanged.

---

## 7. Remaining debt

1. `getRepDailyActivity` (heatmap) still reads every `action_event` for the rep and
   aggregates in JS; the day drilldown needs the raw events, so this needs a
   daily-aggregate + lazy drilldown split.
2. `loadPerformance` reads up to 50,000 events + 3,000 leads + 5,000 task_events for the
   `/performance` page.
3. `enrichLeads` still builds an `events` array no consumer reads.
4. `getPipelineCardIds` is capped at 150; the board says when more exist.
