# Relay — Assignment Reconciliation

**Branch:** `feat/relay-job-intelligence-v2`
**Canonical writer:** `src/lib/profiles/assignment.ts`
**Canonical read:** `src/lib/coverage/access.ts:listExecutableIdentitiesForRep`
**Scanner:** `src/lib/profiles/reconcile.ts`
**Status:** implemented. No production assignment was modified by this work.

---

## 1. One authority

```
EXECUTABLE(rep, identity, now) =
    PRIMARY ownership of the identity's profile
    UNLESS that profile has an active REPLACE coverage
    OR   the rep is an active OPERATOR on that profile
    OR   the rep is an active covering operator (SHARED or REPLACE)
```

Backups never execute. Archived identities never execute. Expired or revoked
coverage never executes.

Every write goes through `saveResponsibilityChain` /
`assignPrimaryResponsibility` / `addOperatorResponsibility` /
`removeOperatorResponsibility` / `transferResponsibility`. These reconcile the
whole chain: seat (`profile_coverage`), eligibility (`identity_assignments`),
acknowledgements and audit. No route writes `identity_assignments` directly.

## 2. Read surfaces use the canonical scope

| Surface | Reader |
|---|---|
| Rep Today / Rep Home | `getDailyWorkspace` → `listMyWorkableIdentities` → `listExecutableIdentitiesForRep` |
| Team day | `listExecutableIdentitiesForOrg` |
| Manager / Admin home | `loadTeamLive` (targets projected from `profile_coverage` seats) |
| Inbox / Leads | `listExecutableIdentityScope` |
| Admin target editor | `/api/admin/targets` filters by executable seats |

## 3. Drift classes detected (read-only)

`scanAssignmentDrift` classifies, never repairs:

| Kind | Meaning |
|---|---|
| `eligibility_without_seat` | eligibility row with no active seat |
| `seat_without_eligibility` | active seat with no eligibility row |
| `allocation_without_seat` | allocation units whose rep holds no seat (**new**) |
| `multiple_active_primaries` | more than one active PRIMARY on a profile |
| `active_plan_without_primary` | an active plan with no active PRIMARY |
| `seat_on_archived_identity` | seat whose channel is archived |
| `seat_on_archived_profile` | seat on an archived profile |
| `orphaned_eligibility` | eligibility pointing at a missing channel |
| `orphaned_seat` | seat pointing at a missing profile |

## 4. Dry-run command

```bash
# read-only scan (admin capability required)
curl -s -b "$COOKIES" https://<host>/api/admin/reconciliation \
  | jq '.report.counts, .report.findings'

# apply only explicitly approved findings (re-scans first; audited)
curl -s -b "$COOKIES" -X POST https://<host>/api/admin/reconciliation \
  -H 'Content-Type: application/json' \
  -d '{"approve":true,"findings":[{"kind":"eligibility_without_seat","repId":"…","identityId":"…"}]}'
```

Only two classes are auto-repairable (`eligibility_without_seat`,
`seat_without_eligibility`). Everything else is reported for a human.
Production assignment repairs require this approval flow — nothing is rewritten
silently.

## 5. Real drift found (2026-11-23)

- `allocation_without_seat`: Madiha holds 4 allocated units on the Aneeb Upwork
  lane with no active seat. Reported, not repaired.
- Historical `profile_coverage` rows (1,302 total / 18 active) remain by design
  ("deactivate, don't delete"); they render nowhere.

## 6. Unchanged-save guarantee

`saveResponsibilityChain` is a no-op when nothing changed: it does not reset
acknowledgements, duplicate coverage, or recreate targets. Regression coverage
lives in `tests/assignment-writers.test.ts` and
`tests/operator-visibility.live.test.ts`.

## 7. Live lifecycle verification (2026-11-23)

`vitest.live.config.mts` → `tests/operator-visibility.live.test.ts`, 8/8 passed
against the real organization with self-cleaning fixtures:

- a seated operator sees the channel even without an eligibility row;
- adding an operator preserves every existing seat;
- a transfer opened from an operator never strips the real owner;
- a suspended channel is not executable and can be restored;
- the scanner proposes a repair for an active plan with no primary;
- drift is found and repaired without touching history;
- removing one operator does not affect the other;
- **saving an unchanged chain duplicates nothing** (seats and acknowledgements
  byte-identical before and after).
