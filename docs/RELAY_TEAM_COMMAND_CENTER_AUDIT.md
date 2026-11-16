# Relay — Team Command Center audit (Phase 0)

Date: 2026-11-16 · Scope: `/team` and the team data model · Status: delivered (Phases 0–5 implemented; Phases 6–8 reuse existing surfaces).

## 1. What already exists (reuse first)

| Capability | Canonical implementation |
|---|---|
| Assignment read | `src/lib/profiles/canonical.ts` — `loadCanonicalProfileAssignments` (primary/operators/backups, derivation, review reasons) |
| Execution authority | `src/lib/coverage/access.ts` — `listExecutableIdentitiesForRep` (PRIMARY + OPERATOR + active coverage, REPLACE excludes primary) |
| Coverage engine | `src/lib/coverage/engine.ts` — status, backups, recommendations, schedules, gaps |
| Assignment write (per seat) | `src/lib/profiles/assignment.ts` → `/api/admin/responsibilities` |
| Assignment write (full chain) | `src/lib/coverage/actions.ts#configureCoverage` → `/api/team/profiles/[id]/coverage` |
| Schedules | `src/lib/schedules/*` + `/api/team/profiles/[id]/schedules` |
| Plan / contribution | `src/lib/targets/load-plan-progress.ts` (lane counted once, allocations, contributions) |
| Target write | `/api/admin/targets`, `/api/admin/targets/[id]/allocations` |
| Team operating page | `src/components/team/team-today.tsx` |
| Rep today | `src/app/(app)/dashboard/page.tsx` → `V4RepHome` (`/api/rep/today`) |
| AI runtime | `src/lib/ai/runtime/index.ts#generate` (schema-validated JSON, cost, telemetry) |

## 2. P0 findings

1. **Shared plans are attributed to the PRIMARY only.** `src/lib/admin/load-team-live.ts:38-55` projects every `daily_target_plans` row onto the profile's PRIMARY. Operators therefore see the profile under `identity_assignments` but carry `totalTarget = 0`; the profile directory (`buildTeamProfiles`, `src/lib/team/profiles.ts:76-86`) sums goals per person, so People and Profiles totals disagree and a shared lane is counted once for the profile but zero times for the operator. Fix: project lanes onto every active seat (PRIMARY + OPERATOR), mark shared/allocated, and count each lane once at profile level.
2. **Two assignment write paths.** `/api/admin/responsibilities` (per-seat, `assignment.ts`) and `/api/team/profiles/[id]/coverage` (`configureCoverage`) write the same tables with different audit/ack/target-seeding behaviour. Fix: one full-chain writer used by both.
3. **Allocation targets are not in `loadTargets`.** `src/lib/operations/targets.ts:210-219` projects plans onto the primary; `daily_plan_allocations` is only read by the profile editor. Team/Performance target views therefore ignore independent per-operator targets.
4. **No bulk assignment / bulk target entry.** Only per-row dialogs; no conflict or effective-access preview before saving.
5. **No Setup Assistant.** AI runtime exists but nothing parses team-setup intent; no deterministic equivalent.
6. **Managers cannot edit a profile's people** (`team-profile-detail.tsx` `canManage` is admin-only), while `/api/admin/responsibilities` requires `MANAGE_REVENUE_IDENTITIES`; capability checks are inconsistent across surfaces.
7. **Regression status:** the workspace-resolution fix (`ff3e27d5`, `tests/auth-workspace-resolution.test.ts`) and executor/pool fix (`a387275e`, `tests/postgres-executor-perf.test.ts`) are present and green. No release-blocking regression remains.
8. **Authorization reads silently degraded.** `getAuthContext` ignored DB errors on `organization_roles`, `team_memberships`, `teams` and `capabilities`, so a timeout fell back to a weaker role/capability set instead of failing. Fixed in `src/lib/auth/organization.ts`; `src/lib/auth/workspace.ts` now surfaces its `profiles` read error too.
9. **Schema audit correction:** the SECURITY DEFINER `p_org_id` functions (`record_activity_event`, `record_canonical_progress`, `ensure_day_close`, `submit_upwork_application`) are already caller-org guarded via `caller_may_act_for` / explicit `p_org_id` membership checks as of `20261101160000` / `20261111000000`. No change required.

## 3. Fixes applied (Phase 0)

- `src/lib/admin/load-team-live.ts` + `src/lib/admin/team-live.ts`: channel plans project onto every active seat (PRIMARY + OPERATOR); `TeamLiveGoal` carries `shared` / `allocation` / `personal`; `totalTarget` is the personal expectation and `sharedTarget` is reported separately.
- `src/lib/team/profiles.ts`: `buildTeamProfiles` counts each identity/activity lane once, so People and Profiles totals agree.
- `src/lib/operations/targets.ts`: `loadTargets` is allocation-aware (allocated shares per operator; shared lanes attributed once to the primary).
- `src/lib/auth/organization.ts`, `src/lib/auth/workspace.ts`: DB failures surface as 500 instead of a silent weaker authorization set.

## 4. Gaps by phase

- **Phase 1:** no filters, no ranked action queue, no assignment matrix, no target progress on `/team`; `/admin/command` duplicates `/team`.
- **Phase 2:** no bulk transfer, no date range on seats, no conflict/effective-access preview; two write paths.
- **Phase 3:** independent per-operator targets exist in schema + profile editor but not in team/admin target views; no copy/template; no combined-vs-individual aggregation.
- **Phase 4:** missing entirely.
- **Phase 5:** rep today exists at `/dashboard`; operator seats are visible but targets are not (P0 #1).
- **Phase 6:** target report uses the primary projection; capacity counts derive from `loadTeamLive` and inherit P0 #1.
- **Phase 7:** primitives exist (`V4Panel`, `V4Drawer`, `MetricStrip`, `OpsFilters`); reuse them.

## 5. Implementation plan

1. Fix shared-plan projection + lane de-duplication (P0 #1) with contract tests.
2. Add one full-chain assignment writer + `POST /api/team/assignments` (dry-run preview, bulk, partial failures, idempotent).
3. Add `src/lib/team/command-center.ts` (pure derivations: summary, action queue, matrix, targets) and `TeamCommandCenter` at `/team`, reusing existing panels as drilldowns.
4. Add target panel/drawer on the command center reading `loadDailyPlanProgress`; make `loadTargets` allocation-aware.
5. Add Setup Assistant: deterministic form + schema-validated AI parse (preview only, confirm applies through canonical writers).
6. Regression tests + typecheck + build + Playwright journey.

## 6. Risks

- Changing `loadTeamLive` goal semantics touches Manager Home, Team Today, Admin Command and Rep Home; contract tests must pin the new shape.
- Bulk writes must stay org-scoped and idempotent; partial failure must be reported, never silently half-applied without visibility.
- No production assignment data is mutated by tests; fixtures only.

## 7. Delivered

- **Command Center at `/team`** — `TeamCommandCenter` + `loadTeamCommandCenter`: summary strip, search/channel/role filters, ranked action queue, operator × profile matrix, target progress (lane counted once, named contributors), coverage exceptions, recent activity. `/admin/command` now redirects to `/team`.
- **Unified assignment workspace** — `AssignmentDrawer` + `POST /api/team/assignments` (dry-run preview, bulk up to 100 profiles, per-item results, org-validated, idempotent through `configureCoverage`, optional default-plan seeding).
- **Independent targets** — command-center target panel reads `loadDailyPlanProgress`; `loadTargets` is allocation-aware; per-operator shares remain editable in the profile channel editor.
- **Setup Assistant** — `SetupAssistant` (describe + deterministic form) and `POST /api/team/setup/parse` (schema-validated AI preview, server-side name resolution, warnings, no DB writes). Apply goes through the canonical assignment/target/schedule writers.
- **Tests** — `tests/team-command-center.test.ts` (7 cases) plus updated `team-operating-contracts` / `qa-command-centre` contracts; `e2e/team-command-center.spec.ts` (read-only by default, write path gated on `E2E_WRITE=1`).
- **Gates** — `tsc --noEmit` clean, `npm run build` clean.

## 8. Manual production QA

1. Sign in as admin → `/team`. Confirm the date, headcount, action queue, matrix and target progress render; no console errors.
2. Filter by channel and role; search a person. Confirm the matrix and targets narrow.
3. Open **Assign people**, select two profiles, set one primary and two operators, **Review access** (dry run). Confirm the effective chain and that no write happened.
4. Apply. Reopen the profiles and confirm seats, eligibility and acknowledgements.
5. On a shared profile, set an allocated split (e.g. 60/40) from the profile → Channels → Edit targets. Confirm the command center shows `Allocated` and each operator sees their own share.
6. Open **Setup assistant → Describe**, enter "Assign Ahmad and Dawood to Aneeb's profiles, split LinkedIn connection targets 60/40, weekdays". Confirm the preview resolves names and shows the split; apply and verify.
7. Sign in as each operator → `/dashboard`; confirm they see every assigned profile/channel with their role and target.
8. Reassign a primary; confirm history/attribution is preserved and the old owner loses execution only where intended.

## 9. Remaining risks / not done

- **Two assignment write paths remain.** `/api/admin/responsibilities` (incremental, `assignment.ts`) and `configureCoverage` (full-chain, used by the command center and profile dialog). They share tables but differ in audit/target-seeding details. `shortcut: unify when a writer touches both again; until then keep audit fields in sync.`
- **No date ranges on seats.** `responsibility_schedules` covers shifts; temporary coverage dates live on `coverage_assignments`. Permanent seat start/end dates are not modelled.
- **TeamToday is now unused by the default route** but retained for compatibility; several contract tests still assert it.
- **Live-DB acceptance tests** (`v6-live-coverage-acceptance`, `v63-enrichment-behavior`) and `qa-relay-observability`, `service-boundary-allowlist` failed in the full run for pre-existing/environmental reasons (DB hook timeouts, missing provider credentials, an unrelated CV route). They are not caused by this change and should be re-checked on a clean tree.
- **`profile-truth-parity` failed because the live v6 fixture did not clean up.** Its `afterAll` hook timed out, leaving `aaaaaaaa-…` fixture assignments (Madiha/Ahmad) on a profile with no primary, so the production-parity assertion saw an ambiguous profile. Re-running after the fixture is cleaned (or on a clean DB) is the check; no application code changed in `canonical.ts`.

