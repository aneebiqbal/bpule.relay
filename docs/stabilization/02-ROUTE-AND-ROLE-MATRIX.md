# Relay — Route and Role Matrix

**Generated:** 2026-11-23 · **HEAD:** `433489da`
Machine-readable companion: `route-role-manifest.json`.

## 1. Role model (source of truth)

| Definition | Values | Location |
|---|---|---|
| `OrganizationRole` | `OWNER \| ADMIN \| MANAGER \| MEMBER` | `src/lib/auth/organization.ts:9` |
| `TeamRole` | `MANAGER \| MEMBER` | `src/lib/auth/organization.ts:10` |
| `RepRole` | `rep \| sourcer \| admin \| manager` | `src/lib/domain/types.ts:4` |
| DB `organization_roles.role` | `OWNER, ADMIN, MANAGER, MEMBER` | `20260923000000_organization_v2.sql:95` |
| DB `capabilities.role` | same | `20260923000000_organization_v2.sql:126` |
| DB `reps.role` (legacy) | `rep, sourcer, admin` | `0001_scout_initial.sql:13` |

`reps.role` is a **bootstrap fallback only**; `organization_roles` is canonical
(`src/lib/auth/organization.ts:96-99`). Requested tokens `team_lead`,
`business_development`, `developer` do **not** exist as roles.

Capability grants (seeded): OWNER/ADMIN ≈ full; MANAGER = VIEW_TEAM_WORK,
ASSIGN_TEAM_WORK, VIEW_TEAM_ANALYTICS, MANAGE_TEAM_TARGETS; MEMBER =
VIEW_OWN_WORK, EXECUTE_OWN_WORK.

## 2. Route counts

| Group | Pages |
|---|---|
| `(app)` authed | 78 |
| `(public)` | 29 |
| `(landing)` | 1 |
| standalone | 4 |
| **Total pages** | **112** |
| API route handlers | **261** |

## 3. Authentication and authorization surfaces

| Surface | Gate |
|---|---|
| `(app)/*` | `getCurrentUser()` → `/login`; no profile → `/onboarding` (`(app)/layout.tsx:28-34`) |
| `src/proxy.ts` | unauthenticated users on `PROTECTED_PREFIXES` → `/login?next=` |
| Admin pages | `requireProductAdmin()` (owner/admin) |
| Admin APIs | `can(ctx, capability)` per route |
| Growth | `hasGrowthAccess` / `assertGrowthAccessAPI` (owner/admin) |
| Profile intelligence | `profileAccess(auth)` / `requireProfileManager()` |
| Cron | `requireCronSecret` (Bearer `$CRON_SECRET`) — **all 8 cron routes gated** |
| Webhooks | provider secret gates |

## 4. Admin-only surfaces (verified guarded)

| Surface | Route | Gate |
|---|---|---|
| Command center | `/admin/command-center` | owner/admin |
| Accountability | `/admin/accountability` | owner/admin |
| AI usage | `/admin/ai-usage` | owner/admin |
| Dataset | `/admin/dataset` | owner/admin/manager |
| Growth | `/content-v2/growth` | owner/admin |
| People | `/admin/people` | owner/admin |
| Revenue intelligence | `/admin/revenue-intelligence` | owner/admin |
| Scoring QA | `/admin/scoring-qa` | owner/admin/manager |
| Targets / Work Setup | `/admin/targets` | owner/admin |
| Training data | `/admin/training-data` | owner/admin/manager |
| Performance | `/api/admin/performance` | self or `VIEW_TEAM_ANALYTICS` |
| Rep performance | `/api/admin/rep-performance` | `VIEW_TEAM_ANALYTICS` |
| Routing opportunities | `/api/admin/routing-opportunities` | `VIEW_TEAM_ANALYTICS` |
| Profiles merge | `/api/profile-intelligence/profiles/merge` | owner/admin |

## 5. Route classification

- **Active:** 78 `(app)` pages + 261 API routes.
- **Legacy redirects:** `/admin`, `/admin/activity`, `/admin/revenue-identities`,
  `/conversations`, `/usage`, `/content/growth`, `/content/[id]`,
  `/content/[id]/today`, `/account`, `/accountability`, `/team/[repId]`.
- **Dead / unreferenced:** `/admin/growth`, `/api/growth/{decision,draft,memory,publications,today}`,
  `/api/content/intelligence/{discover,forge,interview,org-themes}`,
  `/api/profile-intelligence/legacy/classify`, `/api/trends/ingest`,
  `/api/relay/reconcile`. Retained intentionally as deep links or internal
  entry points; not deleted in this pass (deletion requires owner sign-off).
- **Deprecated tables still read:** none for targets; `daily_targets`,
  `day_closes`, `revenue_identity_contracts`, `profile_assignments` retained
  for history only.

## 6. Coverage gaps (honest)

A full route × role browser matrix was **not** executed in this session (no
staging environment/credentials). The static matrix above is complete; the
runtime authorization matrix for every role is carried from prior passes and
partially re-verified in `05-SECURITY-AND-RLS-AUDIT.md`.
