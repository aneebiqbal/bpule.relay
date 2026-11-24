# Performance & worker certification

Evidence: `artifacts/performance.json` — `scripts/qa/staging-performance.mjs`.

## Method

Production build served with `next start`; real OWNER/ADMIN/MANAGER sessions; 5 navigations per
route; client-observed time to `domcontentloaded`. Local disposable PostgreSQL, single concurrent
user. **This is not a production benchmark.** Production/VPS performance remains unverified.

## Results (p50 / p95 ms)

| Route | OWNER | ADMIN | MANAGER |
|---|---|---|---|
| `/dashboard` | 59 / 65 | 39 / 44 | 30 / 35 |
| `/chats` | 39 / 40 | 35 / 35 | 38 / 40 |
| `/tasks` | 30 / 33 | 28 / 30 | 33 / 39 |
| `/leads` | 33 / 44 | 32 / 33 | 36 / 47 |
| `/prospect` | 27 / 33 | 27 / 29 | 26 / 35 |
| `/jobs` | 29 / 31 | 25 / 29 | 28 / 31 |
| `/admin/targets` | 28 / 32 | 29 / 30 | 28 / 37 |
| `/team` | 38 / 43 | 37 / 42 | 34 / 42 |
| `/settings` | 31 / 33 | 34 / 48 | 32 / 43 |

No route exceeded 70 ms p95 locally. The first OWNER dashboard sample is warmer than the rest
(cold compile).

## Not measured

Database round trips under load, CPU/RAM, bundle-size delta, and concurrency. Query-count
instrumentation exists (`RELAY_PERF_LOG=1`) but was not part of this run.

## Workers

The five scheduled workers were **not** executed against the VPS in this pass: no authorized VPS
access. Their configuration and idempotency were reviewed previously; bounded production-like
workload certification remains outstanding and is recorded as untested, not passed.
