# Relay — API and Database Integrity

## 1. API surface

- 261 route handlers; no `"use server"` files; all mutations via HTTP.
- Methods: GET 221, POST 234, PATCH 60, PUT 2, DELETE 27.
- Cron routes (8) all gated by `requireCronSecret`.
- Webhook routes gated by provider secrets.

## 2. Idempotency and dedupe

| Domain | Mechanism |
|---|---|
| Notifications | `notifyOnce` + unique `dedupeKey` (includes business date) |
| Job preparation | `prepared_jobs.idempotency_key` unique lookup before insert |
| Email send | `email_send_attempts` idempotency key (unique index) |
| Upwork apply | `submit_upwork_application` RPC dedupes by `job_id` |
| Work Setup | unchanged save is a no-op (`sameSeatSet` guard) |

## 3. Transaction boundaries

**Confirmed gap (R-13).** `DbClient` has no transaction primitive. Each
`.from()`/`.raw()` is its own `BEGIN`/`COMMIT`. Consequences:

- `saveWorkSetup` commits seats, targets and allocations separately.
- `configureCoverageStatement` deactivates the previous chain in one statement,
  then runs the reconcile CTE; a CTE failure can leave zero active seats.
- `saveResponsibilityChain` can report failure after the chain committed (audit
  insert failure).

**Fixed this pass (R-02):** allocation replace no longer has a zero-allocation
window. Full transaction wrappers remain open.

## 4. Concurrency

No optimistic concurrency / revision field anywhere in Work Setup or coverage.
Concurrent admins last-writer-wins; the `sameSeatSet` idempotence guard is a
read-then-write race.

## 5. Failure handling

- `safeErrorResponse` returns generic messages and logs detail.
- Missing-relation errors are tolerated where a table may not be migrated
  (`isMissingRelation`).
- Pool checkout fails fast (`DATABASE_POOL_QUEUE_MS`, default 15s); idle client
  errors are caught and logged, never uncaught.

## 6. Schema state

201 migrations; production reports 192 tables / 160 RLS / 494 policies. No
destructive migration in this branch (additive only, per prior certification).
`scripts/apply-migrations.mjs` is idempotent (`applied=0 skipped=200 failed=0`
on re-run, prior pass).
