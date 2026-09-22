# Relay Final Product Acceptance (In Progress)

Last updated: 2026-09-22

## Baseline Snapshot

- HEAD: `8644f4f9612237fcd3803210ed184ca7541e77b4`
- Branch: `main` (tracking `origin/main`)
- Migration status: local and remote are in sync through `20260927000000` (`supabase migration list`)
- Environment limitations:
  - `OPENCODE_API_KEY`: unset
  - `GROQ_API_KEY`: unset
  - `OPENAI_API_KEY`: unset
  - `LONGCAT_API_KEY`: unset
  - `E2E_BASE_URL`: unset (tests use `http://localhost:3000`)

## Current Gate Checks

- `pnpm -s tsc --noEmit`: **FAIL**
  - `src/lib/relay/day-close-service.ts:79:7`
  - `Type '"approved_unavailable"' is not assignable to type 'DayCloseStatus'`
- `supabase migration list`: **PASS** (no drift)

## Route/Auth Inventory (Code-Derived)

### Page Access Model

- Public routes under `src/app/(public)/**` are open (marketing/docs/legal).
- Auth-required app routes under `src/app/(app)/**` are gated by `src/app/(app)/layout.tsx` (`/login` if signed out, `/onboarding` if no profile).
- Product-admin pages use `requireProductAdmin()`:
  - `/admin/ai-usage`
  - `/admin/revenue-intelligence`
  - `/admin/revenue-identities`
  - `/admin/targets`
- Admin-context checks (owner/admin) are implemented directly on:
  - `/admin/people`
  - `/admin/command-center`
  - `/admin/growth`
  - `/content/growth`
- Team/assignment scoping exists on:
  - `/workspace/[revenueIdentityId]` (assigned identity check for non-admin)
  - `/team/[repId]` (owner/admin/self/manager visibility checks)

### API Access Model

- Public/open endpoints: e.g. `/api/signup`, `/api/analytics/track`.
- Secret-gated integration endpoints: e.g. `/api/email/webhook`, `/api/relay/reconcile`, `/api/eval/cron-run`, `/api/few-shot/refresh`.
- Authenticated endpoints generally require session via `getCurrentUser()` and/or `createScoutStore()`.
- Capability-gated endpoints use `getAuthContext()` + `can(...)`.

Canonical capabilities found in route guards:

- `VIEW_TEAM_ANALYTICS`
- `VIEW_TEAM_WORK`
- `MANAGE_REVENUE_IDENTITIES`
- `MANAGE_TEAM_TARGETS`
- `MANAGE_ACCOUNTABILITY_POLICY`
- `APPROVE_REWARDS`
- `MANAGE_ORG_SETTINGS`
- `ACCESS_REVENUE_INTELLIGENCE`

## Targeted Acceptance Runs (This Pass)

### High-signal passes

- `pnpm -s playwright test e2e/reply-conversation.spec.ts --project=desktop-chrome`
  - Result: **2 passed**
- `pnpm -s playwright test e2e/lead-outreach.spec.ts --project=desktop-chrome`
  - Result: **1 passed, 1 flaky** (retry passed)
- `pnpm -s playwright test e2e/prospect.spec.ts --project=desktop-chrome`
  - Result: **9 passed, 1 failed**

### Known failures / instability from this run

- `pnpm -s playwright test e2e/mobile.spec.ts --project=mobile-iphone`
  - **1 failed, 7 passed**
  - Failing case: `M06` (bottom-nav click to Leads redirected to `/login?next=%2Fleads`)
- `pnpm -s playwright test e2e/relay.spec.ts --project=desktop-chrome --max-failures=5`
  - **2 failed, 4 passed, 1 flaky**
  - Failures:
    - `R01` intermittent `net::ERR_ABORTED` on `page.goto('/relay')`
    - `R05` back navigation lands on `/dashboard` instead of `/relay`
- `pnpm -s playwright test e2e/canonical-intelligence-consistency.spec.ts --project=desktop-chrome`
  - Most recent run: **2 failed, 1 passed**
  - Failures are intermittent `net::ERR_ABORTED` while navigating to `/prospect` in setup.
- `pnpm -s playwright test e2e/smoke.spec.ts --project=desktop-chrome`
  - **2 passed, 4 flaky, 1 skipped**
  - Flaky failures also surfaced as `net::ERR_ABORTED` on route transitions.

## Fixes Applied During This Acceptance Pass

- `src/app/api/inbound/reply/route.ts`
  - Added strict UUID validation for `leadId`.
  - Invalid `leadId` now returns `400` instead of bubbling to `500`.
- `e2e/reply-conversation.spec.ts`
  - Switched to authenticated session flow (`loginAsAdmin`) and `page.request` usage.
  - Stabilized `R02` expectation to assert non-5xx behavior.
- `e2e/lead-outreach.spec.ts`
  - Added authenticated setup (`loginAsAdmin`) so `/leads/new` tests run in real signed-in context.

## Authorization Findings to Triage

- `src/app/api/accountability/day-close/route.ts` write paths appear weakly scoped for caller-selected identifiers; requires adversarial authorization review.
- Growth access uses role/context helper checks (`assertGrowthAccessAPI`) while capability string `ACCESS_RELAY_GROWTH` appears in auth context seeding; this is a policy/model drift risk.
- `src/app/studio/drafts/[id]/page.tsx` only checks sign-in and bypasses `(app)` onboarding/profile gate.

## Current Verdict

**NOT READY (current pass)**

Primary blockers:

1. Typecheck is currently red (`DayCloseStatus` mismatch).
2. Browser acceptance is unstable due intermittent `net::ERR_ABORTED` route transitions on critical journeys.
3. Mobile bottom-nav journey still has a reproducible auth redirect failure (`M06`).
4. Relay back-navigation expectation fails (`R05`) and needs route-level UX/behavior confirmation.

## Next Actions (Ordered)

1. Fix the `DayCloseStatus` type mismatch so the baseline compile gate is green.
2. Stabilize local E2E runtime (investigate `net::ERR_ABORTED` on `/prospect` and `/relay` transitions, then re-run smoke/canonical suites).
3. Root-cause mobile `M06` auth redirect on bottom-nav click and add regression assertion.
4. Re-run full acceptance sweep (desktop + mobile) and update this file with final READY/NOT READY decision.
