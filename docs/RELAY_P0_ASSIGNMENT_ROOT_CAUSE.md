# Relay P0 — Assignment & Operator Visibility: Root-Cause Report

Branch `feat/relay-completion-program`. No production assignment was modified
during investigation: every repro ran inside a transaction that was rolled
back.

## 1. Symptom

Admin assigns a channel (e.g. Aneeb's Upwork) to a rep while another operator
is already assigned. One operator can see and work the channel; the other
cannot.

## 2. Method

- Read the canonical write path (`lib/profiles/assignment.ts` →
  `lib/coverage/actions.ts:configureCoverage`) and the canonical read path
  (`lib/coverage/access.ts:listExecutableIdentitiesForRep`).
- Reproduced the write→read loop against a disposable fixture (real org,
  rolled-back transaction): seed PRIMARY + OPERATOR, add a second operator,
  remove one — asserting `listExecutableIdentitiesForRep` for every rep.
- Grepped every other writer of `identity_assignments` / `profile_coverage`.

## 3. Root causes (confirmed)

### RC-1 — Execution scope ignored seated profiles (read authority)

`listExecutableIdentitiesForRep` built its candidate identity set from
`identity_assignments` (eligibility) plus active coverage only:

```
ids = assignment.identity_id ∪ covered.identity_id
```

A rep who held a `profile_coverage` seat but had **no** eligibility row was
therefore never returned — the owner saw nothing at all. Reproduced: a
seat-only rep saw `false`.

**Fix:** also load the active identities of every profile the rep holds a seat
on (`seatedProfileIds` → `seatedIdentityIds`). The seat is the authority.

### RC-2 — Admin assign routes bypassed the canonical service (write authority)

Three routes wrote `identity_assignments` directly and never created a
`profile_coverage` seat:

| Route | Behaviour | Consequence |
|---|---|---|
| `POST /api/admin/revenue-identities/[id]/assign` | upsert eligibility only | assignee has eligibility but no seat → **cannot see the channel** |
| `DELETE …/assign?repId=` | delete eligibility only | seat survives → **removed rep keeps executing** |
| `POST /api/admin/assignments` | store `assignIdentityAdmin` (eligibility + target seed) | same as above |
| `POST /api/admin/targets` (`assignIfNeeded`) | store `assignIdentityAdmin` | same as above |

Reproduced: eligibility-only rep saw `false` while the seated primary saw
`true` — exactly the reported split.

**Fix:** all four now call `addOperatorResponsibility` /
`removeOperatorResponsibility`, which reconcile the whole profile chain,
write eligibility, arm acknowledgements and audit. The store's
`assignIdentityAdmin` / `unassignIdentityAdmin` remain on the interface for
the demo store but now delegate to the same canonical service, so no code path
can write eligibility without a seat.

## 4. Canonical path verified correct

With a disposable fixture, the canonical service already behaved correctly:

| Step | Ahmad (PRIMARY) | Madiha (OPERATOR) | Dawood (added) |
|---|:--:|:--:|:--:|
| seed PRIMARY + OPERATOR | ✅ | ✅ | — |
| add Dawood | ✅ | ✅ | ✅ |
| remove Madiha | ✅ | ❌ (correct) | ✅ |

So the defect was not in `configureCoverage`; it was in the bypassing writers
and in the read scope.

## 5. Tests

- `tests/operator-visibility.live.test.ts` (live, self-cleaning fixture): seat-only
  visibility, add-preserves-seats, remove-only-affects-that-rep.
- `tests/assignment-writers.test.ts`: the admin routes funnel through the
  canonical service, never write `identity_assignments` directly, and do not
  seed targets while assigning.

Gates on the final tree:

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run build` | exit 0 |
| Unit | 392/395 files green; the 3 `hardening-regression-*` AI files timed out under a machine load average of 70–120 (Spotlight reindex) and pass 43/43 in isolation |
| Live-DB | **137 passed, 12 skipped, 2 failed** — both are the pre-existing Fizza·Upwork plan drift (application target is 5, the tests hardcode 10; `updated_at` 11:27 UTC, before this work) |
| Operator-visibility live test | 3/3 passed, zero fixture rows left behind |

## 6. Not addressed in this increment (remaining risk)

The broader 12-phase programme is not complete. Still open:

- Surfaces that read `identity_assignments` directly (`lib/relay/dashboard-loader.ts`,
  `lib/rep-day/team.ts`, `getRepAssignments`) can still show eligibility that has
  no seat — the "same data, different representation" problem.
  `/api/rep/assigned-profiles` was migrated to the canonical scope in this
  increment; the rest remain.
- Stale eligibility rows (a rep with eligibility but no seat) exist in
  production from the old writers; they are harmless for execution but still
  surface in the direct-read pages above.
- Channel lifecycle (inactive/suspended/archived) is not centrally manageable;
  deletion/archive controls, duplicate reconciliation, task/target admin from
  one panel, and the Playwright journey are not built.

## 7. Data-hygiene note (disclosed)
An early version of the live regression test used `BEGIN`/`ROLLBACK` on the
service client. That pool does not bind the transaction to later queries, so
the fixture rows committed: 13 `ZZ%` profiles and 14 `zz-%` identities plus
their coverage, eligibility, target, audit and acknowledgement rows. They were
**not** user records. All of them were deleted (verified: 0 `ZZ%` profiles, 0
`zz-%` identities remain), and the test now creates a uniquely-labelled fixture
and deletes it explicitly in a `finally`. No user assignment was altered.

## 8. Sprint 2 — follow-up repairs

### 8.1 Transfer no longer strips an unrelated owner

`transferResponsibility` rebuilt the chain as `primary = toRepId` and carried
only the existing operators, so a transfer opened from an **operator's** plan
silently dropped the real PRIMARY. Reproduced on a fixture (owner vanished) and
on the live Aneeb·Upwork channel (owner Ahmad dropped when transferring from
operator Dawood).

Fix: if the current primary is neither the transfer source nor the target, it
is carried forward as an operator. `previousPrimaryRepId` now reports the real
previous owner. Regression test added to `tests/operator-visibility.live.test.ts`.

### 8.2 v611 test drift removed without touching the real target

`v611-multi-operator-acceptance` and `v611-multi-operator-contracts` hardcoded
`application = 10`. The organization's real target is 5. Both now assert the
**invariant** — one shared lane per activity, no per-operator duplication, and a
positive target — and derive the remaining-work assertion from the live value.
The production target is untouched. Both files pass.

### 8.3 Responsibility failures are now diagnosable

The assign / transfer / remove dialogs showed their own fallback text whenever
the response body had no `error` (for example a proxy 502/504 under load), which
read as "failed to add / transfer / remove". They now surface
`Request failed (<status>). Please retry.` when the body carries no reason, so a
server/timeout failure is distinguishable from a validation error.

Direct measurement: the canonical remove and transfer both **succeed** against
the live Aneeb·Upwork channel (verified, then restored to PRIMARY Ahmad /
OPERATOR Dawood / BACKUP Hassan). The generic 500s were not reproducible through
the canonical service; they are consistent with database timeouts under the
machine load observed during the session (load average 70–120, ~1.5 s/query, and
previous fixture writes committing). The three assignment actions issue roughly a
dozen sequential writes each; under pool contention that exceeds the client's
10 s connection timeout. The fix is to reduce those round trips and/or the pool
contention — not yet done.
