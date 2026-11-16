# Relay — Platform Completion Release Report

Branch `feat/relay-completion-program` · not pushed · not deployed.
Companion docs: audit, ledger, acceptance matrix.

## 1. Routes audited

109 application routes and 234 API handlers inventoried (see audit §1–2).
Every route was classified as operating surface, admin, or intentional
compatibility redirect. No route was removed.

## 2. Issues found

**P0** — Admin unreachable (fixed earlier, merged); Assign People had no
review/confirm (fixed here); knowledge scope merged account data (fixed earlier,
merged).

**P1** — `/team/eval` orphaned; coverage API is `isAdmin`-only while sibling
assignment APIs accept `MANAGE_REVENUE_IDENTITIES`; cold-start latency on first
authenticated load.

**P2** — Admin deep pages rely on the System / Quality hub rather than the rail.

## 3. Resolved vs remaining

Resolved this branch: Assign People rebuild (edit → review → confirm, search,
bulk, before/after diff, preserved canonical writer).
Remaining: the three P1s, plus the broader 200-hour program (Sales/LinkedIn/
Upwork/Inbox AI, Content/Growth, reporting, Playwright journeys) which this
branch does not claim.

## 4. Architecture changes

One new pure module (`people-chain-diff.ts`) extracted so the UI and tests
share one change set. No backend, schema, or canonical service changed; the
dialog still calls the canonical `configureCoverage` writer.

## 5. Features implemented

- Assign People: current-state panel, searchable operators, bulk select/clear,
  exact diff review, explicit confirm, no-change short-circuit, saved state.

## 6. Design / navigation

The dialog now follows the app's dark premium language (bone panels, ink text,
avatar initials, status-danger for removals). Team rail contract (5 surfaces)
and Admin entry (People & Roles) preserved.

## 7. Cross-page persistence

The dialog's save path is unchanged and canonical: `POST
/api/team/profiles/[profileId]/coverage` → `configureCoverage()` →
`identity_assignments` + audit → `router.refresh()`. Because the writer is
shared, Team, Profiles and the operator Today read the same rows.

## 8. Role-specific browser evidence

- Admin: `/admin` + 4 admin subpages 200 authenticated; rail active; no console
  errors.
- Manager/rep journeys: **not run** in this increment.

## 9. AI / scoring evaluation

**Not run** on this branch. No AI behavior was changed.

## 10. Database / security findings

`createScoutStore()` throws without a session, so all 38 mutating handlers
that do not name a guard directly are still authenticated. No unauthenticated
mutation path found. No schema or migration change.

## 11. Tests

| Suite | Result |
|---|---|
| TypeScript | clean |
| ESLint (changed source) | 0 errors |
| Unit | **391 files / 5,745 passed** |
| Live-DB | **19 files / 136 passed, 12 skipped** |
| Build | exit 0, standalone present |

New: `tests/people-chain-diff.test.ts` (8 tests) covering the diff and the
dialog's write contract.

## 12. Performance

Local cold load: `/admin` 20.4s, `/admin/people` 16.3s (first compile + ~1s per
query on a remote host). Production `/team` measured 2.72s. No regression
introduced; the dialog adds no queries.

## 13. Screenshots

Not captured — the desktop browser window is not visible in this environment
and `browser.screenshot` refuses. DOM/HTTP evidence is reported instead; no
visual claim is made.

## 14. Limitations

- Rep/manager browser journeys and mobile/tablet checks not performed.
- Live-DB suite is slow (~12 min) against the shared host; it passed, not failed.
- The full 200-hour program is far from complete; this is one verified slice.

## 15. Decision

**GO** for merging this branch's Assign People rebuild and the previously
merged Admin fix. **NO-GO** for declaring the platform complete: P1s remain and
most of the program's scope is untouched. Do not deploy until the release
acceptance above is reviewed.
