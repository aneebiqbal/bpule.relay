# Relay — Operations Egress Audit (Phase 8 · Slice A/B)

> **Date:** 2026-11-01 · **Method:** code review of every Phase 8 list loader (no production reads — the Supabase project is egress-restricted, HTTP 402).
> **Rule:** list pages never load message bodies, source text, AI traces, embeddings or large JSON. Detail data loads when a record is opened.

## 1. Per-surface read budget

| Surface | Reads (all `organization_id`-filtered, batched with `.in()`, no per-row loops) | Columns | Cap | Verdict |
|---|---|---|---|---|
| `/team` People | `loadTeamDay` (5 reads), `loadTeamLive` (9 reads), `teams`, `organization_roles`, `team_memberships`, overdue tasks, outcome events | narrow scalars only (`team-live` lead read is 7 scalar cols, limit 800) | 800 leads · 5,000 events | OK |
| `/team/[repId]` header | directory (request-cached, shared with Overview) + 7-day performance | as below | — | OK |
| Rep 360 · Overview | conversation rows, assigned tasks (own), today + 7d performance | see Conversations / Performance | — | OK |
| Rep 360 · Leads | `loadLeadsPage({ owner })` → DB-paginated `listLeadsPage` | `LEAD_LIST_COLUMNS` (no `raw_input`, no `canonical_intelligence` — only 3 scalar JSON paths) | page size | **Watch:** `LEAD_LIST_COLUMNS` still carries `inbound_message`, `inbound_raw`, `signal_evidence`, `verbatim_quote` (text). Pre-existing; tracked in `../archive/RELAY_SALES_QUERY_EGRESS_AUDIT.md` |
| Rep 360 / Team · Conversations | `leads` + `conversation_states` + identities + reps | 7 + 7 scalar cols; **no message bodies** | 1,500 leads | OK |
| Activity (Rep 360, Team, Account, Center) | `action_events`, `assigned_tasks`, `task_events`, `internal_notes`, lead/rep/identity lookups | events: 8 scalar cols (no `metadata`); notes: `body` (≤4,000 chars) | ≤300 rows per source | OK. Note bodies are the only free text; capped by row limit |
| Performance (Rep 360, Team, `/team/performance`) | `action_events` (4 cols), `leads` cohort (7 cols), `task_events` (1 col), `conversation_states` (5 cols), name lookups | scalars only | 5,000 events · 3,000 leads; UI says when truncated | OK |
| `/team/tasks` | `assigned_tasks` (scoped) + batched lead/rep/profile names | `select('*')` on `assigned_tasks` (includes `description`) | none | **Watch:** unbounded per scope; fine at current volume, paginate past ~2k open tasks |
| `/accounts` | `leads` (12 scalar cols), paged 1,000 at a time, + `conversation_states` + identities + reps | scalars only | 10,000-lead ceiling; UI says when exceeded | Was a silent 2,000 cap. Production holds ~814 leads. A `company_key` rollup is the step after the ceiling |
| `/accounts/[company]` | same, filtered to one `company_key` | scalars only | 2,000 | OK (replaces the old `/account` N+1 that read every lead then messages per lead) |
| Account 360 · Tasks | `loadUnifiedTasks` for the whole scope, filtered to the account's leads in memory | `assigned_tasks.*` | none | **Debt:** over-fetch; add a `lead_id in (…)` filter |
| Cmd-K `/api/search/ops` | `reps`, `leads` (5 cols, limit 25), `assigned_tasks` (4 cols, limit 10), `conversation_states` (3 cols) | scalars only | 25 / 10 | OK |
| Notes panel | `internal_notes` for one subject + author names | `body` | 100 | Loaded only when the panel mounts (detail view) |
| Saved views | `saved_views` for one surface | 5 cols | 50 | OK |
| Outcome events (all homes) | `action_events` `MEETING_BOOKED`/`CLIENT_WON` | 3 cols | 5,000 | OK — replaces Admin Home's 40-row sample |
| `/performance` (activity model) | `action_events` for one rep | dropped unused `metadata` JSON (Slice B) | date range | Improved |

## 2. Fixed in Slice B

- `activity-model.ts` no longer selects `metadata` (JSON) for the heatmap.
- Admin Home meetings/wins: one 3-column bounded read instead of inferring from a 40-row activity sample.

## 3. Open egress debt

1. `LEAD_LIST_COLUMNS` free-text columns (pre-existing, shared with `/leads`).
2. `/accounts` groups in memory (paged, 10,000 ceiling). Move to a SQL rollup by `company_key` before scopes approach the ceiling.
3. Account 360 Tasks over-fetch → filter by lead ids server-side.
4. `/team/tasks` pagination once open tasks exceed ~2k per scope.
5. `loadTeamLive` reads the whole org even for managers, then filters (pre-existing; bounded at 800 leads).

## 4. Not verified

Payload sizes, query counts and TTFB were **not measured** — no reachable database. Measure in Slice D against a staging copy (`EXPLAIN (ANALYZE, BUFFERS)` on the five largest reads above, plus response size per route).

## 5. Slice C additions

| Surface | Reads | Columns | Cap | Verdict |
|---|---|---|---|---|
| `/chats` queue | `leads` + `conversation_states` (+ `memory->lastClientAnalysis->>intent` scalar) + names | scalars | 1,500 leads; page ≤60 rows | OK |
| `/chats` previews | `lead_message_previews` view (`20261101151000`): one row per visible lead, `left(sent_text,160)` computed in Postgres | 4 scalars + 160-char preview | 1 × page rows | **Fixed in code, pending activation.** In the harness a 5,000-char body returns 160 bytes (3%). Until the view is applied (`messagePreviews` off), the fallback still reads full bodies for ≤4 × page rows |
| `/chats` thread | existing `/api/leads/[id]/conversation` | full thread — **only for the opened conversation** | 1 lead | OK (detail view) |
| `/chats` intelligence | one `leads` row with 3 canonical JSON paths, one `conversation_states` row (`memory->facts`, `memory->lastClientAnalysis`), ≤10 open tasks | narrow | 1 lead | OK |
| Sales / Pipeline / Revenue reports | `COUNT` requests with `head: true` | **zero rows returned** | — | OK |
| Pipeline average age | `conversation_states → leads(created_at)` sample | 1 column | 1,000 per stage | OK |
| Team report / Team Performance | paged event read, 1,000 per page (performance.ts) | 5 scalars | 50,000 ceiling; UI says when exceeded | Was a silent 5,000 cap. Production holds ~5,200 `action_events` in total |
| `/team/targets` | `daily_targets` (3 cols) + `action_events` (3 cols) | scalars | 10,000 events | OK |
| `/notifications`, bell | recipient rows (7 cols) + head count | scalars | 100 / 8 | OK — replaced `select('*')` |

## 6. Final activation pass (2026-11-01)

- Chat previews: bounded DB-side view written and harness-verified; the app switches when `messagePreviews` is on.
- Accounts and Team Performance: single capped reads replaced by paged reads with stated ceilings (`src/lib/operations/paged-read.ts`), tested with 2,600 leads and 7,500 events.
- Admin Home profile rows read today's executed `action_events` (5 scalars, ≤5,000) instead of `daily_accountability`.
- Still **not measured**: ms, query counts and payload bytes per route need `RELAY_PERF_LOG=1` against a database that serves traffic.
