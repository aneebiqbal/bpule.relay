# Relay — Neon Egress Budget

> **Purpose:** regression control for DB payload size per core route. A route that
> grows past its budget must either justify the growth in a review or be narrowed.
>
> **Success criteria (updated 2026-11-03 — Relay is on a paid Neon plan):**
>
> ```
> EGRESS EFFICIENT        bytes per request stay bounded
> QUERY COST BOUNDED      no unbounded row reads on a hot path
> NO FULL-SET HOT-PATH READS
> PERFORMANCE STABLE     TTFB does not regress
> MONTHLY COST MEASURED  transfer is measured, not assumed
> ```
>
> The old `FREE_TIER_SUSTAINABLE` / 5 GB-allowance framing is retired. It was the
> right emergency target when the project was suspended mid-month; it is not the
> operating bar now.

## 1. Budgets

| Route | Budget | After projections | After aggregates | After analytics | Status |
|---|---:|---:|---:|---:|---|
| Rep Home | < 250 KB | ~2.1 MB | ~0.7 MB | ~0.7 MB | **over** — see §2 |
| Admin Home | < 400 KB | ~1 MB | ~1 MB | ~1 MB | **over** — see §2 |
| Leads page (50 rows) | < 300 KB | ~82 KB | ~82 KB | ~82 KB | **within** |
| Pipeline / board initial | < 500 KB | ~1.7 MB | ~0.4 MB | ~0.4 MB | **within** |
| Chats queue | < 250 KB | ~250 KB | ~250 KB | ~250 KB | **at budget** |
| Lead drawer | < 250 KB | ~small | ~small | ~small | **within** |
| Lead 360 initial core | < 1 MB | ~1 MB | ~1 MB | ~1 MB | **at budget** |
| Heatmap (`/performance`) | < 50 KB | raw events | raw events | **~4 KB** | **within** |
| Team Performance initial | < 500 KB | raw events | ~430 KB | **~3 KB** | **within** |
| Targets (30 d) | < 100 KB | raw events | ~100 KB | **~1 KB** | **within** |

## 2. What is still over, and why

Rep Home is ~0.7 MB because the dashboard's queue (`getRelayQueueData`) reads the
rep's own leads plus their messages for reply analysis and live-opportunity
ranking — bounded by the rep's book, not the organization. Admin Home is ~1 MB of
bounded summaries. Neither is a full-set read; both are bounded by construction
and are the next candidates only if a route ever regresses past budget.

## 3. Guard

`tests/relay-egress.test.ts` locks the projections:

- `LEADS_LIST_EXCLUDES_HEAVY_COLUMNS`
- `LEAD_DETAIL_OWNS_SCORE_BREAKDOWN`
- `LEADS_LIST_KEEPS_RENDERED_AND_DERIVED_FIELDS`
- `RELAY_QUEUE_CONVERSATION_EXCLUDES_MEMORY_BLOBS`
- `RELAY_QUEUE_MESSAGES_EXCLUDE_FULL_THREAD_COLUMNS`
- `CHAT_QUEUE_EXCLUDES_FULL_MESSAGES`

`tests/relay-analytics-aggregate.test.ts` locks the analytics aggregates:
`HEATMAP_SQL_JS_PARITY`, `HEATMAP_TIMEZONE_PARITY`, `PERFORMANCE_SQL_JS_PARITY`,
`PERFORMANCE_SEND_TRUTH`, `PERFORMANCE_MEETING_TRUTH`,
`PERFORMANCE_TARGETS_EVENT_PARITY`, `PERFORMANCE_AGGREGATE_SCOPE`.

A PR that adds a heavy column back to a list projection, or that reintroduces a
raw event scan on a summary route, fails the suite.

## 4. Cost model

Transfer is now a **measured operating cost**, not an emergency. At the last
measured 6.83 GB / month the project was suspended; the projection, aggregate and
analytics slices remove the multipliers that produced it (per-row width, per-request
row count, and raw analytics scans). With those gone, monthly transfer should scale
with request volume rather than with table size. Re-measure on the deployed
environment and record the actual GB/month here before changing the architecture
again.

Per-request capacity is no longer the right unit — the right unit is
`monthly GB = requests/month × average route payload bytes`, measured.
