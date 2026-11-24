# Staging recovery & authenticated certification — summary

**Branch:** `feat/relay-job-intelligence-v2`
**Base SHA:** `dd942850` · **Head after this program:** see `git rev-parse HEAD`

## The bottleneck is removed

The previous program could not run authenticated tests because staging could not be
provisioned. That is now solved with a disposable local environment:

| Piece | Command | Result |
|---|---|---|
| Schema | `node scripts/qa/staging-bootstrap.mjs` | **198 migrations applied, 0 failed**, 4 historical demo seeds explicitly skipped with reasons |
| Fixtures | `node scripts/qa/staging-fixtures.mjs` | two isolated orgs, real Better Auth accounts, seats, shared/solo targets, leads, conversations, tasks, a suspended user |
| Authenticated E2E | `node scripts/qa/staging-e2e.mjs http://localhost:3000` | **19 passed / 0 failed** from a freshly provisioned database |

Environment: PostgreSQL 18 on `127.0.0.1:5433` (pgvector included), database
`relay_staging_local`. Both scripts refuse any non-local target; production is never
contacted and no production data is copied.

## Real sessions, real role proof

- **Manager** signs in, opens `/chats`, sees teammate-owned and member-owned
  conversations, opens the teammate thread, reads messages, loads intelligence,
  names a sending profile, and survives refresh — all live. This is the exact
  regression the previous sprint fixed by code; it is now proven end to end.
- **Member** sees only authorized conversations; a direct API request for an
  identity with no seat/coverage returns **HTTP 404**.
- **Cross-org** conversation id returns **HTTP 404**.
- **Suspended** account cannot sign in.
- **Work Setup**: save with the current revision returns **200**, a replayed stale
  revision returns **409**, and an over-target allocation returns **400**.

## Defects this exposure found (all fixed)

1. **P1 — Work Setup was broken everywhere an assignment exists.** The revision
   computation read `identity_assignments.updated_at`, a column the schema never
   created, so `GET /api/admin/work-setup` returned HTTP 500. See
   `01-MIGRATION-ORDER_FIXES.md`.
2. **P2 — out-of-scope conversation access returned HTTP 500**, indistinguishable
   from a server fault. Denial is now a typed `AppError(404)`, so it is
   indistinguishable from "missing" and never looks like a failure.
3. **Migration ordering/shape defects** that made a clean bootstrap fail at all
   (invalid `ON CONFLICT` targets, missing idempotent columns, one wrong type).

One new defect was observed and is **recorded, not hidden**: the perf instrumentation
can call `performance.measure()` with a negative timestamp on TodayPage. See
`04-DEFECTS-AND-VERDICT.md`.

## Gates

TypeScript clean · ESLint 0 errors (777 pre-existing warnings) · unit suite
**5970 passed / 19 skipped**, exit 0 · production build pass · authenticated E2E 19/19.

## Verdict

**GO for integration.** **Still NO-GO for production activation** until the same
authenticated matrix runs against the real staging/VPS deployment and the external
security gates (Aiven admin credential rotation, GitHub PAT revocation, Vercel
billing) are cleared by the owner.
