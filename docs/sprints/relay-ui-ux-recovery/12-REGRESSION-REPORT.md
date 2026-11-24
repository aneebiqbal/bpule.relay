# Regression report

## Deterministic gates (final state)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **clean** |
| Unit + integration (no env, CI-equivalent) | `npx vitest run` with `.env.local` removed | **exit 0 — 424 files passed / 1 skipped; 5947 passed / 19 skipped** |
| Production build | `npm run build` | **pass** |
| ESLint | `npx eslint .` | **0 errors**, 777 warnings (identical count to baseline) |
| Real PostgreSQL transaction harness | `npm run qa:txn` | unchanged from prior pass (writer untouched) |
| Browser fixture interactions | `node scripts/qa/inbox-interactions.mjs` | **18/18** |
| Browser queue states × roles | `node scripts/qa/inbox-states.mjs` | **all axe-clean** |
| Route crawl | `scripts/qa/sprint-route-crawl.mjs` | **112 routes: 81 redirect, 31 render, 0 hard failures, 0 crashes** |
| Internal href resolution | `scripts/qa/sprint-link-audit.mjs` | 2 refs unresolved, both `/icon.svg` |

Note on the live-DB suites (`accountability-service.test.ts`,
`job-retention-contracts.test.ts`): they are guarded by `describe.skipIf(!liveDb)` and listed in
`LIVE_TEST_FILES`. Run against the configured Aiven URL they produced connection timeouts and a
data-dependent assertion (`expected 419 to be 0`), so they are deliberately **not** used as
evidence in this report. They must run against a disposable database, not production.

## Targeted regression checks for the fixes

| Fix | Check |
|---|---|
| SR-01/SR-02 authority | `tests/relay-ui-recovery.test.ts` — 6 tests: unscoped/narrow/team scope reads; covered identity; `markContacted`; `recordProspectReply` |
| SR-03 conflict copy | `workSetupConflictLines` unit cases (changed primary, removed operator, no-change) |
| SR-13 task attribution | `tests/task-execution-contracts.test.ts`, `tests/task-ux-contracts.test.ts` |
| SR-14 counts/stage | `tests/qa-relay-cross-surface-parity.test.ts`, `tests/sidebar-counts.test.ts` |
| SR-15 URL state | `tests/relay-shell-nav.test.ts` |
| SR-16 failure isolation | `tests/inbox-v4-rebuild-contracts.test.ts` (updated for the new call signature) |
| Store scope gate | `tests/conversation-system.test.ts`, `tests/targets-assignment.test.ts`, `tests/revenue-identity-security.test.ts` |

## Protected contracts — explicit confirmation

- **Canonical accounting / assignments:** no writer logic changed; `getOrganizationDailySummary`
  and the ledger are untouched.
- **Atomic Work Setup:** transaction boundaries, fail-closed adapter behaviour and revision
  computation untouched. The client now *uses* the existing CAS instead of bypassing it.
- **RLS / organization boundary:** every new query is `.eq('organization_id', ...)`; the store's
  unscoped branch is unchanged so no legacy caller gained access.
- **Auth:** `requireProductAdmin` now used on `/admin/people`; no capability was widened.
- **AI routing / budgets:** untouched.
- **No duplicate management UI introduced.**

## Known residual risk

- Authorization now depends on `resolveConversationAuthz()` being called by each route. A future
  conversation route that forgets it will fall back to the stricter owner-only gate (fail closed).
- `LeadReadScope.identityIds` widens only callers that explicitly pass it; the mock store mirrors
  the real gate so tests cannot silently diverge.
