# Relay — Performance and Workers

**Honest status:** no new benchmark was run (no VPS access, N-02). Prior
measurements are carried forward and labelled.

## 1. Carried-forward performance evidence

`docs/RELAY_PERFORMANCE_2026-11.md` / `RELAY_RELEASE_GATE_FINAL.md`:

| Measurement | Before | After |
|---|---|---|
| Sender list p50 (3 runs) | ~30 s | 13.3 / 8.5 / 8.6 s |
| Cached analyze | 17.1 s | 7.0 s |
| `db.read` per request | 47 | 16 |
| `auth.session.read` per request | 14 | 1 |
| `getCurrentUser` resolutions | 7 | 1 |

Root cause fixed: `src/lib/request-scope.ts` (React `cache()` does not cover
route handlers). Remaining floor: 16 reads and ~870 ms per pool operation
(3 round trips: `BEGIN; set_config` → query → `COMMIT`).

## 2. Worker timers

| Timer | Interval | Observed |
|---|---|---|
| job-discovery | 15 min | not measured |
| job-verification | 10 min | not measured |
| job-inventory | 15 min | not measured |
| job-preparation | 20 min | not measured |
| job-notifications | daily 09:00 | not measured |

No VPS/PM2 access in this session. The release candidate must be benchmarked on
the 1 vCPU / 4 GB VPS before GO (commands in `RELAY_PRODUCTION_RELEASE.md` §2).

## 3. Database load

- Pool max 3 per app instance; service pool max 1.
- Checkout timeout 15 s; connection timeout 10 s.
- Read count bounded by request-scope memoization.
- No N+1 found in the canonical accounting read (single `Promise.all`).

## 4. Risk

R-03: the live-test suite writes to production. Until guarded, a developer
running `npm run test:live` adds write load to the production database.
