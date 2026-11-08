# Relay — Public Release Readiness (V4)

> Snapshot: **2026-11-09** · source SHA `3a3b7b4` (clean source tree).
> Companion: `docs/RELAY_PRODUCT_MAP.md` (canonical routes, roles, authorities).
>
> This document is the release gate. It records what was measured, what is
> blocked, and what is known debt. The source is frozen and green; a parallel
> workstream is still adding e2e coverage, so the full browser gate has not run
> (see §2, §11).

---

## 1. Verdict

```
PRODUCT:                    READY (with P1 debt)
PUBLIC PRODUCTION RELEASE:  BLOCKED ON DATABASE SECURITY
SOURCE SHA:                 3a3b7b4 — clean, typecheck/lint/tests/build green
BROWSER GATE:               NOT RUN — parallel workstream still adding e2e
```

The product structure is coherent: one sidebar, one Inbox contract, one task
system, one profile/coverage model, and a role matrix enforced from
`organization_roles`. The blockers are environmental and data-authority, not
structural.

---

## 2. Blockers

### P0 — Database security (release blocker)

**Application traffic connects as the Neon branch owner, which bypasses RLS.**

Evidence:

| Fact | Source |
|---|---|
| `DATABASE_URL` user is `neondb_owner` | `.env.local` (parsed; host `…-pooler.c-2.ap-southeast-1.aws.neon.tech`) |
| No `SERVICE_DATABASE_URL` override | `.env.local` |
| The Neon pooler connects as the branch owner | `src/lib/db/neon.ts:150-184` |
| Owner role bypasses RLS unless `FORCE ROW LEVEL SECURITY` | Postgres semantics; the adapter's comment at `neon.ts:203-205` states "the pooler connects as the branch owner, which bypasses RLS" |
| The app sets `app.current_user_id` | `src/lib/db/neon.ts:214` — necessary but insufficient while the role is the owner |
| `relay_app` role exists and is intended for app traffic | `supabase/migrations/20261106150000_revoke_anon_default_privileges.sql:34`, `20261106170000_public_policy_roles.sql:8` |
| `createServiceSupabase()` deliberately bypasses RLS | `src/lib/supabase/service.ts:1-20` |

Required operator action (do **not** weaken the gate):

1. Create/confirm the `relay_app` role as a member of `authenticated`, with
   `BYPASSRLS` **not** set, and grants on the application tables.
2. Point application traffic at `relay_app` (`DATABASE_URL=<relay_app pooler URL>`).
3. Point scheduled jobs at the owner via `SERVICE_DATABASE_URL=<owner pooler URL>`.
4. Re-run the RLS harness (32/32) against production credentials.
5. Rotate any credential that was used while the owner URL was live.

Until then, every application read is a full-tenant read and RLS is decorative.

### P0 — Frozen-SHA gate cannot pass (yet)

| Fact | Evidence |
|---|---|
| The source tree is now committed and clean | `git diff HEAD -- src tests` is empty at `3a3b7b4` |
| A parallel workstream is still adding coverage | `e2e/inbox-v4-rebuild.spec.ts` appeared untracked during the audit; two `next-server` processes |
| `npx tsc --noEmit` failed early in the audit, then passed after the parallel writer fixed it | 20 → 0 errors between the first and second run |
| The audit did not modify source files | only `docs/` was written |

Certify only after the parallel workstream stops and the browser gate runs on
the resulting SHA. The source at `3a3b7b4` is green (see §11).

---

## 3. Product gates

### P1 — incorrect product truth / major workflow failure

| # | Issue | Status | Evidence | Fix |
|---|---|---|---|---|
| P1-1 | **"Replies waiting" had five implementations.** `3a3b7b4` fixed `loadTeamDay`, Manager Home and Admin health. Three remain: the sidebar badge, `getDailyWorkspace`, and `loadRepDayDetail`. | **partial** | `sidebar-counts.ts:52-88`; `auth/workspace.ts:227-247`; `rep-day/team.ts:503-509`; `team/manager-home-summary.ts:167` (rare live-only fallback) | Make every surface call `getInboxCountsForRep` |
| P1-2 | **Sidebar Work badge uses a different predicate and scope than `/tasks`.** Badge = `assigned_tasks` where `status in (OPEN,IN_PROGRESS,WAITING)` and `due_at <= EOD`; `/tasks` "Active" = `classifyUnifiedTaskTab ∈ {today, overdue}` over assigned + derived tasks. | **open** | `sidebar-counts.ts:95-118` vs `tasks/rank-unified-tasks.ts:59-78`, `task-workspace-view.tsx:105-110` | One canonical `loadRepActiveTaskCount`; badge and page both read it |
| P1-3 | **`/tasks` scopes derived actions to the active workspace; `/dashboard` does not.** The same task can appear on one surface and not the other. | **open** | `tasks/page.tsx:130` (`activeWorkspace`) vs `dashboard/page.tsx:159` (`null`) | Pick one scope rule; if Work is profile-scoped, Rep Home must say so |
| P1-4 | **`loadRepDayDetail.followUpsDue` is hardcoded `0`.** | **open** | `rep-day/team.ts:622` | Compute from `deriveConversationRow` or remove the field |
| P1-5 | **`/reports/team` duplicates `/team/performance`** (same loader, same component, strict subset). | **open** | `reports/team/page.tsx` vs `team/performance/page.tsx` | Redirect `/reports/team` → `/team/performance` |

### P2 — important friction

| # | Issue | Evidence |
|---|---|---|
| P2-1 | `/inbound` is a second Inbox with its own loader and no nav entry | `inbound/page.tsx`, `lib/conversation/archive.ts:91` |
| P2-2 | Cmd-K "Create Post" → `/studio/drafts/new` with no `personaId`; always redirects to `/content` | `command-palette.tsx:320`, `studio/drafts/new/page.tsx:17` |
| P2-3 | Eight dead components (~2,900 lines) | see product map §5.2 |
| P2-4 | Dead API families still deployed | see product map §5.3 |
| P2-5 | `/admin/qa` is a client page gated only by its layout; a non-admin sees a shell that 403s | `admin/qa/layout.tsx` |
| P2-6 | `getDailyWorkspace` returns a non-canonical `repliesWaiting`; `/api/me/workspace` exposes it | `auth/workspace.ts:227-247` |
| P2-7 | Cmd-K "View referred leads" → `/leads?filter=referred`; `parseLeadsQuery` has no `filter` param, so it renders the default All view | `command-palette.tsx:184`, `pipeline-utils.ts:469-497` |
| P2-8 | Rep Home loads `referredLeads` (`store.getReferredLeads`) but no component renders it | `dashboard/page.tsx:186,446`; `rep-workspace-data.ts:79` |
| P2-9 | `/api/me/workspace` has no client consumer | route exists; zero fetches in `src` |
| P2-10 | **Global Create never passes `isManager`**, so a manager gets the Rep list and never sees "Assign Task" | `v4-app-shell.tsx:335` vs `global-create-items.ts:34-37` |

### P3 — cosmetic

- Sidebar collapse state is `localStorage`-only (no cross-device).
- `/activate` is not reachable from the sidebar after onboarding.
- `docs/RELAY_NAVIGATION_V3.md` names V4 surfaces.
- Empty-state copy varies between `V3EmptyState`, `EmptyState` and `InlineEmpty`.

---

## 4. Role workflows (certified by reading, not by browser)

### Rep
Login → `/dashboard` (Today) → profile switch → Do this next → lead/job →
`/chats?view=waiting_me` → `/tasks` → `/content` → `/reports/sales`.
Never sees Team/Admin. Verified: Team is `managerUp`; Admin is `adminUp`;
Rep Home renders `V4RepHome`.

### Manager
Login → `/dashboard` (Manager Home) → `/team` → People / Profiles / Coverage /
Workload / Activity / Performance / Targets → `/tasks?scope=team` → `/chats` →
`/admin/command` (Daily Operations). Verified: `requireTeamContext` gates the
Team domain; `resolvePrimaryActiveId` maps `/admin/command` to Team for managers.

### Admin
Login → `/dashboard` (Admin Home) → `/admin/command` → `/admin/people` /
`/admin/targets` / `/admin/scoring-qa` / `/admin/qa` / `/admin/dataset` /
`/admin/training-data` / `/admin/ai-usage` / `/admin/revenue-intelligence` →
`/team/profiles` / `/team/coverage` → `/content/growth`.
Verified: `requireProductAdmin` on every Admin page; `adminUp` in nav.

---

## 5. Canonical routes

See `docs/RELAY_PRODUCT_MAP.md` §2 for the full matrix. Summary:

- **9 primary domains**, 1 sidebar, 1 secondary rail per domain.
- **77 authenticated pages** in `(app)`: ~55 canonical, ~21 redirect/legacy,
  plus the role-branched `/dashboard`.
- **2 QA fixtures** (`/qa-v4`, `/inbox-fixture`).
- **Cmd-K** mirrors the canonical IA and is role-filtered via
  `lib/operations/search-shared.ts`.
- **Global Create** is role-filtered via
  `lib/navigation/global-create-items.ts`.

---

## 6. Security status

| Control | Status |
|---|---|
| Auth provider | Neon Auth (Better Auth) or Supabase, behind one contract |
| Role authority | `organization_roles` (canonical); `reps.role` bootstrap only |
| Page gating | `(app)/layout.tsx` + per-page `requireProductAdmin` / `requireTeamContext` |
| API gating | `createScoutStore()` 401 + `can()` capability checks; admin gaps fixed |
| Proxy | `src/proxy.ts` protects every authenticated prefix |
| RLS | **BYPASSED** — app connects as `neondb_owner` (P0) |
| Anon grants | Revoked (`20261106150000`) |
| Policy roles | Narrowed to `authenticated`/`service_role` (`20261106170000`) |
| SECURITY DEFINER | Search paths pinned (`20261106160000`) |

---

## 7. Performance status

Reads are bounded; caps are documented. No unbounded full-set read was found in
the hot paths.

| Surface | Bound |
|---|---|
| Inbox queue | 1,500 leads (`chat-queue.ts:185`) |
| Conversation rows | 1,500 leads, sliced 300/500 (`conversations.ts:238`) |
| Team Live open leads | 800 (`admin/load-team-live.ts`) |
| Admin Home | ~20 parallel reads, worst cap 5,000 rows (`load-admin-command-center.ts:144-222`) |
| Coverage | 2,000-5,000 rows per relation (`coverage/load.ts:81-91`) |
| Targets | 10,000 events, grouped on Neon (`targets.ts:167`) |
| Performance | 5,000 events (`operations/performance.ts:320`) |
| Timeline | caller-supplied limit (250-500) |

Known cost: Rep Home composes ~15 reads (dashboard batch, queue, targets,
coverage, tasks, activity, trend). It degrades per-section, so one slow read
does not blank the page.

---

## 8. Accessibility status

Not re-measured in this audit. The last a11y artifact directories
(`artifacts/a11y*`) are empty, so there is no current evidence. A browser run
with `scripts/qa/live-responsive-a11y.mjs` against a frozen SHA is required
before release. Manual inspection found:

- One active primary and one active secondary nav item, with `aria-current`.
- Dialogs use `role="dialog"` + `aria-modal`; the Cmd-K palette restores focus.
- Sidebar collapse exposes `aria-expanded` / `aria-label`.
- Tables use `<caption>` / `scope`; sticky first columns.

---

## 9. Responsive status

Not re-measured. The shell implements a mobile bottom bar (5 slots), a More
sheet, and a nav drawer; pages use `md:`/`lg:` breakpoints and horizontally
scrolling tables. A 375/768/1024/1280/1440 run is required before release.

---

## 10. Release SHA

```
SOURCE SHA:  3a3b7b4a280ade1a46ca43b341c9076203077417
SOURCE TREE: NOT clean — src/lib/rep-day/team.ts modified again during audit
STATUS:      a parallel workstream is actively fixing the same P1 surfaces
```

Certify only after the parallel workstream stops and the full gate re-runs on
the resulting SHA. The source at `3a3b7b4` was green when measured (see §11).

---

## 11. Gate results (this snapshot)

| Gate | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | **PASS** | 0 errors at the second run (first run failed on WIP) |
| `npm run lint` | **PASS** | 0 errors, 780 warnings |
| Contract tests (`qa:contracts`) | **PASS** | 4 files / 80 tests |
| Inbox parity tests | **PASS** | 4 files / 63 tests |
| Full unit suite | **PASS** | **361 files / 5,354 tests / 0 failed** (150s) |
| `next build` | **PASS** | compiled in 39s, TypeScript clean, 104 static pages |
| Browser / responsive / a11y | **NOT RUN** | needs a running app on a frozen SHA |
| Role crawl | **NOT RUN** | needs a running app on a frozen SHA |

---

## 12. Consolidated execution plan (ready for a frozen tree)

Ordered by value/risk. Each step is isolated and independently verifiable.

1. **Fix the data authorities** (P1-1, P1-2, P1-4): one `repliesWaiting`
   authority, one active-task authority, one follow-up authority.
2. **Unify the Work scope** (P1-3).
3. **Redirect `/reports/team` → `/team/performance`** (P1-5).
4. **Delete the eight dead components** (P2-3).
5. **Delete or redirect the dead API families** (P2-4).
6. **Fix Cmd-K "Create Post"** (P2-2): link to `/content` or pass a persona.
7. **Decide `/inbound`** (P2-1): merge into `/chats` or add a nav entry.
8. **Rotate the database role** (P0) — operator action, outside the repo.
9. **Freeze the SHA and run the full gate.**
