# Relay — Platform Completion Audit

Generated on the `feat/relay-completion-program` branch. Evidence is from the
actual repository and the running application; nothing below is inferred from
training data.

## 1. Scope and method

| Item | Count | Source |
|---|---:|---|
| App routes under `src/app/(app)` | 109 | `find src/app/\(app\) -name page.tsx` |
| API route handlers | 234 | `find src/app/api -name route.ts` |
| Nav domains | 9 | `src/lib/navigation/relay-shell-nav.ts` |
| Auth capabilities in use | 7 | `grep capabilities.has/can(ctx, …)` |

Method: static route/API inventory, orphan-link analysis (a route with zero
inbound references), dead-control scan, and API authorization posture scan.
Followed by targeted browser verification on the running app.

## 2. Route inventory (grouped)

### Operating surfaces
| Route | Purpose | Gate |
|---|---|---|
| `/dashboard` | Home | any member |
| `/leads`, `/leads/[id]`, `/leads/import`, `/leads/new` | Sales pipeline | rep+ |
| `/prospect`, `/accounts`, `/accounts/[company]` | Prospecting / accounts | rep+ (accounts admin) |
| `/chats` | Inbox | rep+ |
| `/tasks` (+ `?view=`, `?scope=team`) | Work | rep+ / manager+ for team scope |
| `/team` | Team command center | manager+ |
| `/team/people` | People workspace | manager+ |
| `/team/profiles`, `/team/profiles/[profileId]` | Person-first profile workspace + tabs | manager+ |
| `/team/performance` | Performance | manager+ |
| `/team/groups`, `/team/groups/[teamId]` | Structure | manager+ |
| `/team/eval` | Prompt-evaluation harness | manager+ (**orphan — see §6**) |
| `/content`, `/content/ideas`, `/content/growth`, `/content/[id]` | Content Studio | rep+ / admin for growth |
| `/reports/*` | Insights | rep+ |
| `/upwork`, `/upwork/[id]`, `/upwork/new` | Upwork | rep+ |
| `/profile-intelligence`, `/profile-intelligence/[id]` | Identity intelligence | manager+ |
| `/settings` | Settings | any member |

### Admin
`/admin` → `/admin/people`; `/admin/people`, `/admin/targets`,
`/admin/revenue-intelligence`, `/admin/system` (hub for health, QA, scoring QA,
dataset, training data, AI usage, providers).

### Compatibility redirects (intentional, keep for deep links)
`/home`, `/profiles`, `/manage-profiles`, `/reports/team`, `/team/tasks`,
`/admin/accountability`, `/admin/activity`, `/admin/growth`,
`/admin/command`, `/admin/command-center`, `/admin/revenue-identities`,
`/content-v2/growth`, `/relay/persona-daily`, `/studio/post-detail`.

## 3. Capability matrix

Organization role resolves in `getAuthContext()` (`src/lib/auth/organization.ts`):
`isOwner` → `isAdmin` (OWNER/ADMIN) → `isManager` (manages ≥1 team).

| Capability | Owner/Admin | Manager | Rep |
|---|:--:|:--:|:--:|
| `MANAGE_REVENUE_IDENTITIES` | ✓ | if granted | ✗ |
| `MANAGE_TEAM_TARGETS` | ✓ | if granted | ✗ |
| `VIEW_TEAM_ANALYTICS` | ✓ | if granted | ✗ |
| `VIEW_TEAM_WORK` | ✓ | if granted | ✗ |
| `MANAGE_ACCOUNTABILITY_POLICY` | ✓ | if granted | ✗ |
| `REVIEW_TEAM_ACCOUNTABILITY` | ✓ | if granted | ✗ |
| `APPROVE_REWARDS` | ✓ | if granted | ✗ |

`can(ctx, cap)` short-circuits to true for owner/admin. No route grants a
non-admin a capability it does not already hold; no hidden endpoint elevates a
rep.

## 4. P0 register

| ID | Issue | Status | Evidence |
|---|---|---|---|
| P0-1 | Admin unreachable: `/admin` → `/admin/command` → `/team`, Admin nav pointed at the redirect | **Fixed** (merged `2f813c37`, PR #46) | `/admin` now 200 → `/admin/people`; rail active |
| P0-2 | Assign People was a flat checkbox grid with no current-state review | **Fixed this branch** | `ManagePeopleDialog` now edit → review diff → confirm; browser-verified |
| P0-3 | Knowledge scope merged account data into the shared profile | **Fixed** (`47f822d7`) | per-profile retrieval in `operating-model.ts` |

## 5. P1 register

| ID | Issue | Status |
|---|---|---|
| P1-1 | `/team/eval` has no inbound link | Open — orphaned manager harness |
| P1-2 | Coverage API requires `isAdmin` while sibling assignment APIs accept `MANAGE_REVENUE_IDENTITIES` | Open — authorization inconsistency |
| P1-3 | First-load latency: `/admin` 20.4s, `/admin/people` 16.3s local cold | Open — cold compile + ~1s/query; production `/team` 2.72s |

## 6. Duplicate-feature analysis

Consolidation already completed in prior phases: Team → Profiles is the single
profile front door; `/profiles` and `/manage-profiles` redirect to it. Work is
one surface (`/tasks`); `/team/tasks` redirects. Growth is one surface
(`/content/growth`); `/admin/growth` redirects. Reports merged into Team →
Performance. No duplicate writers found: assignment/target/knowledge writes go
through canonical services (`configureCoverage`, `saveResponsibilityChain`,
`operating-model`).

## 7. Dead-control inventory

- No-op handlers (`onClick={() => {}}`): **0**.
- `href="#"`: **0**.
- “not implemented / coming soon”: 2 hits, both legitimate copy
  (`/activate` “Skip for now”, `/public/docs/usage` plan copy).
- Orphan routes with **no** inbound reference: 11 in `(app)`. Of these, 10 are
  intentional redirects; the only real orphan is `/team/eval` (P1-1).

## 8. API authorization posture

All 234 handlers either (a) call `createScoutStore()`, which throws
`No signed-in rep for this request` when unauthenticated
(`src/lib/store/index.ts:22-25`), or (b) use an explicit guard
(`requireProductAdmin`, `can(ctx, …)`, `isProductAdmin`). The 38 mutating
handlers that do not name a guard directly all resolve the session through
`createScoutStore`. No unauthenticated mutation path was found.

## 9. Dependency graph (canonical writers)

```
UI (dialogs/cards)
  → /api/team/profiles/[id]/coverage → configureCoverage()      (identity_assignments + audit)
  → /api/team/assignments            → saveResponsibilityChain()
  → /api/team/profiles/[id]/knowledge→ operating-model (per-profile scope)
  → /api/team/setup/{state,parse}    → proposal only; never applies writes
Database: profiles → revenue_identities → identity_assignments → targets → tasks → ai_traces
```

AI setup parsing produces a **proposed** configuration; writes require an
explicit authorized confirm. No AI path mutates assignments directly.
