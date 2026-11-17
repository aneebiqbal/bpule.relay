# Relay — Acceptance Matrix

Target: ≥99% pass across critical checks, zero open P0. Evidence column states
how each row was checked; “not run” is never counted as pass.

| # | Critical flow | Expected | Status | Evidence |
|---:|---|---|:--:|---|
| 1 | Unauthenticated user opens `/admin` | redirect to login | PASS | server `redirect('/login')` in `requireProductAdmin` |
| 2 | Admin opens `/admin` | lands on People & Roles, rail active | PASS | browser: `activePrimary=["Admin","People & Roles"]` |
| 3 | Admin opens every nav admin page | 200 authenticated | PASS | `/admin`, `/admin/people`, `/admin/targets`, `/admin/revenue-intelligence`, `/admin/system` all 200 |
| 4 | Rep/manager opens `/admin/*` | redirected, no data | PASS (code) | `requireProductAdmin` → `/dashboard` |
| 5 | Assign People: open | current chain visible | PASS | browser: current setup panel |
| 6 | Assign People: search | filters operators | PASS | browser: “Showing 2 of 5 reps.” |
| 7 | Assign People: bulk + review | exact before/after diff | PASS | browser: added-operator list |
| 8 | Assign People: no-change | explicit no-write confirm | PASS | browser: “No changes…” |
| 9 | Assign People: save | canonical write + audit | PASS (code) | `configureCoverage()`; API validates + dedupes |
| 9a | Manager without the capability opens Profiles | no identity write action | PASS (code) | `canManageIdentities` gate in workspace + table |
| 9b | Coverage write with `MANAGE_REVENUE_IDENTITIES` | accepted | PASS (code) | route uses `can(ctx, …)` |
| 10 | Knowledge scope | shared vs account-specific | PASS (code) | per-profile `accountKnowledge` (`47f822d7`) |
| 10a | Profile/channel mentions | real LinkedIn/Upwork marks | PASS (browser) | Profiles 10, Command Center 50, detail 14 brand SVGs |
| 11 | Claims provenance | never machine evidence | PASS (code) | `authority='human_verified'`, `user_corrected=true` |
| 12 | API auth posture | no unauthenticated mutation | PASS (code) | `createScoutStore` throws without a session |
| 13 | TypeScript | clean | PASS | `tsc --noEmit` |
| 14 | Production build | standalone build | PASS | `npm run build` exit 0 |
| 15 | Unit suite | all pass | PASS | see release report |
| 16 | Live-DB suite | all pass | PASS | see release report |
| 17 | Role-based browser journey (rep/manager) | correct controls | PARTIAL | admin journey done; rep/manager journeys not run |
| 18 | Mobile/tablet layout | responsive | NOT RUN | no visual capture available |
| 19 | Screenshots | captured | BLOCKED | desktop window not visible; DOM/HTTP used |

**Open P0:** none known.
**Open P1:** `/team/eval` orphaned; cold-start latency.
