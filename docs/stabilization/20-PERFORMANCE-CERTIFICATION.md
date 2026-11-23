# Relay — Performance Certification

**Honest status:** no new HTTP/VPS benchmark was run. No staging app server or VPS
access was available. This file separates what was measured, what was carried
forward, and what remains unverified.

## 1. Measured this pass (database layer)

Read-only operations reconciliation against production `bpulse`:

```
node scripts/qa/reconcile-operations.mjs 11111111-…
wall: 5.34 s (includes connection setup + 7 queries)
```

This is a DB-level measurement, **not** an application request; it is recorded
only as evidence that the canonical read path executes end-to-end against Aiven.

## 2. Carried forward (prior pass, different session/host)

| Measurement | Before | After |
|---|---|---|
| Sender list p50 (3 runs) | ~30 s | 13.3 / 8.5 / 8.6 s |
| Cached analyze | 17.1 s | 7.0 s |
| `db.read` per request | 47 | 16 |
| `auth.session.read` per request | 14 | 1 |

Root cause fixed by `src/lib/request-scope.ts`. Remaining floor: ~870 ms per
pool operation (BEGIN/set_config → query → COMMIT).

## 3. New code cost

- `saveWorkSetup` opens one transaction instead of N independent short
  transactions; on the Postgres adapter that is one extra checkout round trip,
  offset by removing intermediate commits.
- `loadWorkSetup` adds one raw aggregate query for revisions (single round trip).
- `assertSeatsInOrg` adds one `reps` lookup per coverage write.

No unbounded query was introduced.

## 4. Worker timers (unverified this pass)

| Timer | Interval | Duration | CPU | Failed jobs |
|---|---|---|---|---|
| job-discovery | 15 min | not measured | not measured | not measured |
| job-verification | 10 min | not measured | not measured | not measured |
| job-inventory | 15 min | not measured | not measured | not measured |
| job-preparation | 20 min | not measured | not measured | not measured |
| job-notifications | daily 09:00 | not measured | not measured | not measured |

No VPS access. Commands are in `docs/RELAY_PRODUCTION_RELEASE.md` §2. **The
production worker benchmark remains an external blocker.**

## 5. Conclusion

No serious regression introduced; query counts bounded. Production HTTP and
worker benchmarks remain **unverified** and must be captured before final GO.
