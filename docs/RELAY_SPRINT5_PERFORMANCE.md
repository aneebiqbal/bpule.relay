# Relay Sprint 5 — Assignment Performance + Integrity

Branch `feat/relay-completion-program`. Commits `f005cb43`, `a07d6cd1`.
Pushed; not deployed.

## 1. Assignment latency — measured, not estimated

A bare `select 1` on this host costs **~970 ms**, so every round trip dominates.
Baseline (10 consecutive `addOperatorResponsibility` calls on a disposable
fixture): **p50 14.7 s, p95 30.6 s** across ~12–18 sequential statements.

Change: the whole chain reconcile is now **one parameterized SQL statement**
(`src/lib/coverage/configure.ts`) — deactivate the old chain, insert the new
seats, upsert eligibility, revoke removed eligibility, seed/re-arm/drop
acknowledgements and write the coverage event, all in one atomic,
organization-scoped statement. The assignment notification became an idempotent
upsert.

Re-measured on the same fixture:

| Run | p50 | p95 |
|---|---:|---:|
| 1 | 7.3 s | 8.5 s |
| 2 | 8.5 s | 16.5 s |

**~2× improvement; the 3 s p95 target was not reached.** The remaining bound is
~1 s per query across the ~9 statements still issued by the caller
(read identity, read chain, deactivate, main statement, audit, coverage event,
notification read+read+upsert). Host variance dominates the tail.

Not done: folding the caller's reads and the audit/notification writes into the
statement (would remove ~6 more round trips), and no pool/timeout changes.

## 2. Correctness preserved

- `operator-visibility.live.test.ts` (6) and `v611-multi-operator-contracts` (9)
  pass on the fast path.
- Adding an operator never removes an unrelated seat (live regression).
- `configureCoverage` keeps a builder fallback for raw-less clients (the
  in-memory test harness), so no contract test was weakened.

## 3. Channel lifecycle — NOT implemented

No transition service, no status gating of execution reads, no Control Center
status action.

## 4. Control Center actions / deletion / duplicates — NOT implemented

## 5. Integrity — proposal prepared, not applied

The reconciliation scanner reports `active_plan_without_primary` for
`6e92e611-dd09-464e-8b07-b82ef009e813` (Fizza · Upwork) and proposes the last
known owner `aaaaaaaa-0000-0000-0000-000000000002` (Hassan). Shown in the
Control Center, never applied. The real target (5) is untouched, and the hard
invariant test stays failing on purpose.

## 6. Gates

| Gate | Result |
|---|---|
| TypeScript | clean |
| ESLint (changed) | 0 errors |
| Unit | **397 files / 5,773 passed** |
| Standalone build | exit 0 |
| Live-DB (assignment suites) | 48 passed, **2 failed** — the deliberate "active plan without an active PRIMARY" invariant |

## 7. Definition of done

Not met: channel status enforcement, browser certification, and the 3 s p95
target. Not deployed, not merged.
