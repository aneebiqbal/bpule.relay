# Relay — Team Command Center production-hardening sprint

Date: 2026-11-16 · Status: hardening in progress · Scope: release certification for the Team Command Center.

## 1. Root-cause report — the 12 failing tests

| Failure | Root cause | Classification | Fix |
|---|---|---|---|
| `v6-live-coverage-acceptance` (5) | `beforeEach`/`afterAll` ran ~10 sequential DB writes against a ~1s-latency host; vitest's default `hookTimeout` (5s) aborted them mid-fixture. The interrupted restore left the real profile without an active PRIMARY. | Test harness + fixture design | `hookTimeout`/`teardownTimeout` raised to 120s; the suite now creates a **disposable profile + identity** and deletes them, so it never mutates a production assignment. |
| `v63-enrichment-behavior` (2) | Two full discovery runs issue ~130 queries; at ~1s per query the 60s per-test cap was too tight. The run was progressing, not hung. | Environment latency | Per-test timeout raised to 180s; pool checkout now fails fast (see §2). |
| `qa-relay-observability` (3) | `persistTrace` deliberately no-ops without `NEXT_PUBLIC_SUPABASE_*`; the test never set them, so the mocked insert was never reached. | Stale test | Test sets the env guard; the mock now exercises the real persistence path. |
| `service-boundary-allowlist` (1) | `src/app/api/profiles/[id]/cv/route.ts` streams a CV through the service client and was not in the allowlist. | Missing documented entry | Added a justified allowlist entry (route enforces profile access; object storage is not RLS-scoped). |
| `profile-truth-parity` (1) | The aborted v6 fixture left profile `87c10cd5-…` (Muhammad Aneeb · LinkedIn) with three assignments and no active PRIMARY, so canonical derivation was AMBIGUOUS. | Leaked fixture | Restored the V5.0-reconciled primary (Aneeb) and eligibility; no production data deleted. |
| `v611-multi-operator-acceptance` (1) | A previous interrupted run left an extra `daily_accountability` row on the fixture identity, so the contribution count was one high. | Live-test leftover | The suite now clears the fixture identity's completion rows before snapshotting, so it starts from zero and leaves nothing behind. |
| `company-extraction` (1) | The OpenAI provider aborted a request under parallel load (`This operation was aborted`); the same test passes in isolation. | Environmental / provider flake | None — documented. The suite is not hermetic for live AI calls. |

## 2. Connection handling and workspace resolution

- The Postgres executor checks out a client per operation and releases it in `finally`; the RLS identity is `SET LOCAL` inside the same transaction. `tests/postgres-executor-perf.test.ts` pins this.
- **New:** a pool checkout can previously queue forever once every connection was busy. `checkout()` now races `pool.connect()` against `DATABASE_POOL_QUEUE_MS` (default 15s) and fails fast; a regression test proves it.
- Workspace resolution remains honest: `getCurrentUser` throws `AuthDatabaseError` on a rep/org lookup failure (500), and `/api/me/status` returns 409 only for a real absent mapping. `tests/auth-workspace-resolution.test.ts` pins it.
- **Latency finding:** every query is `BEGIN; set_config(..., true); <query>; COMMIT`, four round trips. On a remote host (~1s RTT) that is ~1s per query and dominates the live suites. It is correct for RLS and left as-is; documented as the reason live tests are slow.

## 3. One canonical assignment writer

`configureCoverage` is now the single writer for the responsibility chain. `src/lib/profiles/assignment.ts` keeps its three-action vocabulary (assign / operator / backup / transfer / remove) but each action reads the current chain, applies the delta and calls `saveResponsibilityChain`, which delegates to `configureCoverage` and writes the `accountability_audit_log` row. Both APIs (`/api/admin/responsibilities`, `/api/team/profiles/[id]/coverage`) and the new bulk `/api/team/assignments` funnel through it. Acknowledgements, eligibility, target seeding, audit history and idempotency are preserved; `configureCoverage` now accepts a null primary so an operator/backup can be added before an owner exists.

## 4. Manager capability consistency

`SupabaseStore` carried a legacy `reps.role === 'admin'` gate on 18 target/identity admin methods, while the routes authorize by capability. `createScoutStore` now passes `isAdmin || MANAGE_TEAM_TARGETS || MANAGE_REVENUE_IDENTITIES`, and those gates read that flag. Managers with the capability can now write targets/assignments; the routes still enforce the capability, so no permission is widened beyond it.

## 5. Fixture audit — `aaaaaaaa-…`

- `aaaaaaaa-0000-0000-0000-000000000001..04` are **seeded demo users** (`0001_scout_initial.sql`), not leaked rows. There are **no** `aaaaaaaa-…` profiles or revenue identities.
- The leaked state was coverage/eligibility churn on the seeded profile `87c10cd5-…` (1022 historical `profile_coverage` rows, 19 assignments, 15 acks, 28 plans across the demo reps). These are historical rows on seeded data; none were deleted.
- The one actionable leak — the missing active PRIMARY and Aneeb's eligibility — was restored to the approved V5.0 state (`20261110090000_responsibility_reconciliation_v50.sql`).

## 6. Gates

- `npx tsc --noEmit` clean.
- `npm run build` clean (exit 0), `.next/standalone/server.js` present — the GitHub Actions standalone deploy path is satisfied.
- Full suite: **408 files passed, 2 skipped, 5862 tests passed, 0 failed** (`npx vitest run`).
- New/updated tests: pool checkout timeout (`postgres-executor-perf`), command-center derivations, unified-writer contracts, disposable v6 live fixture, manager-capability gate.
- Browser: command center, assignment drawer dry-run and setup assistant verified against the running app (see §8).

## 7. Remaining risks

- Live suites are slow (~1s/query) and depend on the shared demo database; they are not hermetic.
- `responsibility_schedules` and `daily_plan_allocations` RLS policies still lack dedicated DB tests.
- The `aaaaaaaa-…` historical coverage rows are churn, not a correctness issue; a retention job is future work.
- Playwright journeys and screenshots: see §8.

## 8. Browser evidence and UX polish

Verified against the running app (`next dev`, port 3001) as the seeded admin (`hassan@scout.dev`):

- `/team` renders the Command Center with live data: `TEAM · 2026-11-16`, `Asia/Karachi · 6 people · 10 of 10 profiles covered`, the summary strip (Working 0, Unassigned 0, Needs acknowledgement 5, Replies waiting 4, Overdue tasks 7, Target today 124/435, Coverage at risk 0), the 12-item action queue, filters, and the target/coverage sections.
- **Assign people** drawer opens with 15 profile checkboxes. Selecting `Aneeb`, choosing primary `Ahmad` and clicking **Review access** (dry run) returns `EFFECTIVE ACCESS · Aneeb · Ready · Ahmad (primary)` — no write performed.
- **Setup assistant** opens with Describe/Form modes and the preview/apply flow.

Screenshots could not be captured: the desktop browser window is not visible in this environment, so `browser.screenshot` refuses ("Screenshot needs a visible tab"). The DOM evidence above is the substitute; run the Playwright journey (`e2e/team-command-center.spec.ts`) on a visible desktop for pixel evidence.

UX polish applied: compact summary strip (no KPI cards), one ranked action queue, dense matrix with role chips, target rows that name contributors, and a single drawer for assignment + a single drawer for setup. No new navigation items were added; `/admin/command` redirects to `/team`.

## 9. Production QA checklist

1. `pnpm build` passes; `pm2` health check on `/login` returns 200.
2. Sign in as admin → `/team`: summary, action queue, matrix, targets render; no console errors.
3. Assign people → dry-run review → apply; open the profile and confirm seats/eligibility/acknowledgements.
4. Shared profile: set an allocated split; confirm the command center shows `Allocated` and each operator sees their share.
5. Setup assistant: describe the 60/40 example; confirm the preview resolves names; apply.
6. Sign in as each operator → `/dashboard` shows every assigned profile/channel with role and target.
7. Reassign a primary; confirm history is preserved and execution moves only where intended.
8. Confirm no `aaaaaaaa-…` fixture churn: every profile with assignments has exactly one active PRIMARY.
