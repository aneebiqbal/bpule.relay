# Relay — Neon Egress Audit + Cost Hardening

> **Date:** 2026-11-03
> **Method:** static contract review of every high-traffic loader, plus **measured**
> column sizes parsed from the 192 MB production export (`data_load.sql`, 814 leads /
> 785 conversation_states / 1,212 messages / 5,031 action_events). No production reads
> were used.
> **Rule:** lists fetch list data, details fetch detail data, charts fetch aggregates,
> threads fetch threads only when open.
>
> **Status:** closed. Relay is on a paid Neon plan; the success criteria are now
> egess efficiency, bounded query cost, no full-set hot-path reads, stable
> performance and a measured monthly cost — not the retired Free-tier 5 GB cap.

---

## 1. Root cause

Neon Free suspends compute when a project exceeds **5 GB public transfer / month**.
Relay used **6.83 GB** in the 2026-11-01 → 2026-12-01 period. The transfer was not one
blob — it was the same lead rows re-fetched on every dashboard, board, queue and leads
load, carrying detail columns no list surface reads.

The database was never the problem. The projections were.

---

## 2. Measured table payloads (real rows, real column sizes)

Parsed from the production export. "All" is `SELECT *`; "list" is the pre-fix
`LEAD_LIST_COLUMNS`; "queue" is the post-fix narrow projection.

| Table | Rows | All columns | Before | After | Reduction |
|---|---:|---:|---:|---:|---:|
| `leads` | 814 | 58,153 KB | **5,242 KB** (list) | **1,335 KB** | **74.5%** |
| `conversation_states` | 785 | 465 KB | **465 KB** (`select('*')`) | **41 KB** | **91.2%** |
| `messages` | 1,212 | 768 KB | **768 KB** (`select('*')`) | **424 KB** | **44.8%** |
| `upwork_jobs` | 97 | 1,114 KB | **1,114 KB** (`select('*')`) | **147 KB** | **86.8%** |
| `notification_log` | 144 | 42 KB | **42 KB** (`select('*')`) | **~30 KB** | ~29% |

The dashboard's rate read (`fetchRates`) selected `id, lead_id, type, sent_at, sent_text`
but `computeRates` only reads `sentAt`; it now selects `lead_id, sent_at`
(**295 KB → 109 KB**).

### 2.1 `leads` — where the 5.24 MB went

| Column | Bytes / 814 rows | In list before | In list after |
|---|---:|---|---|
| `canonical_intelligence` | 30,698 KB | no (3 JSON paths only) | no |
| `search_vector` | 11,515 KB | no | no |
| `raw_input` | 10,574 KB | no | no |
| `score_breakdown` | **2,050 KB** | **yes** | **no** |
| `extraction_profile` | **1,732 KB** | **yes** | **no** |
| `signal_evidence` | 908 KB | yes | yes (search + high-fit evidence) |
| `inbound_message` | 4.5 KB | yes | yes (inbound-first stage) |
| `verbatim_quote` | ~0.2 KB | yes | yes (high-fit evidence) |
| decision / profile-match / hash / fallback | ~1 KB | yes | no |

`score_breakdown` + `extraction_profile` alone were **3.78 MB of the 5.24 MB** list
payload. Neither is read by any list, board, pipeline or queue surface — they belong to
the Lead 360 / drawer detail projection (`LEAD_COLUMNS`), which still selects them.

### 2.2 `conversation_states` — the queue read the whole row

`fetchLeadsWithMessages` ran `select('*')` and transferred `memory` (100.6 KB),
`commercial_state` (30.6 KB) and `composer_draft` (30.4 KB). The queue engine only reads
`stage` and `sender_profile_id`; the conversation blobs are for the opened thread and the
composer. Post-fix: `lead_id, stage, sender_profile_id` = **41 KB**.

### 2.3 `messages` — the queue read the whole row

`select('*')` transferred `original_draft` (112 KB), `idempotency_key` (66 KB),
`model_used`, `send_disposition`, `reject_reasons`, `strategy`, `angle`, `cta_type`,
`thread_status`. The queue needs `sent_text`, `draft_text`, `direction`, `sent_at`,
`created_at`, `type`. Post-fix: **424 KB**.

### 2.4 `upwork_jobs` — the list read the whole row

`listUpworkJobs` ran `select('*')`, transferring `raw_input` (356 KB), `job_facts`
(335 KB), `search_vector` (128 KB) and `score_breakdown` (110 KB) on every dashboard
load. The list/queue reads `description` (95 KB) and scalars; the detail page
(`getUpworkJob`) keeps the full row. Post-fix: **147 KB**.

---

## 3. Query inventory (high-traffic routes)

| Route | Loader | Before | After |
|---|---|---|---|
| `/dashboard` (rep) | `getTodayDashboard` + `getRelayQueueData` | 2× full lead list + convo `*` + messages `*` + rates | 1× narrow lead list (snapshot) + convo 41 KB + messages 424 KB |
| `/dashboard` (admin) | `loadAdminCommandCenter` | summaries + bounded reads | unchanged (already aggregate) |
| `/leads` (table) | `listLeadsPage` | 5,242 KB × page/814 | 1,335 KB × page/814 |
| `/leads?view=pipeline` | `loadBoardPreview` → `loadBoardData` | all leads (5,242 KB) + all messages (`sent_text`) + convo `*` | all leads (1,335 KB) + messages (no body) + convo 41 KB |
| `/chats` | `loadChatQueue` | already narrow; bounded preview; thread on open | unchanged |
| `/tasks` | `getTodayDashboard` + `getRelayQueueData` | 2× full lead list + convo `*` + messages `*` | 1× narrow lead list (snapshot) + convo 41 KB + messages 424 KB |
| `/relay` | `getTodayDashboard` + `getRelayQueueData` + `fetchLeadsAll` | 3× full lead list + convo `*` + messages `*` | 1× narrow lead list (snapshot) + convo 41 KB + messages 424 KB |
| `/api/relay/queue` | same as `/relay` | 3× full lead list + convo `*` + messages `*` | 1× narrow lead list (snapshot) + convo 41 KB + messages 424 KB |
| `/prospect` | `loadProspectsPage` → `loadBoardData` | all leads + all messages | all leads (narrow) + messages (no body) |
| `/performance` | `getRepDailyActivity` | every rep event in the range, embedded in the response | one `GROUP BY (day, type)`; raw events only for the clicked day |
| `/team/performance` | `loadPerformance` | up to 50 000 events + 3 000 cohort leads + 5 000 task_events | 4 grouped statements + the cohort/funnel reads |
| `/team/targets` | `loadTargets` | up to 10 000 events | one `GROUP BY (actor, type)` |

### 3.1 Duplicate reads removed

- `fetchLeadsWithMessages` now reuses `listOwnedLeads()`, so the request-scoped
  read-only snapshot serves the dashboard, queue and admin lead scan instead of three
  full projections.
- `beginReadOnlySnapshot()` added to `/api/relay/queue`, `/tasks`, `/relay` (it was
  already on `/dashboard`). Write paths never enable it.

### 3.2 Client overfetch removed

`LeadRow.lastOutboundText` / `lastInboundText` were populated from `sent_text` and
serialised to the browser on every board card, but **no component read them**. The board
still reads `sent_text` — the exact "has an outbound/inbound body" rule that decides
pipeline stage depends on it (454 connection-only messages have an empty body and must
not count as outbound) — but the body is no longer attached to the row sent to the
client. The dead text fields are removed from the `LeadRow` contract.

---

## 4. Changes

| File | Change |
|---|---|
| `src/lib/store/supabase-store.ts` | `LEAD_LIST_COLUMNS` drops 19 unused/detail columns; `RELAY_QUEUE_*` + `UPWORK_JOB_LIST_COLUMNS` constants; `fetchLeadsWithMessages` reuses the snapshot + narrow selects; `fetchRates` drops `sent_text`; `listUpworkJobs` / `listNotifications` narrow |
| `src/lib/store/rates.ts` | `RATE_GROUP_SQL` — one `GROUP BY` for the dashboard rates |
| `src/lib/store/pipeline-stage.ts` | `PIPELINE_STAGE_SQL` / `PIPELINE_CARD_IDS_SQL` — stage counts and bounded card ids |
| `src/lib/analytics/aggregates.ts` | heatmap daily counts, performance metrics by rep/profile/source, target progress |
| `src/lib/performance/activity-model.ts` | heatmap reads the daily aggregate; raw events only for the clicked day |
| `src/lib/operations/performance.ts` | `loadPerformance` uses grouped aggregates on Neon; `loadPerformanceFromEvents` keeps the rollback |
| `src/lib/operations/targets.ts` | `loadTargetEvents` uses `GROUP BY (actor, type)` on Neon |
| `src/lib/leads/board-rows.ts` | dead `lastOutboundText`/`lastInboundText` client fields removed; `sent_text` kept for exact stage semantics; the unused `events` enrichment removed |
| `src/components/leads/pipeline-utils.ts` | `LeadRow` drops `lastOutboundText` / `lastInboundText` |
| `src/app/(app)/dashboard/page.tsx` | already snapshot (unchanged) |
| `src/app/api/relay/queue/route.ts` | `beginReadOnlySnapshot()` |
| `src/app/(app)/tasks/page.tsx` | `beginReadOnlySnapshot()` |
| `src/app/(app)/relay/page.tsx` | `beginReadOnlySnapshot()` |
| `tests/relay-egress.test.ts` | projection contracts (6 tests) |
| `tests/relay-rate-aggregate.test.ts` | rate aggregate parity |
| `tests/relay-pipeline-aggregate.test.ts` | pipeline aggregate parity + scope |
| `tests/relay-analytics-aggregate.test.ts` | heatmap / performance / targets parity, send truth, scope, fallback (22 tests) |

---

## 5. Route payload estimates (derived from the measured projections)

| Route | Before | After projections | After aggregates | After analytics | Reduction |
|---|---:|---:|---:|---:|---:|
| Rep Home | ~7.9 MB | ~2.1 MB | ~0.7 MB | ~0.7 MB | **~91%** |
| Admin Home | ~1 MB | ~1 MB | ~1 MB | ~1 MB | ~0% (bounded by construction) |
| Leads page (50 rows) | ~322 KB | ~82 KB | ~82 KB | ~82 KB | 74.5% |
| Pipeline / board | ~6 MB | ~1.7 MB | ~0.4 MB | ~0.4 MB | **~93%** |
| Chats queue | ~250 KB | ~250 KB | ~250 KB | ~250 KB | 0% (already optimised) |
| Relay queue API | ~18 MB | ~2 MB | ~2 MB | ~2 MB | ~89% |
| Tasks | ~12 MB | ~2 MB | ~2 MB | ~2 MB | ~83% |
| Heatmap (`/performance`) | 1 907 rows · 698 KB | — | — | **68 rows · 3.9 KB** | **99.4%** |
| Team Performance | 1 180 rows · 430 KB | — | ~430 KB | **36 rows · 3.0 KB** | **99.3%** |
| Targets (30 d) | up to 10 000 rows | — | ~100 KB | **~1 KB** | **>99%** |

The aggregate slice (see `docs/RELAY_NEON_AGGREGATE_SLICE.md`) removed the
full-set count reads: `fetchRates` became one `GROUP BY` aggregate, and the
pipeline board became one counts aggregate + one bounded card-id query + the 150
card rows.

The analytics slice (see `docs/RELAY_NEON_ANALYTICS_EGRESS.md`) removed the last
raw event scans: the heatmap became a daily `GROUP BY`, Team Performance became
four grouped statements, and Targets became one grouped statement.

These are per-request DB payload estimates, not wall-clock timings. Live timing
and byte counts require the deployed environment.

---

## 6. Remaining debt (not done, deliberately)

1. Rep Home `getRelayQueueData` reads the rep's own leads and their messages —
   bounded by the rep's book, not the org. ~0.7 MB.
2. Admin Home `loadAdminCommandCenter` reads one day of `action_events`
   (cap 5 000) for profile totals. A day is tens of rows in production.
3. Rep Home `countOutcomeEventsToday` reads one day of `action_events`
   (cap 2 000). Same reasoning.
4. `loadPerformance` still reads the 3 000-row cohort and its
   `conversation_states` for the funnel — a lead read, not an event scan, and the
   funnel is per-lead furthest-stage so it cannot be a `COUNT`.
5. `buildDashboardAnalytics` / `PipelineAnalyticsView` are not rendered by any
   route. There is no live performance-trend surface, so no trend aggregate was
   built.
6. No live before/after timing — requires the deployed environment.

---

## 7. Budgets

See `docs/RELAY_NEON_EGRESS_BUDGET.md`.
