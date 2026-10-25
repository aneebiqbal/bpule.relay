# Relay / Scout — Complete Route & Role Inventory

> Generated from source. Repo root: `/Users/mac/Desktop/products/scout`.
> Scope: `src/app/**` (pages, API routes, layouts, proxy), `src/components/app-rail.tsx`,
> `src/components/command-palette.tsx`, `src/lib/auth/*`, `src/lib/supabase/server.ts`,
> `src/proxy.ts`, `next.config.ts`.

## 0. Executive summary

| Metric | Count |
|---|---|
| Page routes (`page.tsx` / route-handler pages) | **92** |
| API route handlers (`route.ts`) | **202** |
| Page route groups | `(app)` 59 · `(public)` 29 · `(landing)` 1 · `onboarding` 1 · `studio` 2 |
| Non-page route handlers | `auth/callback` (1), `og` (1) |
| `RepRole` values | `rep` \| `sourcer` \| `admin` \| `manager` |
| Org roles (`organization_roles`) | `OWNER` \| `ADMIN` \| `MANAGER` \| `MEMBER` |
| Admin-only pages | **12** (10 real + 2 redirect stubs) |
| Unreachable / dead page routes | **10** (see §6) |
| Dead / superseded API routes | **~20** (see §6) |
| `next.config.ts` redirects/rewrites | **0** |

---

## 1. Role model (source of truth)

### 1.1 `RepRole` — `src/lib/domain/types.ts:1`

```ts
export type RepRole = 'rep' | 'sourcer' | 'admin' | 'manager'
```

`reps.role` is **only a bootstrap fallback**. The canonical source is the
`organization_roles` table (`src/lib/auth/organization.ts`). A stale `reps.role`
must never escalate a demoted user.

### 1.2 `OrganizationRole` — `src/lib/auth/organization.ts`

```ts
export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER'
export type TeamRole = 'MANAGER' | 'MEMBER'
```

`AuthContext` booleans:

| Flag | Meaning |
|---|---|
| `isOwner` | `organizationRole === 'OWNER'` |
| `isAdmin` | `OWNER` **or** `ADMIN` |
| `isManager` | `OWNER`/`ADMIN` **or** holds a `MANAGER` team membership |
| `isMember` | always `true` once authenticated |

### 1.3 Capability helpers

| Helper | Location | Rule |
|---|---|---|
| `can(ctx, cap)` | `organization.ts` | `isOwner \|\| isAdmin` bypass; else `capabilities.has(cap)` |
| `canViewTeamWork` | `organization.ts` | owner/admin, or member of the team |
| `canManageTeam` | `organization.ts` | owner/admin, or manager of the team |
| `canAssignWork` | `organization.ts` | owner/admin, or any managed team |
| `getVisibleRepIds` | `organization.ts` | owner/admin see all; others see only self |
| `isProductAdmin(user, ctx)` | `admin-page.ts` | `ctx?.isOwner \|\| ctx?.isAdmin` (never `reps.role`) |
| `requireProductAdmin()` | `admin-page.ts` | redirect `/login` if anon, `/dashboard` if not admin |
| `hasGrowthAccess` / `requireGrowthAccess` / `assertGrowthAccessAPI` | `growth.ts` | owner/admin only |
| `profileAccess(auth)` | `lib/profile-intelligence/access.ts` | `canManage` = owner/admin/manager/`MANAGE_REVENUE_IDENTITIES`; `canMerge` = owner/admin |
| `requireProfileManager()` | `lib/profile-intelligence/enrichment-http.ts` | 401 anon / 403 if not `canManage` |
| `requireCronSecret(request)` | `lib/supabase/service.ts` | shared-secret cron gate |

---

## 2. Page routes — complete inventory

### 2.1 `(app)` route group — 59 pages

All `(app)` pages sit under `src/app/(app)/layout.tsx`, which **requires auth**:
`getCurrentUser()` → redirect `/login`; missing voice profile → redirect `/onboarding`.

| # | Path | File | Linked from | Role gating (server) |
|---|---|---|---|---|
| 1 | `/account` | `(app)/account/page.tsx` | 2 refs | any authed; redirects `/settings` without `companyKey` |
| 2 | `/accountability` | `(app)/accountability/page.tsx` | 2 refs | rep scorecard; admins redirected → `/admin/accountability` |
| 3 | `/activate` | `(app)/activate/page.tsx` | 2 refs | any authed |
| 4 | `/admin` | `(app)/admin/page.tsx` | 15 refs | **`requireProductAdmin()`** then redirect `/admin/command-center` (stub) |
| 5 | `/admin/accountability` | `(app)/admin/accountability/page.tsx` | 4 refs | `isProductAdmin` else `/dashboard` |
| 6 | `/admin/activity` | `(app)/admin/activity/page.tsx` | **0 refs** | none — redirect stub → `/admin/command-center` |
| 7 | `/admin/ai-usage` | `(app)/admin/ai-usage/page.tsx` | 2 refs | **`requireProductAdmin()`** |
| 8 | `/admin/command-center` | `(app)/admin/command-center/page.tsx` | 6 refs | `user.rep.role !== 'admin' && !authCtx.isOwner && !authCtx.isAdmin` → `/dashboard` |
| 9 | `/admin/dataset` | `(app)/admin/dataset/page.tsx` | 1 ref | **`requireProductAdmin()`** |
| 10 | `/admin/growth` | `(app)/admin/growth/page.tsx` | **0 refs** | `role !== 'admin' && !isOwner && !isAdmin` → `/dashboard` |
| 11 | `/admin/people` | `(app)/admin/people/page.tsx` | 4 refs | `role !== 'admin' && !isOwner && !isAdmin` → `/dashboard` |
| 12 | `/admin/revenue-identities` | `(app)/admin/revenue-identities/page.tsx` | 2 refs (store hrefs) | `requireProductAdmin()` then redirect `/profile-intelligence?tab=identities` (stub) |
| 13 | `/admin/revenue-intelligence` | `(app)/admin/revenue-intelligence/page.tsx` | 2 refs | **`requireProductAdmin()`** |
| 14 | `/admin/scoring-qa` | `(app)/admin/scoring-qa/page.tsx` | 1 ref | **`requireProductAdmin()`** |
| 15 | `/admin/targets` | `(app)/admin/targets/page.tsx` | 5 refs | **`requireProductAdmin()`** |
| 16 | `/admin/training-data` | `(app)/admin/training-data/page.tsx` | 1 ref | **`requireProductAdmin()`** |
| 17 | `/archive` | `(app)/archive/page.tsx` | 7 refs | any authed |
| 18 | `/chats` | `(app)/chats/page.tsx` | 2 refs (rail, archive) | any authed |
| 19 | `/content` | `(app)/content/page.tsx` | 24 refs | any authed; redirects to first persona's v2 today |
| 20 | `/content-v2/[id]/today` | `(app)/content-v2/[id]/today/page.tsx` | 8 refs | persona owner or `reps.role === 'admin'`, else `notFound()` |
| 21 | `/content-v2/growth` | `(app)/content-v2/growth/page.tsx` | 3 refs | **`reps.role !== 'admin'` → `notFound()`** |
| 22 | `/content/[id]` | `(app)/content/[id]/page.tsx` | 23 refs | owner/admin else `/content`; then redirect `/content-v2/[id]/today` (legacy stub) |
| 23 | `/content/[id]/create` | `(app)/content/[id]/create/page.tsx` | 23 refs | owner/admin else `/content` |
| 24 | `/content/[id]/identity` | `(app)/content/[id]/identity/page.tsx` | 23 refs | owner/admin else `/content` |
| 25 | `/content/[id]/journey` | `(app)/content/[id]/journey/page.tsx` | 23 refs | owner/admin else `/content` |
| 26 | `/content/[id]/library` | `(app)/content/[id]/library/page.tsx` | 23 refs | owner/admin else `/content` |
| 27 | `/content/[id]/today` | `(app)/content/[id]/today/page.tsx` | 23 refs | owner/admin else `/content`; then redirect `/content-v2/[id]/today` (legacy stub) |
| 28 | `/content/growth` | `(app)/content/growth/page.tsx` | **0 refs** | `role !== 'admin' && !isOwner && !isAdmin` → `/dashboard`; then redirect `/content-v2/growth` (stub) |
| 29 | `/content/new` | `(app)/content/new/page.tsx` | 3 refs | any authed |
| 30 | `/conversations` | `(app)/conversations/page.tsx` | **0 refs** | none — redirect stub → `/relay` |
| 31 | `/dashboard` | `(app)/dashboard/page.tsx` | 27 refs | any authed; branches on owner/admin/manager for team data |
| 32 | `/facts` | `(app)/facts/page.tsx` | 3 refs | any authed; edit affordance gated on `reps.role === 'admin'` |
| 33 | `/find-jobs` | `(app)/find-jobs/page.tsx` | **0 refs** | any authed — **dead** |
| 34 | `/inbound` | `(app)/inbound/page.tsx` | 5 refs | any authed |
| 35 | `/leads` | `(app)/leads/page.tsx` | 44 refs | any authed |
| 36 | `/leads/[id]` | `(app)/leads/[id]/page.tsx` | 45 refs | any authed |
| 37 | `/leads/import` | `(app)/leads/import/page.tsx` | 1 ref | any authed |
| 38 | `/leads/new` | `(app)/leads/new/page.tsx` | 4 refs | any authed |
| 39 | `/manage-profiles` | `(app)/manage-profiles/page.tsx` | 2 refs | `isProductAdmin` gates edit UI |
| 40 | `/performance` | `(app)/performance/page.tsx` | 3 refs | any authed; own rep activity |
| 41 | `/profile-intelligence` | `(app)/profile-intelligence/page.tsx` | 10 refs | `isProductAdmin` chooses `identities` tab + merge |
| 42 | `/profile-intelligence/[id]` | `(app)/profile-intelligence/[id]/page.tsx` | 11 refs | `profileAccess` → `canImport` / `canMerge` |
| 43 | `/profiles` | `(app)/profiles/page.tsx` | 6 refs | `isProductAdmin` → org-wide list vs own |
| 44 | `/prospect` | `(app)/prospect/page.tsx` | 17 refs | any authed |
| 45 | `/relay` | `(app)/relay/page.tsx` | 4 refs | any authed; empty-state copy branches on `role === 'admin'` |
| 46 | `/relay/persona-daily` | `(app)/relay/persona-daily/page.tsx` | **0 refs** | any authed; `notFound()` if no persona — **dead** |
| 47 | `/rep/assigned-profiles` | `(app)/rep/assigned-profiles/page.tsx` | 2 refs | any authed |
| 48 | `/resume/generate` | `(app)/resume/generate/page.tsx` | **0 refs** | any authed — **dead** |
| 49 | `/revenue/email` | `(app)/revenue/email/page.tsx` | 1 ref | any authed |
| 50 | `/settings` | `(app)/settings/page.tsx` | 7 refs | any authed; admin links gated on `isProductAdmin` |
| 51 | `/studio/post-detail` | `(app)/studio/post-detail/page.tsx` | 1 ref | any authed |
| 52 | `/team` | `(app)/team/page.tsx` | 18 refs | `can()` capability |
| 53 | `/team/[repId]` | `(app)/team/[repId]/page.tsx` | 19 refs | owner/admin or self or team member else `/dashboard` |
| 54 | `/team/eval` | `(app)/team/eval/page.tsx` | 1 ref | any authed |
| 55 | `/upwork` | `(app)/upwork/page.tsx` | 20 refs | any authed |
| 56 | `/upwork/[id]` | `(app)/upwork/[id]/page.tsx` | 21 refs | any authed; branches on auth context |
| 57 | `/upwork/new` | `(app)/upwork/new/page.tsx` | 5 refs | any authed |
| 58 | `/usage` | `(app)/usage/page.tsx` | **0 refs** | none — redirect stub → `/settings#send-budget` |
| 59 | `/workspace/[revenueIdentityId]` | `(app)/workspace/[revenueIdentityId]/page.tsx` | 3 refs | `isProductAdmin` for admin view |

### 2.2 `(public)` route group — 29 pages (no auth required)

| # | Path | File | Linked from | Notes |
|---|---|---|---|---|
| 1 | `/acceptable-use` | `(public)/acceptable-use/page.tsx` | 4 refs | static |
| 2 | `/ai-policy` | `(public)/ai-policy/page.tsx` | 3 refs | static |
| 3 | `/docs` | `(public)/docs/page.tsx` | 18 refs | docs index |
| 4 | `/docs/account` | `(public)/docs/account/page.tsx` | 1 ref | docs |
| 5 | `/docs/analytics` | `(public)/docs/analytics/page.tsx` | 3 refs | docs |
| 6 | `/docs/bd-workflow` | `(public)/docs/bd-workflow/page.tsx` | 5 refs | docs |
| 7 | `/docs/faq` | `(public)/docs/faq/page.tsx` | 2 refs | docs |
| 8 | `/docs/follow-ups` | `(public)/docs/follow-ups/page.tsx` | 3 refs | docs |
| 9 | `/docs/founder-setup` | `(public)/docs/founder-setup/page.tsx` | 4 refs | docs |
| 10 | `/docs/getting-started` | `(public)/docs/getting-started/page.tsx` | 2 refs | docs |
| 11 | `/docs/identities` | `(public)/docs/identities/page.tsx` | 2 refs | docs |
| 12 | `/docs/jobs` | `(public)/docs/jobs/page.tsx` | 2 refs | docs |
| 13 | `/docs/leads` | `(public)/docs/leads/page.tsx` | 2 refs | docs |
| 14 | `/docs/outreach` | `(public)/docs/outreach/page.tsx` | 4 refs | docs |
| 15 | `/docs/oversight` | `(public)/docs/oversight/page.tsx` | 2 refs | docs |
| 16 | `/docs/prospect-check` | `(public)/docs/prospect-check/page.tsx` | 3 refs | docs |
| 17 | `/docs/studio` | `(public)/docs/studio/page.tsx` | 4 refs | docs |
| 18 | `/docs/team` | `(public)/docs/team/page.tsx` | 4 refs | docs |
| 19 | `/docs/usage` | `(public)/docs/usage/page.tsx` | 2 refs | docs |
| 20 | `/forgot-password` | `(public)/forgot-password/page.tsx` | 3 refs | redirects authed → `/dashboard`/`/onboarding` |
| 21 | `/login` | `(public)/login/page.tsx` | 47 refs | redirects authed → `/dashboard`/`/onboarding` |
| 22 | `/pricing` | `(public)/pricing/page.tsx` | 5 refs | static |
| 23 | `/privacy` | `(public)/privacy/page.tsx` | 5 refs | static |
| 24 | `/reset-password` | `(public)/reset-password/page.tsx` | 1 ref | static |
| 25 | `/security` | `(public)/security/page.tsx` | 5 refs | static |
| 26 | `/signup` | `(public)/signup/page.tsx` | 11 refs | redirects authed → `/dashboard`/`/onboarding` |
| 27 | `/terms` | `(public)/terms/page.tsx` | 4 refs | static |
| 28 | `/trust` | `(public)/trust/page.tsx` | 9 refs | static |
| 29 | `/verify-email` | `(public)/verify-email/page.tsx` | **0 code refs** | reached via email link; redirects authed |

### 2.3 Other page routes

| # | Path | File | Linked from | Role gating |
|---|---|---|---|---|
| 1 | `/` | `(landing)/page.tsx` | 52 refs | public landing |
| 2 | `/onboarding` | `onboarding/page.tsx` | 9 refs | `getCurrentUser()` → `/login`; `user.profile` → `/dashboard`; admin vs rep identity count |
| 3 | `/studio/drafts/[id]` | `studio/drafts/[id]/page.tsx` | 6 refs | `getCurrentUser()` → `/login`; persona must exist |
| 4 | `/studio/drafts/new` | `studio/drafts/new/page.tsx` | **0 refs** | `getCurrentUser()` → `/login`; `personaId` required — **dead** |

Non-page handlers: `src/app/auth/callback/route.ts` (Supabase OAuth/code exchange),
`src/app/og/route.tsx` (OG image, public).

---

## 3. API routes — complete inventory (202)

### 3.1 `account` (1)

| Route | Methods | Auth | Role |
|---|---|---|---|
| `/api/account/delete` | POST | `getCurrentUser()` 401 | self |

### 3.2 `accountability` (8)

| Route | Auth | Role |
|---|---|---|
| `/api/accountability/day-close` | store | any authed |
| `/api/accountability/day-close-strict` | store | any authed |
| `/api/accountability/ensure-day-close` | store | any authed |
| `/api/accountability/event` | store | any authed |
| `/api/accountability/monthly-review` | store | any authed |
| `/api/accountability/progress` | store | any authed |
| `/api/accountability/rewards` | store | any authed |
| `/api/accountability/warnings` | store | any authed |

### 3.3 `admin` (35) — **admin/manager domain**

| Route | Role gate |
|---|---|
| `/api/admin/accountability-templates` | `can(MANAGE_ACCOUNTABILITY_POLICY)` |
| `/api/admin/activity` | `can(VIEW_TEAM_ANALYTICS)` |
| `/api/admin/ai-usage` | `can(...)` 403 |
| `/api/admin/assignments` | `can(MANAGE_REVENUE_IDENTITIES)` |
| `/api/admin/command-center-v2` | `can(VIEW_TEAM_ANALYTICS)` |
| `/api/admin/contracts` | `can(MANAGE_ACCOUNTABILITY_POLICY)` |
| `/api/admin/contracts/[id]/allocations` | `can(MANAGE_ACCOUNTABILITY_POLICY)` |
| `/api/admin/daily-activity` | `can(VIEW_TEAM_ANALYTICS)` |
| `/api/admin/events` | `can(VIEW_TEAM_ANALYTICS)` |
| `/api/admin/growth` | `can(MANAGE_REVENUE_IDENTITIES)` |
| `/api/admin/health` | `can(VIEW_TEAM_ANALYTICS)` |
| `/api/admin/integrity/action-ledger` | `can(VIEW_TEAM_ANALYTICS)` |
| `/api/admin/live-feed` | `can(VIEW_TEAM_ANALYTICS)` |
| `/api/admin/observability` | **cron secret only** (no user auth) |
| `/api/admin/people/bypass-onboarding` | `can(MANAGE_REVENUE_IDENTITIES)` |
| `/api/admin/performance` | **⚠ auth only (401), no role check** |
| `/api/admin/performance/activity` | `can(VIEW_TEAM_ANALYTICS)` |
| `/api/admin/performance/config` | `!auth.isAdmin` 403 |
| `/api/admin/rep-day` | `can(VIEW_TEAM_ANALYTICS)` |
| `/api/admin/rep-performance` | **⚠ auth only (401), no role check** |
| `/api/admin/revenue-identities` | `can(MANAGE_REVENUE_IDENTITIES)` |
| `/api/admin/revenue-identities/[id]` | `can(MANAGE_REVENUE_IDENTITIES)` |
| `/api/admin/revenue-identities/[id]/assign` | `can(MANAGE_REVENUE_IDENTITIES)` |
| `/api/admin/revenue-identities/[id]/email` | `can(MANAGE_REVENUE_IDENTITIES)` |
| `/api/admin/revenue-intelligence` | `can(ACCESS_REVENUE_INTELLIGENCE)` |
| `/api/admin/routing-opportunities` | **⚠ auth only (401), no role check** |
| `/api/admin/scoring-integrity` | `isAdmin \|\| isOwner \|\| isManager` |
| `/api/admin/scoring-monitor` | `isAdmin \|\| isOwner \|\| isManager` |
| `/api/admin/scoring-qa` | `isAdmin \|\| isOwner \|\| isManager` |
| `/api/admin/targets` | `can(MANAGE_TEAM_TARGETS)` |
| `/api/admin/targets/[id]` | `can(MANAGE_TEAM_TARGETS)` |
| `/api/admin/team-live` | `can(VIEW_TEAM_ANALYTICS)` (filtered response) |
| `/api/admin/training-data` | `isAdmin \|\| isOwner \|\| isManager` |
| `/api/admin/training-data/labels` | `isAdmin \|\| isOwner \|\| isManager` |
| `/api/admin/training-data/pairwise` | `isAdmin \|\| isOwner \|\| isManager` |

### 3.4 `content` (31)

| Route | Role |
|---|---|
| `/api/content/cold-start` | any authed |
| `/api/content/daily` | persona owner or `reps.role === 'admin'` |
| `/api/content/drafts/[id]` | persona owner or admin |
| `/api/content/drafts/[id]/feedback` | persona owner or admin |
| `/api/content/drafts/[id]/post` | persona owner or admin |
| `/api/content/generate` | persona owner or admin |
| `/api/content/generate-draft` | persona owner or admin |
| `/api/content/history/[id]` | persona owner or admin |
| `/api/content/intelligence/discover` | persona owner or admin — **superseded by v2** |
| `/api/content/intelligence/forge` | persona owner or admin — **superseded by v2** |
| `/api/content/intelligence/interview` | persona owner or admin — **superseded by v2** |
| `/api/content/intelligence/org-themes` | persona owner or admin — **superseded by v2** |
| `/api/content/intelligence/v2/daily` | persona owner or admin |
| `/api/content/intelligence/v2/daily-brief` | persona owner or admin |
| `/api/content/intelligence/v2/daily-brief/copied` | persona owner or admin |
| `/api/content/intelligence/v2/daily-brief/feedback` | persona owner or admin |
| `/api/content/intelligence/v2/daily-brief/idea` | persona owner or admin |
| `/api/content/intelligence/v2/daily-brief/image` | persona owner or admin |
| `/api/content/intelligence/v2/discover` | persona owner or admin |
| `/api/content/intelligence/v2/generate` | persona owner or admin |
| `/api/content/intelligence/v2/opinions` | persona owner or admin |
| `/api/content/intelligence/v2/quick-capture` | persona owner or admin |
| `/api/content/intelligence/v2/taste` | persona owner or admin |
| `/api/content/onboarding-questions` | any authed |
| `/api/content/onboarding/complete` | any authed |
| `/api/content/onboarding/extract` | any authed |
| `/api/content/personas` | any authed |
| `/api/content/personas/[id]` | persona owner or admin |
| `/api/content/personas/[id]/refine` | persona owner or admin |
| `/api/content/pillars` | persona owner or admin |
| `/api/content/post-structures` | any authed |

### 3.5 `dataset` (5)

| Route | Role |
|---|---|
| `/api/dataset/capture` | auth 401 + org scoping on `sample_id` |
| `/api/dataset/export` | `isAdmin \|\| isOwner \|\| isManager`; anonymized → admin/owner |
| `/api/dataset/metrics` | `isAdmin \|\| isOwner \|\| isManager` |
| `/api/dataset/samples` | `isAdmin \|\| isOwner \|\| isManager` |
| `/api/dataset/sync` | `isAdmin \|\| isOwner \|\| isManager` |

### 3.6 `email` (2)

| Route | Auth |
|---|---|
| `/api/email/discover` | store |
| `/api/email/webhook` | **webhook signature 401** |

### 3.7 `eval` (3)

| Route | Auth |
|---|---|
| `/api/eval/cron-run` | **cron secret** |
| `/api/eval/golden` | store (any authed) |
| `/api/eval/run` | store (any authed) |

### 3.8 `facts` / `few-shot` / `growth` / `growth-v2`

| Route | Role |
|---|---|
| `/api/facts` | store (any authed) |
| `/api/few-shot/refresh` | store **or** cron secret |
| `/api/growth/decision` | any authed — **v1, 0 refs** |
| `/api/growth/decision/update` | any authed — **v1, 0 refs** |
| `/api/growth/draft` | any authed — **v1, 0 refs** |
| `/api/growth/draft/update` | any authed — **v1, 0 refs** |
| `/api/growth/events` | any authed (used by old growth dashboard) |
| `/api/growth/feedback` | any authed (used by old growth dashboard) |
| `/api/growth/memory` | any authed — **v1, 0 refs** |
| `/api/growth/opportunities` | any authed (used) |
| `/api/growth/opportunities/generate` | any authed (used) |
| `/api/growth/opportunities/select` | any authed (used) |
| `/api/growth/publications` | any authed — **v1, 0 refs** |
| `/api/growth/today` | any authed — **v1, 0 refs** |
| `/api/growth/weekly-review` | any authed (used) |
| `/api/growth-v2/daily` | **`reps.role !== 'admin'` 403** |

### 3.9 `help` / `inbound` / `jobs` / `leads` (28+)

| Route | Role |
|---|---|
| `/api/help/[requestId]` | any authed |
| `/api/help/outstanding` | any authed |
| `/api/inbound/analyze` | store |
| `/api/inbound/lead` | store |
| `/api/inbound/reply` | store |
| `/api/jobs/cv` | store |
| `/api/jobs/search` | store |
| `/api/leads` | store; owner/admin may use any identity |
| `/api/leads/[id]` | store |
| `/api/leads/[id]/archive` | owner of lead or `isAdmin` |
| `/api/leads/[id]/connection-accepted` | store |
| `/api/leads/[id]/contact` | store + `getAuthContext` |
| `/api/leads/[id]/contacts` | store |
| `/api/leads/[id]/contacts/discover` | store |
| `/api/leads/[id]/conversation` | store |
| `/api/leads/[id]/conversation/compose` | store + auth |
| `/api/leads/[id]/conversation/draft` | store |
| `/api/leads/[id]/conversation/inbound` | store + auth |
| `/api/leads/[id]/conversation/send` | store + auth |
| `/api/leads/[id]/decision-context` | store |
| `/api/leads/[id]/draft` | store |
| `/api/leads/[id]/email` | store |
| `/api/leads/[id]/email/prepare` | store |
| `/api/leads/[id]/email/send` | store |
| `/api/leads/[id]/help` | store + auth |
| `/api/leads/[id]/outcome` | store |
| `/api/leads/[id]/refer` | owner/manager/admin |
| `/api/leads/[id]/refresh-intelligence` | store |
| `/api/leads/[id]/reply` | store |
| `/api/leads/[id]/reply-strategies` | auth |
| `/api/leads/[id]/status` | store |
| `/api/leads/[id]/unlock` | **`isProductAdmin`** |
| `/api/leads/extract` | store |
| `/api/leads/import` | store |
| `/api/leads/signal-watch` | auth |

### 3.10 `manager` / `me` / `notifications` / `onboarding` / `organization` / `owner`

| Route | Role |
|---|---|
| `/api/manager/team` | auth |
| `/api/me/authorized-identities` | store |
| `/api/me/rulebook` | store |
| `/api/me/status` | store |
| `/api/me/team` | owner/admin see all; manager filtered |
| `/api/me/workspace` | store |
| `/api/notifications` | store |
| `/api/notifications-app` | store |
| `/api/onboarding` | store |
| `/api/onboarding/preview` | store |
| `/api/organization/delete` | `can(...)` → **admin/owner only** |
| `/api/owner/command-center` | `can(...)` |

### 3.11 `performance` / `profile-intelligence` (13) / `profiles` / `proofs`

| Route | Role |
|---|---|
| `/api/performance/activity` | self or `isAdmin \|\| isOwner` |
| `/api/profile-intelligence/batch` | `profileAccess.canManage` |
| `/api/profile-intelligence/batch/[id]` | `profileAccess.canManage` |
| `/api/profile-intelligence/batch/[id]/process` | `profileAccess.canManage` |
| `/api/profile-intelligence/legacy/classify` | `profileAccess` — **0 refs, dead** |
| `/api/profile-intelligence/profiles` | `profileAccess` scope |
| `/api/profile-intelligence/profiles/[id]` | `canViewProfile` / `profileAccess` |
| `/api/profile-intelligence/profiles/[id]/assign` | `profileAccess` |
| `/api/profile-intelligence/profiles/[id]/enrich` | `requireProfileManager` |
| `/api/profile-intelligence/profiles/[id]/enrich/[runId]` | `requireProfileManager` |
| `/api/profile-intelligence/profiles/[id]/enrich/[runId]/apply` | `requireProfileManager` |
| `/api/profile-intelligence/profiles/[id]/enrich/[runId]/discard` | `requireProfileManager` |
| `/api/profile-intelligence/profiles/[id]/enrich/[runId]/person` | `requireProfileManager` |
| `/api/profile-intelligence/profiles/[id]/enrich/[runId]/process` | `requireProfileManager` |
| `/api/profile-intelligence/profiles/[id]/sources` | **retired → 410** |
| `/api/profile-intelligence/profiles/merge` | `profileAccess.canMerge` (owner/admin) |
| `/api/profiles` | store |
| `/api/profiles/[id]` | store |
| `/api/profiles/[id]/cv` | store; `isAdmin` branch |
| `/api/proofs` | store + `can` |
| `/api/proofs/[id]` | store + `can` |

### 3.12 `prospect` / `push` / `relay` / `rep` / `reps` / `resume` / `revenue`

| Route | Role |
|---|---|
| `/api/prospect/analyze` | store + auth |
| `/api/prospect/save` | store |
| `/api/push/subscribe` | store |
| `/api/relay/persona-daily` | persona owner or admin |
| `/api/relay/queue` | store |
| `/api/relay/reconcile` | **cron secret** |
| `/api/rep/assigned-profiles` | store |
| `/api/rep/my-day` | store |
| `/api/rep/today` | store |
| `/api/reps` | store |
| `/api/resume/generate` | store |
| `/api/revenue/email` | store |
| `/api/revenue/email/prepare` | store |

### 3.13 `scoring-feedback` / `search` / `signup` / `trends` / `upwork` / `version`

| Route | Auth |
|---|---|
| `/api/scoring-feedback` | auth; non-admin/owner/manager scoped to own `rep_id` |
| `/api/search` | store |
| `/api/signup` | **public** (rate-limited) |
| `/api/trends/ingest` | **cron secret** |
| `/api/upwork/connects` | store |
| `/api/upwork/extract` | store |
| `/api/upwork/jobs` | store |
| `/api/upwork/jobs/[id]` | store |
| `/api/upwork/jobs/[id]/apply` | store |
| `/api/upwork/jobs/[id]/draft` | store |
| `/api/upwork/jobs/[id]/generate` | store |
| `/api/upwork/jobs/[id]/message` | store |
| `/api/upwork/jobs/[id]/reply` | store |
| `/api/version` | **public** |

### 3.14 Cron / webhook / public API (intentionally unauthenticated)

`/api/admin/observability`, `/api/analytics/track`, `/api/cron/archive-stale-leads`,
`/api/email/webhook`, `/api/eval/cron-run`, `/api/relay/reconcile`, `/api/signup`,
`/api/trends/ingest`, `/api/version`.

---

## 4. Auth & org-scoping mechanics

### 4.1 Server client — `src/lib/supabase/server.ts`
`createServerSupabase()` = per-request `@supabase/ssr` client bound to the user's
cookie session; **RLS applies**, no service key reaches the browser. Cookie writes
are swallowed in RSC (handled by the proxy).

### 4.2 `src/lib/auth/current.ts`
`getCurrentUser()` (React `cache`d) resolves `{ rep, organization, profile }`.
Demo mode short-circuits to the bpulse demo org/rep. Falls back to `auth.getUser()`
when `getClaims()` is inconclusive. Returns `null` if no rep is mapped.

### 4.3 `src/lib/auth/organization.ts`
`getAuthContext()` (cached) reads `organization_roles` (canonical), `team_memberships`,
and `capabilities`. Falls back to `reps.role` only when no org-role row exists.

### 4.4 `src/lib/auth/workspace.ts`
`assertRevenueIdentityAssignedToRep` / `isRevenueIdentityAssignedToRep` /
`getAuthorizedIdentities` / `getCurrentRepWorkspace` / `getDailyWorkspace`.
Never trust a client-supplied identity id.

### 4.5 `src/lib/auth/admin-page.ts` & `growth.ts`
`isProductAdmin`, `requireProductAdmin`, `hasGrowthAccess`, `requireGrowthAccess`,
`assertGrowthAccessAPI` — all owner/admin, never `reps.role` alone.

### 4.6 Store-level auth — `src/lib/store/index.ts`
`createScoutStore()` throws `'No signed-in rep for this request'` when
`getCurrentUser()` is null. **115 API routes rely on this implicit 401** rather
than an explicit check. Any route that calls `createScoutStore()` is auth-gated.

### 4.7 `src/proxy.ts` (Next.js 16 middleware replacement)
Refreshes the Supabase session; redirects unauthenticated users away from
`PROTECTED_PREFIXES`:
`/onboarding`, `/leads`, `/content`, `/upwork`, `/archive`, `/team`, `/profiles`,
`/facts`, `/manage-profiles`, `/account`, `/activate`, `/dashboard`, `/prospect`,
`/settings`, `/admin`.
Note: `/relay`, `/chats`, `/inbound`, `/revenue`, `/performance`, `/workspace`,
`/content-v2`, `/studio`, `/resume`, `/team/eval`, `/find-jobs` are **not** in
the proxy list — they rely on `(app)/layout.tsx` instead.

---

## 5. Navigation inventory

### 5.1 `src/components/app-rail.tsx`

| Section | Items | Role condition |
|---|---|---|
| `PRIMARY_NAV` | `/dashboard` (Today), `/leads` (Leads), `/chats` (Chats), `/prospect` (Prospect) | all roles |
| `REP_NAV` | `/accountability` (My Numbers) | **non-admin only** (`isAdmin ? PRIMARY : [...PRIMARY, ...REP]`) |
| `TEAM_NAV` | `/team` (My Team) | **admin only** |
| `STUDIO_NAV` | `/content` (Studio) | all roles |
| `MORE_NAV` Work | `/leads/import`, `/upwork` (Jobs), `/relay` (Conversations), `/inbound`, `/archive` | all roles |
| `MORE_NAV` Create | `/content-v2/growth` (Relay Growth) | **`adminOnly`** |
| `MORE_NAV` Intelligence | `/profile-intelligence` (Profiles), `/facts` (Proof) | all roles |
| `MORE_NAV` Admin | `/admin/command-center`, `/admin/accountability`, `/admin/revenue-intelligence`, `/admin/scoring-qa`, `/admin/targets`, `/admin/people`, `/admin/ai-usage`, `/admin/dataset`, `/admin/training-data` | **`adminOnly`** |
| `MORE_NAV` Account | `/settings` | all roles |
| Mobile bottom nav | `/dashboard`, `/leads`, `/content`, `/settings` | all roles |

The `roles?: RepRole[]` field exists on `MORE_NAV` but **no item uses it**.
`isAdmin` in the rail is derived from the `role` prop = `user.rep.role` (passed
from the layout) — **not** `authCtx.isAdmin`. A demoted user with a stale
`reps.role = 'admin'` still sees admin nav client-side (server gates still apply).

### 5.2 `src/components/command-palette.tsx`

Commands (no role filtering at all):

| Group | Commands |
|---|---|
| Relay | Check a prospect, Find leads, Find jobs, Open conversations, Search lead, Add Upwork job, View replies, View follow-ups, View referred leads, Switch Revenue Identity, Inbound |
| Studio | Quick Capture, Create Studio idea, Search profile, Proof, Relay Growth |
| Navigation | Today, New lead, Studio, Team, Settings |
| Admin | Command Center, People, Revenue Intelligence, Sending identities, Targets |

**⚠ No role condition.** Every command — including the Admin group — is shown to
all roles. Server routes still reject unauthorized access, but the palette leaks
the existence of admin routes to reps/managers.

---

## 6. UNREACHABLE / DEAD ROUTES

Reachability = grep for the path as a quoted string in `src/**` excluding the page
file itself.

### 6.1 Dead page routes (0 references)

| Path | File | Status |
|---|---|---|
| `/find-jobs` | `(app)/find-jobs/page.tsx` | **Dead** — only referenced as a command-palette `id`, not an href. Full JobsSearchExperience UI orphaned. |
| `/relay/persona-daily` | `(app)/relay/persona-daily/page.tsx` | **Dead** — no links; API `/api/relay/persona-daily` still used by `persona-daily-post.tsx`. |
| `/resume/generate` | `(app)/resume/generate/page.tsx` | **Dead** — no links; `/api/resume/generate` also unreferenced. |
| `/studio/drafts/new` | `studio/drafts/new/page.tsx` | **Dead** — no links; creation flows push to `/studio/drafts/[id]`. |
| `/admin/growth` | `(app)/admin/growth/page.tsx` | **Dead** — admin-only page, not in nav or palette; `/api/admin/growth` still used by `growth-dashboard.tsx`. |
| `/admin/activity` | `(app)/admin/activity/page.tsx` | **Dead stub** — redirects to `/admin/command-center`. |
| `/conversations` | `(app)/conversations/page.tsx` | **Dead stub** — redirects to `/relay`. |
| `/usage` | `(app)/usage/page.tsx` | **Dead stub** — redirects to `/settings#send-budget`. |
| `/content/growth` | `(app)/content/growth/page.tsx` | **Dead stub** — redirects to `/content-v2/growth`. |
| `/content/[id]` | `(app)/content/[id]/page.tsx` | **Legacy stub** — redirects to `/content-v2/[id]/today`. |
| `/content/[id]/today` | `(app)/content/[id]/today/page.tsx` | **Legacy stub** — redirects to `/content-v2/[id]/today`. |
| `/admin` | `(app)/admin/page.tsx` | **Stub** — `requireProductAdmin()` then redirect `/admin/command-center`. |
| `/admin/revenue-identities` | `(app)/admin/revenue-identities/page.tsx` | **Stub** — `requireProductAdmin()` then redirect `/profile-intelligence?tab=identities`. |

### 6.2 Duplicate / superseded route families

| Family | Live | Dead / legacy | Evidence |
|---|---|---|---|
| Content Studio | `/content` → `/content-v2/[id]/today` | `/content/[id]`, `/content/[id]/today` (redirects) | redirects in page files |
| Growth engine | `/content-v2/growth` | `/content/growth`, `/admin/growth` | redirects / 0 refs |
| Content intelligence | `/api/content/intelligence/v2/*` (18 refs) | `/api/content/intelligence/{discover,forge,interview,org-themes}` (0 refs) | grep counts |
| Growth API | `/api/growth-v2/daily` (admin) | `/api/growth/{decision,decision/update,draft,draft/update,memory,publications,today}` (0 refs) | grep counts |
| Profile enrichment | `/api/profile-intelligence/profiles/[id]/enrich` | `/api/profile-intelligence/profiles/[id]/sources` (retired 410) | route body |
| Profile classify | v2 enrichment flow | `/api/profile-intelligence/legacy/classify` (0 refs) | grep count |
| Conversations | `/relay` | `/conversations` (redirect) | page file |
| Usage | `/settings#send-budget` | `/usage` (redirect) | page file |
| Admin revenue identities | `/profile-intelligence?tab=identities` | `/admin/revenue-identities` (redirect) | page file |

### 6.3 Unreferenced API routes

`/api/growth/decision`, `/api/growth/decision/update`, `/api/growth/draft`,
`/api/growth/draft/update`, `/api/growth/memory`, `/api/growth/publications`,
`/api/growth/today`, `/api/content/intelligence/{discover,forge,interview,org-themes}`,
`/api/profile-intelligence/legacy/classify`, `/api/profile-intelligence/profiles/[id]/sources` (410),
`/api/trends/ingest`, `/api/relay/reconcile`, `/api/eval/*` (internal).

---

## 7. ROLE GATING GAPS

### 7.1 High severity — auth-only admin endpoints (cross-rep data exposure)

| Route | File | Issue |
|---|---|---|
| `/api/admin/performance` | `src/app/api/admin/performance/route.ts` | Only `if (!auth) 401`. **No admin/owner/manager check.** Any signed-in rep can pass `repId` and read **another rep's** execution health, SLA, funnel and outcomes. Uses `createServiceSupabase()` (bypasses RLS). |
| `/api/admin/rep-performance` | `src/app/api/admin/rep-performance/route.ts` | Only `if (!auth) 401`. Any rep can read **any** rep's performance/coaching or the org-wide `brief`. Service role. |
| `/api/admin/routing-opportunities` | `src/app/api/admin/routing-opportunities/route.ts` | Only `if (!authCtx) 401`. Any rep can list org-wide lead routing opportunities. |

All three are under `/api/admin/` and are called by `admin-dashboard.tsx`,
`admin-performance-overview.tsx`, `execution-health-card.tsx`, and
`command-center-v2.tsx`. `execution-health-card.tsx` is rendered inside
`rep-today.tsx` / `rep-workspace.tsx` (rep surfaces), so reps already call
`/api/admin/performance?repId=...` — confirming the missing role check is
reachable, not theoretical.

### 7.2 Medium severity

| Route | File | Issue |
|---|---|---|
| `/api/admin/performance/config` | `admin/performance/config/route.ts` | `!auth.isAdmin` only. `isAdmin` is true for owner, so OK, but inconsistent with `isOwner \|\| isAdmin` used elsewhere. |
| `/api/admin/observability` | `admin/observability/route.ts` | Cron-secret only; no user auth. Acceptable for a cron endpoint, but any holder of the secret gets full org health. |
| `/api/admin/team-live` | `admin/team-live/route.ts` | Returns data filtered by `can(VIEW_TEAM_ANALYTICS)`, but the route itself only 401s — a manager without the capability gets an empty/filtered payload rather than 403. |
| `app-rail.tsx` | `src/components/app-rail.tsx` | `isAdmin = role === 'admin'` where `role = user.rep.role` (stale-prone). Demoted users may still see admin nav client-side. Server gates still apply. |
| `command-palette.tsx` | `src/components/command-palette.tsx` | **No role filtering.** Admin commands (Command Center, People, Revenue, Targets, Sending identities) are visible to every role. |
| `app-rail.tsx` `MORE_NAV` | `src/components/app-rail.tsx` | `roles?: RepRole[]` field defined but unused — no nav item is gated by `roles`. |
| `proxy.ts` | `src/proxy.ts` | `PROTECTED_PREFIXES` omits `/relay`, `/chats`, `/inbound`, `/revenue`, `/performance`, `/workspace`, `/content-v2`, `/studio`, `/resume`, `/team/eval`, `/find-jobs`. These rely solely on `(app)/layout.tsx`; if that layout's `getCurrentUser()` fails open, they are unprotected. |
| `(app)/layout.tsx` | `src/app/(app)/layout.tsx` | The layout `catch` around `createServerSupabase()` swallows errors and falls through to `redirect('/login')` — safe, but means a Supabase outage logs users out rather than showing an error. |

### 7.3 Low severity / informational

| Item | Issue |
|---|---|
| `/api/dataset/capture` | Auth + org scoping only; no admin gate. By design (capture endpoint). |
| `/api/admin/health`, `/api/admin/integrity/action-ledger`, `/api/admin/performance/activity` | Use `can(VIEW_TEAM_ANALYTICS)` — manager needs the capability row. Correct but capability-dependent. |
| `/api/profile-intelligence/profiles/[id]/sources` | Retired with 410 — no auth needed because it never touches data. |
| `/api/email/webhook`, `/api/trends/ingest`, `/api/relay/reconcile`, `/api/eval/cron-run`, `/api/few-shot/refresh` | Cron/webhook secret gates. Ensure secrets are rotated and not logged. |
| `/api/analytics/track` | Public, no auth, writes only to console in dev. No data validation. |
| `/api/signup` | Public by design; rate-limited per IP. |
| `/api/version` | Public build metadata. No secrets. |

### 7.4 Pages that rely on layout auth only (no page-level role check)

These pages do not re-check auth; they inherit `(app)/layout.tsx`:
`/archive`, `/chats`, `/inbound`, `/leads`, `/leads/[id]`, `/leads/import`,
`/leads/new`, `/prospect`, `/resume/generate`, `/revenue/email`,
`/studio/post-detail`, `/upwork`, `/upwork/[id]`, `/upwork/new`, `/usage`,
`/find-jobs`, `/conversations`, `/activate`, `/account` (checks `authCtx`),
`/performance` (checks `authCtx`), `/team/eval`.
All are safe because the layout redirects unauthenticated users, but they are
**not independently role-gated** — any authenticated rep can reach them.

---

## 8. REDIRECTS

### 8.1 `next.config.ts`
**No `redirects()` or `rewrites()` configured.** Only `headers()` and
`serverExternalPackages`. All routing redirects are page-level.

### 8.2 Page-level redirects

| From | To | File |
|---|---|---|
| `/admin` | `/admin/command-center` | `(app)/admin/page.tsx` |
| `/admin/activity` | `/admin/command-center` | `(app)/admin/activity/page.tsx` |
| `/admin/revenue-identities` | `/profile-intelligence?tab=identities` | `(app)/admin/revenue-identities/page.tsx` |
| `/conversations` | `/relay` | `(app)/conversations/page.tsx` |
| `/usage` | `/settings#send-budget` | `(app)/usage/page.tsx` |
| `/content/growth` | `/content-v2/growth` | `(app)/content/growth/page.tsx` |
| `/content/[id]` | `/content-v2/[id]/today` | `(app)/content/[id]/page.tsx` |
| `/content/[id]/today` | `/content-v2/[id]/today` | `(app)/content/[id]/today/page.tsx` |
| `/content` (no personas) | `/content-v2/{first}/today` | `(app)/content/page.tsx` |
| `/accountability` (admin) | `/admin/accountability` | `(app)/accountability/page.tsx` |
| `/account` (no companyKey) | `/settings` | `(app)/account/page.tsx` |
| `/team/[repId]` (unauthorized) | `/dashboard` | `(app)/team/[repId]/page.tsx` |
| `/admin/*` (non-admin) | `/dashboard` | multiple admin pages |
| `/content/[id]/*` (non-owner) | `/content` | content persona pages |
| `/login`, `/signup`, `/forgot-password`, `/verify-email` (authed) | `/dashboard` or `/onboarding` | `(public)/*` |
| `/onboarding` (has profile) | `/dashboard` | `onboarding/page.tsx` |
| `(app)/*` (no user) | `/login` | `(app)/layout.tsx` |
| `(app)/*` (no profile) | `/onboarding` | `(app)/layout.tsx` |
| `/studio/drafts/new` (no personaId) | `/content` | `studio/drafts/new/page.tsx` |
| `/studio/drafts/[id]` (no draft/persona) | `/content` | `studio/drafts/[id]/page.tsx` |

---

## 9. Coverage matrix — admin-only surfaces

| Surface | Page | API | Gate |
|---|---|---|---|
| Command center | `/admin/command-center` | `/api/admin/command-center-v2` | admin/owner |
| Accountability | `/admin/accountability` | `/api/accountability/*`, `/api/admin/contracts` | admin/owner |
| AI usage | `/admin/ai-usage` | `/api/admin/ai-usage` | admin/owner |
| Dataset | `/admin/dataset` | `/api/dataset/*` | admin/owner/manager |
| Growth | `/content-v2/growth` | `/api/growth-v2/daily`, `/api/admin/growth` | admin |
| People | `/admin/people` | `/api/admin/people/bypass-onboarding` | admin/owner |
| Revenue intelligence | `/admin/revenue-intelligence` | `/api/admin/revenue-intelligence` | admin/owner |
| Scoring QA | `/admin/scoring-qa` | `/api/admin/scoring-qa`, `/api/admin/scoring-monitor` | admin/owner/manager |
| Targets | `/admin/targets` | `/api/admin/targets`, `/api/admin/targets/[id]` | admin/owner |
| Training data | `/admin/training-data` | `/api/admin/training-data*` | admin/owner/manager |
| Performance | `/performance` | `/api/admin/performance`, `/api/admin/rep-performance` | **⚠ missing** |
| Routing | — | `/api/admin/routing-opportunities` | **⚠ missing** |
| Identities | `/profile-intelligence?tab=identities` | `/api/admin/revenue-identities*` | admin/owner |
| Profiles merge | `/profile-intelligence` | `/api/profile-intelligence/profiles/merge` | owner/admin |

---

## 10. Recommended remediation order

1. Add `isAdmin \|\| isOwner \|\| isManager` (or `can(VIEW_TEAM_ANALYTICS)`) to
   `/api/admin/performance`, `/api/admin/rep-performance`, `/api/admin/routing-opportunities`.
2. Add role filtering to `command-palette.tsx` (hide Admin group from non-admins).
3. Derive `isAdmin` in `app-rail.tsx` from `authCtx.isAdmin` (pass it from the
   layout) instead of `user.rep.role`.
4. Delete or redirect the dead pages: `/find-jobs`, `/relay/persona-daily`,
   `/resume/generate`, `/studio/drafts/new`, `/admin/growth`, `/admin/activity`,
   `/conversations`, `/usage`, `/content/growth`.
5. Remove the superseded API families: `/api/content/intelligence/{discover,forge,interview,org-themes}`,
   `/api/growth/{decision,draft,memory,publications,today}`,
   `/api/profile-intelligence/legacy/classify`.
6. Extend `proxy.ts` `PROTECTED_PREFIXES` to cover `/relay`, `/chats`, `/inbound`,
   `/revenue`, `/performance`, `/workspace`, `/content-v2`, `/studio`, `/resume`.
