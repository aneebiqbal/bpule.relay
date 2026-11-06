# Relay — Neon Analytics Egress

> **Date:** 2026-11-03
> **Scope:** the remaining raw `action_events` scans on analytics summary routes.
> **Status:** done. Database egress work stops here.

The projection slice removed **bytes per row**. The aggregate slice moved the
full-set **counts** into Postgres. This slice moves the remaining **analytics
event scans** into Postgres: the personal heatmap and Team Performance.

---

## 1. Audit — what read raw events

| Path | Tables | Rows read | Window | Grouping | Role scope | Consumers |
|---|---|---|---|---|---|---|
| `getRepDailyActivity` | `action_events`, `leads` (names) | every event for the rep, plus each event embedded in the response | range (default 12 wks) | JS by local date | `organization_id` + `actor_id` | `/performance`, `/api/performance/activity`, `/api/admin/performance/activity` |
| `loadPerformance` | `action_events` (ceiling 50 000), `leads` (cohort cap 3 000), `task_events` (cap 5 000), `revenue_identities`, `reps`, `conversation_states` | up to 50 000 events | ops range (7/30/90 d, today) | JS `aggregateMetrics` + `groupMetrics` | org + `actor_id IN (repIds)` | `/team/performance`, `/reports/team`, `/team/[repId]`, `/team/groups/[teamId]` |
| `loadTargets` | `action_events` (cap 10 000), `daily_targets` | up to 10 000 events | 1/7/30 d | JS per (actor, type) | org + `actor_id IN (repIds)` | `/team/targets` |
| `loadAdminCommandCenter` | `action_events` today (cap 5 000), `action_events` week (cap 40) | one day of events | 1 d | JS `groupMetrics` by profile | organization | `/dashboard` (admin / owner) |
| `countOutcomeEventsToday` | `action_events` today (cap 2 000) | one day of events | 1 d | JS `aggregateMetrics` | org + `actor_id` | `/dashboard` (rep) |
| `enrichLeads` | `messages` | visible leads' messages | — | built an `events[]` array | — | **none** — removed |

`buildDashboardAnalytics` / `PipelineAnalyticsView` (`src/lib/analytics/pipeline-analytics.ts`)
are not rendered by any route; there is **no live performance-trend surface**.
No trend aggregate was built, because there is no trend to serve.

---

## 2. What changed

| File | Change |
|---|---|
| `src/lib/analytics/aggregates.ts` | **new** — the SQL: `activityDailySql`, `activityCoverageSql`, `activityDayEventsSql`, `performanceMetricsSql` (actor / profile / source / total), `targetProgressSql`, plus `metricCountsFromRow` |
| `src/lib/performance/activity-model.ts` | `getRepDailyActivity` takes `includeEventsForDate`; the heatmap is one `GROUP BY (local day, action_type)` and the drilldown fetches one day on click |
| `src/lib/operations/performance.ts` | `loadPerformance` tries the grouped aggregate first; `loadPerformanceFromEvents` keeps the exact in-memory tally for the Supabase rollback |
| `src/lib/operations/targets.ts` | `loadTargetEvents` uses `GROUP BY (actor_id, action_type)` on Neon |
| `src/lib/leads/board-rows.ts` | `enrichLeads` no longer builds an `events[]` nobody reads |
| `src/lib/leads/leads-page.ts` | `LeadsPageData.events` removed |
| `tests/relay-analytics-aggregate.test.ts` | **new** — 22 parity / send-truth / scope / fallback tests |
| `tests/helpers/fake-supabase.ts` | fake builder gains `in()` and `range()` |

### Not changed, deliberately

- **Admin Home** — `loadAdminCommandCenter` reads one day of events (cap 5 000).
  A day is tens of rows in production; rewriting it would add a second profile
  attribution path for a few KB. Left alone.
- **Rep Home outcomes** — `countOutcomeEventsToday` reads one day (cap 2 000).
  Same reasoning.
- **`loadPerformance` cohort + funnel** — the funnel is *furthest known stage*
  per lead, which cannot be a `COUNT`. The 3 000-row cohort read stays; it is a
  lead read, not an event scan.
- **`task_events`** — read per rep for `tasksCompleted`; capped and small.

---

## 3. Parity evidence

Both new SQL paths were run against the **production-shaped export** loaded into
a temporary Postgres 17 (5 031 `action_events`, 418 leads, 785
`conversation_states`), and compared with the JS authority on the same rows.

| Gate | Result |
|---|---|
| `HEATMAP_SQL_JS_PARITY` — every day, every breakdown field, all 6 reps | **0 diffs** |
| `HEATMAP_TIMEZONE_PARITY` — `AT TIME ZONE` vs `Intl`, incl. 23:30 UTC / 18:59:59 UTC boundaries | **PASS** |
| `PERFORMANCE_SQL_JS_PARITY` — totals, rep, profile, source; scopes: org, rep, profile, source=linkedin, source=other | **0 diffs / 5 scopes** |
| `PERFORMANCE_SEND_TRUTH` — failed sends excluded; `REPLY_SENT` is a message but not a contact | **PASS** |
| `PERFORMANCE_MEETING_TRUTH` — `MEETING_BOOKED` ≠ `CLIENT_WON` | **PASS** |
| `PERFORMANCE_TARGETS_EVENT_PARITY` — grouped target rows produce the same counts | **PASS** |
| `PERFORMANCE_AGGREGATE_SCOPE` — rep / profile / source filters applied inside the aggregate | **PASS** |

### 3.1 Profile attribution

`performanceMetricsSql` reproduces `identityResolver` exactly:

```
profile_key = COALESCE(
  CASE WHEN pi.n = 1 THEN pi.identity_id::text END,   -- profile → its one identity
  l.revenue_identity_id::text,                        -- else the lead's identity
  'none'
)
```

`pi.n > 1` (a sending profile shared by two identities) resolves to `null`,
which falls through to the lead — the same ambiguity rule the JS applies.

Source attribution reproduces `sourceBucket` with the lead's source, falling back
to the event's own channel (`UPWORK_%` → `upwork`, else `other`) only when the
lead row is absent.

### 3.2 Activity API contract

`/api/performance/activity` and `/api/admin/performance/activity` no longer embed
every event in the range. `daily[].events` is populated only when `?date=YYYY-MM-DD`
is supplied, which is what the drilldown needs. Consumers that want a day's events
must ask for that day. See `docs/archive/RELAY_REP_HOME_V2.md` for the Rep Home client.

---

## 4. Timezone contract

The heatmap's day is `(occurred_at AT TIME ZONE ?)::date`, parameterised with the
**organization's** operating timezone (`loadOperatingPolicy`). That is the same
calendar date `Intl.DateTimeFormat` produces:

| Instant (UTC) | `Intl` Asia/Karachi | SQL `AT TIME ZONE` |
|---|---|---|
| 2026-10-17T23:30:00Z | 2026-10-18 | 2026-10-18 |
| 2026-10-17T19:00:00Z | 2026-10-18 | 2026-10-18 |
| 2026-10-17T18:59:59Z | 2026-10-17 | 2026-10-17 |

The drilldown resolves the clicked local date back to a UTC half-open range with
`businessDateRange`, which is DST-correct.

---

## 5. Request consistency and failure handling

`loadPerformance` issues its four aggregate statements in one `Promise.all`, so
totals and every comparison come from the same instant. `getRepDailyActivity`
reads the daily counts and the coverage start together.

A failed aggregate **falls back** to the existing event read and logs
(`[activity] daily aggregate failed`, `[performance] aggregate failed`). It never
returns zeros. The Supabase provider's `raw()` returns an error by design, so the
rollback path is unchanged and still uses `aggregateMetrics`.

---

## 6. Measured payload (production-shaped export)

| Route | Before | After | Reduction |
|---|---:|---:|---:|
| Heatmap (12 wk, per rep) | 1 907 rows · **698 KB** | 68 daily rows · **3.9 KB** | **99.4%** |
| Team Performance (all scopes) | 1 180 rows · **430 KB** | 36 grouped rows · **3.0 KB** | **99.3%** |
| Targets (30 d window) | 1 106 rows · **~100 KB** | 26 grouped rows · **~2 KB** | **>99%** |

`TARGET_SQL_JS_PARITY` on the export: 26 grouped rows vs 1 106 raw events, 0 diffs.

These are **measured from the export**, not from live Neon. Live re-measurement
requires the deployed environment; the numbers above are the exact row counts
and serialized sizes of the two result sets.

---

## 7. Query budget

| Query | Result rows |
|---|---|
| Heatmap daily | ≤ 84 days × 11 types (production: 68) |
| Performance totals | 1 |
| Rep comparison | one per scoped rep |
| Profile comparison | one per sending identity |
| Source comparison | 3 |
| Target progress | ≤ 7 per rep |
| Day drilldown | one day of events, on click only |

No hot path reads the raw event set. `EXPLAIN` on the production-shaped data:

| Query | Plan |
|---|---|
| Heatmap daily | `Bitmap Index Scan on ae_actor_date_idx` → `HashAggregate` |
| Performance grouped | `Bitmap Index Scan on ae_org_type_time_idx` → `HashAggregate` |
| Target progress | `Bitmap Index Scan on ae_org_type_time_idx` → `HashAggregate` |

Both aggregates hit an existing index, with no sequential scan and no join fan-out
(the profile/source joins are `LEFT JOIN`s on primary keys, one row per event).
**No new index was added** — none was justified by the plan.

---

## 8. Stop condition

```
LISTS        → narrow paginated rows      ✓
DETAILS      → detail projections          ✓
PIPELINE     → aggregate counts + bounded cards  ✓
DASHBOARDS   → compact summaries           ✓
HEATMAPS     → daily aggregates            ✓
TRENDS       → time-series aggregates      n/a — no live trend surface
PERFORMANCE  → grouped aggregates          ✓
ACTIVITY     → paginated real events       ✓ (unchanged)
CONVERSATIONS→ thread only when opened     ✓
```

Database egress is no longer the highest-value engineering problem. Next work is
product work.
