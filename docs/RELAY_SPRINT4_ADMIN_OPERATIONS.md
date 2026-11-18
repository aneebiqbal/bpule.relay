# Relay Sprint 4 — Admin Operations

Branch `feat/relay-completion-program`. Commit `7f1ade92` (plus the Sprint 1–3
commits). Pushed; not deployed.

## 1. Assignment performance — measured and partly reduced

Profiled `addOperatorResponsibility` / `configureCoverage` on a disposable
fixture (10 consecutive adds, then cleaned up):

| Metric | Value |
|---|---|
| p50 | **14.7 s** |
| p95 | **30.6 s** |
| samples | 13.2 s … 30.6 s |

The dominant cost is the shared host (~1.5 s **per query**), not round-trip
count: ~15 sequential statements remain. Change made: the operator
acknowledgement chain is now seeded with **one read + one insert** instead of
two round trips per operator, and the assignment notification is idempotent
(upsert) instead of warning on a duplicate dedupe key.

Adding an operator still never removes an unrelated seat (verified by the live
regression test). Further reduction requires batching the eligibility/deactivate
writes and the audit insert, or a host with lower per-query latency — **not
done**, and pool size / timeouts were deliberately left alone.

## 2. Channel lifecycle — NOT implemented

No validated transition service, no reason/actor record, no status action in the
Control Center, and execution reads are not gated on `status = 'active'`.
`revenue_identities.status` still carries the values but nothing enforces the
rules.

## 3. Control Center actions — partial

Available today: add profile (Add account), add channel, assign/unassign
operator, change primary (transfer), targets, schedule, knowledge, history,
review issues, archive via the existing profile/identity surfaces.

Missing: a header-level target editor, split-target editor, task creation, and
status changes inside the Control Center itself.

## 4. Deletion / duplicates — NOT implemented

No dependency preview, no archive/restore UI, no duplicate comparison, no merge
plan. The reconciliation scanner reports candidates only.

## 5. Data integrity — finding and proposed repair (NOT applied)

The scanner now reports `active_plan_without_primary`. Live finding:

```
profile  6e92e611-dd09-464e-8b07-b82ef009e813  (Fizza · Upwork)
channel  034fec42-6deb-4458-a2e4-539f29dd0d09
kind     active_plan_without_primary
detail   active plan but no active PRIMARY; the last known owner is available
proposed primary  aaaaaaaa-0000-0000-0000-000000000002  (Hassan)
```

The proposal is shown in Control Center → Issues & Data and is **never applied**
automatically. The real target (5 applications) is untouched. The hard invariant
test (`responsibility-coverage-contracts`: every active plan belongs to a profile
with exactly one active PRIMARY) is **kept failing** rather than skipped — it is
the regression guard for this break.

## 6. Playwright — NOT run

No isolated-fixture browser journey was executed in this sprint.

## 7. Gates

| Gate | Result |
|---|---|
| TypeScript | clean |
| ESLint (changed) | 0 errors |
| Unit | see release note |
| Live-DB | see release note |

## 8. Remaining exact steps

1. Get approval to restore the Fizza·Upwork chain to PRIMARY Hassan (proposed
   above) — one `configureCoverage` call.
2. Gate every executable read on `revenue_identities.status = 'active'` and add
   the lifecycle service + Control Center status action.
3. Batch the remaining assignment writes; re-measure p50/p95.
4. Add the archive/delete dependency preview and duplicate comparison.
5. Run the Playwright journey on disposable fixtures.
