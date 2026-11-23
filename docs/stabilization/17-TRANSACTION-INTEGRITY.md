# Relay — Transaction Integrity

## 1. The primitive

`DbClient` grew an optional `transaction<T>(fn)`:

| Provider | Implementation |
|---|---|
| `postgres` (`pg`) | one checked-out connection, `BEGIN`, `SET LOCAL app.current_user_id`, run `fn`, `COMMIT`; `ROLLBACK` on any throw; connection released in `finally` |
| `neon` (`@neondatabase/serverless`) | same shape, bound executor over the held connection |
| `supabase` (PostgREST) | **absent** — no multi-statement transaction surface; callers fall back to sequential writes |

Every `from()` query is still its own short transaction outside `transaction()`.

## 2. Work Setup atomicity

`saveWorkSetup` performs, in one physical transaction when available:

1. compare-and-set revision check;
2. responsibility chain reconcile (coverage + eligibility + acknowledgements +
   audit) — already a single SQL statement on raw providers;
3. target lane upserts;
4. allocation replacement (update-in-place → insert → deactivate removed).

Any dependent write error **throws**, aborting the transaction. A validation
failure before the transaction returns normally without writing.

Notifications are emitted by the assignment path **after** the chain writes;
a notification failure is logged/deduped and never rolls back a committed
assignment (idempotent dedupe keys make retries safe).

## 3. Failure injection results

Fake harness snapshots/restores the full state around `transaction()`, so a
thrown error proves rollback. From `tests/work-setup-transaction.test.ts`:

| Injected failure | Result |
|---|---|
| allocation insert fails | full state restored; no coverage/target changes |
| target upsert committed then allocation fails | target change rolled back |
| audit insert fails after chain commit | chain rolled back |
| eligibility upsert fails after coverage commit | coverage rolled back |
| stale `expectedRevision` | `code: 'CONFLICT'`, zero writes, committed state preserved |
| matching revision | success |

## 4. Optimistic concurrency

`GET /api/admin/work-setup` returns a per-account `revision`
(`MAX(updated_at)` across coverage, plans, allocations, eligibility). `POST`
accepts `expectedRevision`; if it does not match, the server returns **HTTP 409**
with `code: "CONFLICT"`, the current `revision`, and the current row values. No
last-writer-wins overwrite.

Providers without raw SQL derive the same revision with the query builder.

## 5. Limits

- The PostgREST provider has no transaction; the fallback is sequential and
  documented in code. Production runs on `postgres`, so the atomic path is live.
- `configureCoverage` called directly (team routes) already validates seats and
  is itself one statement; it does not yet open its own transaction wrapper
  beyond that statement. Work Setup is the multi-statement path and is covered.
