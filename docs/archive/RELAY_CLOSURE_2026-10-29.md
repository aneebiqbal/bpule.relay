# Relay — Final Bug Closure + Auth / Onboarding Activation

**Date:** 2026-10-29
**Scope:** BUG-001/002/006/008/009/011/013/014/015/016 + auth/onboarding lifecycle.
**Status:** code complete and green on every gate this environment can run. Browser
acceptance, SHA parity and the production smoke are **blocked** (exact reasons below).

---

## Release identity

| Field | Value |
| --- | --- |
| Baseline SHA | `8d859e8` (clean tree before this sprint) |
| Final SHA | `65baeb8` |
| Preview SHA | **not deployed** — no Vercel access in this environment |
| Production SHA | **not deployed** — promotion requires the browser + SHA gates |
| Scoring version | `relay_decision_v3.3.0` |
| Buyer-intent version | `buyer_intent_v5` |
| Supabase project | `fhnkanwvgamitrcuzpem` (org `bpulse`) |

---

## Bugs

### BUG-001 — Sidebar / authenticated navigation performance

- **Root cause (verified, not the QA hypothesis).** Three separate waterfalls:
  1. `getAuthContext()` ran org role → team memberships → capabilities as three
     sequential Supabase round-trips.
  2. `TodayPage` awaited `getAuthContext()` and only then
     `loadAccountabilityDashboard()` — a fourth sequential round-trip on every
     Today load.
  3. `loadAccountabilityDashboard()` ran six sequential reads for the admin
     Command Center (reps, assignments, identities, targets, accountability,
     day closes), and six more for the rep path.
- **Fix.** Two waves in `getAuthContext` (role + memberships, then
  capabilities); `authCtx` and the accountability snapshot now load together;
  the dashboard loader runs independent reads in parallel (5 + 1 for admin,
  1 + 4 + 1 for rep).
- **Files.** `src/lib/auth/organization.ts`, `src/app/(app)/dashboard/page.tsx`,
  `src/lib/relay/dashboard-loader.ts`.
- **Measurement.** `scripts/qa/perf-navigation-probe.mjs` against the local dev
  server and the seeded production account. Dev-mode numbers include
  compilation and are **not** a production benchmark; they show the shape.
- **Status.** `FIXED_STRUCTURAL_MEASURED_DEV` — production latency still needs a
  preview measurement (see Performance).

### BUG-002 — Scoring / explanation coherence

- **Root cause.** Two gaps remained after the earlier `START_CTX` fix:
  1. `buildNegativeSignals` derived "No verified buyer request" from a dimension
     share, so a HIGH / verified canonical intent could be shown next to it.
  2. The positive signal ignored the canonical intent entirely.
- **Fix.** Both signal builders read the canonical `buyerIntent` record
  (`buyerIntentLevel`, `verifiedBuyerRequest`) first; the negative signal is
  suppressed for a HIGH or verified request. The existing `VerifiedBuyerIntent`
  already carries `effectiveBuyerProbability`, `claims.modelBuyerProbability`,
  `contradictions` and `evidence` — the provenance the contract asks for.
- **Files.** `src/components/lead-workspace-simple.tsx`.
- **Unit.** `tests/qa-relay-bug-002-decision-coherence.test.ts` (3).
- **Status.** `FIXED_UNIT`.

### BUG-006 — Location extraction

- **Root cause (two, both data/rule gaps, not parser gaps).**
  1. `looksLikePlace` counted England *and* United Kingdom as two countries, so
     "Manchester, England, United Kingdom" was rejected.
  2. The known-place set lacked `Punjab`, `NY`, `Deutschland`, `München`; a
     single named city ("London") was rejected because the rule required 2+
     comma parts.
- **Fix.** Sovereign-state de-duplication (England/Scotland/Wales/NI → UK),
  administrative sub-regions, aliases, and a single-known-city rule. "Remote"
  still invents no country.
- **Files.** `src/lib/leads/targeting-pure.ts`.
- **Unit.** `tests/qa-relay-bug-006-015-016-identity.test.ts` (matrix through the
  canonical boundary + `extractStatedLocation`).
- **Status.** `FIXED_UNIT`.

### BUG-008 — Invite / signup contract

- **Root cause.** `/api/signup` created the organisation before the auth user,
  returned one generic message for every failure, and never created the
  canonical `organization_roles` OWNER row (so the first owner resolved as a
  plain ADMIN through the legacy fallback).
- **Fix.** Auth user first, then org → rulebook → rep → OWNER role, with full
  compensation on every failure. Distinct codes: `INVITE_REQUIRED`,
  `INVITE_INVALID`, `SIGNUP_DISABLED`, `EMAIL_ALREADY_REGISTERED`,
  `ORG_CREATION_FAILED`, `MEMBERSHIP_CREATION_FAILED`, `ROLE_ASSIGNMENT_FAILED`,
  `RATE_LIMITED`, `SUCCESS`. The client maps each code to an actionable message.
- **Files.** `src/app/api/signup/route.ts`,
  `src/lib/auth/error-messages.ts`, `src/components/auth/signup-experience.tsx`.
- **Unit.** `tests/qa-relay-auth-lifecycle.test.ts`.
- **Status.** `FIXED_UNIT`.

### BUG-009 — Google OAuth capability

- **Root cause.** `googleEnabled` was derived from an env flag alone. The flag is
  an operator opt-in, not proof the provider is enabled.
- **Fix.** `getRuntimeAuthCapabilities()` probes `GET /auth/v1/settings` (2s
  timeout, 5-minute cache) and renders Google only when the env opt-in **and**
  the live provider agree. Fails closed. Password reset is gated the same way.
- **Files.** `src/lib/auth/capabilities.ts`, `login/page.tsx`, `signup/page.tsx`.
- **Unit.** `tests/qa-relay-auth-lifecycle.test.ts` (disabled / enabled / probe
  failure).
- **Status.** `FIXED_UNIT`.

### BUG-011 — Recruiter semantics

- **Root cause.** Already correct at baseline (`recruiterOnly` fails buyer intent
  closed; `RECRUITER` is its own relationship role; a recruiter with a verified
  external request is a BUYER).
- **Verification.** Existing `tests/qa-relay-bug-011-recruiter-role.test.ts`
  covers all four cases: hiring employee, recruiter buying outside help,
  candidate, service agency.
- **Status.** `REGRESSION_PASS`.

### BUG-013 — Score vs sender match UI

- **Root cause.** The opportunity ring had no visible label while sender
  percentages sat in the same panel; the sender header said only "Sender".
- **Fix.** Visible "Opportunity score" label under the ring; the panel is
  "Sender match"; the active line reads "N% sender match". No scoring change.
- **Files.** `src/app/(app)/prospect/page.tsx`.
- **Unit.** `tests/qa-relay-bug-013-sender-score-separation.test.ts` (ranking and
  best match are invariant to the selected sender; the routing result carries no
  opportunity score; the lead context is not mutated).
- **Status.** `FIXED_UNIT`.

### BUG-014 — Inbound save / create lead

- **Root cause.** The server was already correct (persist first, stable
  idempotency key, recoverable retry, 503 `incomplete` + `leadId` when the
  conversation cannot be initialised). The **client** turned that 503 into
  "Lead was not created" — a false negative for a lead that was saved.
- **Fix.** The client treats `incomplete === true` with a `leadId` as saved:
  it sets the saved id, navigates to it, and shows the retry-to-repair message.
- **Files.** `src/components/inbound/inbound-desk.tsx`.
- **Integration.** `tests/inbound-lead-route.integration.test.ts` (20 with the
  analyze route).
- **Status.** `FIXED_UNIT`.

### BUG-015 — Lowercase surname

- **Root cause.** None found: the canonical prose reader already accepts a
  lowercase surname and particles/apostrophes/hyphens.
- **Verification.** `tests/qa-relay-bug-006-015-016-identity.test.ts` pins
  "Usama jamil", "Usama Jamil", van der Meer, de la Cruz, O'Connor, Smith-Jones.
- **Status.** `REGRESSION_PASS`.

### BUG-016 — Markdown LinkedIn identity / current employer

- **Root cause (three).**
  1. Markdown (`###`, `**`, bullets, links) was never stripped before identity
     extraction, so `### **Oliver Haines – CertRP**` produced no name.
  2. A credential suffix made the line fail the "2–4 capitalized words" rule.
  3. `isLikelyCompanyName` used substring role matching, so
     "Nexora **Talent** Solutions" was rejected as a job title and the extractor
     fell through to a **previous** employer (Robert Walters).
- **Fix.** `stripMarkdownFormatting` in the canonical boundary (used by both
  `normalizeProspectPaste` and `normalizeExternalWhitespace`); credential
  stripping before name validation; first-word role matching so a company may
  contain a role word.
- **Files.** `src/lib/prospect/paste-normalize.ts`,
  `src/lib/intelligence-v3/normalize-external-input.ts`,
  `src/lib/intelligence-v3/bridge.ts`.
- **Unit.** `tests/qa-relay-bug-006-015-016-identity.test.ts` (four name forms,
  current vs previous employer, company containing a role word).
- **Status.** `FIXED_UNIT`.

### Regression guards (must stay green)

| Bug | Test | Status |
| --- | --- | --- |
| BUG-004 conversation dedupe | `qa-relay-bug-004-duplicate-inbound.test.ts` | PASS |
| BUG-007 Upwork score only after Extract | `qa-relay-bug-007-upwork-extract-deterministic.test.ts` | PASS |
| BUG-010 inbound identity | `qa-relay-input-normalization.test.ts` | PASS |
| BUG-012 connection-note + save | `qa-relay-bug-012-skip-draft-state.test.ts` | PASS |

---

## Auth

| Area | Status | Evidence |
| --- | --- | --- |
| AUTH MODE | **INVITE_ONLY** (product contract) | `getAuthCapabilities`; signup disabled without an invite code |
| EMAIL LOGIN | PASS | existing login flow; capability-gated |
| INVITE FLOW | **IMPLEMENTED** | `POST /api/admin/invitations` + `app_metadata` + callback provisioning |
| PUBLIC SIGNUP | OFF unless `SIGNUP_PUBLIC=true` | mutually exclusive with invite-only |
| EMAIL CONFIRMATION | handled | signup returns `requiresEmailConfirmation`; callback exchanges the code |
| PASSWORD RESET | capability-gated | `passwordResetEnabled`; `/forgot-password` exists |
| GOOGLE OAUTH | capability-gated on the live provider | `getRuntimeAuthCapabilities` |
| CALLBACK | PASS (unit) | same-origin only, query preserved, open redirects rejected |
| ORG CREATION | atomic with compensation | signup route |
| MEMBERSHIP | single, idempotent | `reps.auth_user_id` unique; upsert role |
| ROLE ASSIGNMENT | OWNER on signup; invited role from metadata | `organization_roles` |
| REP/PERSON CREATION | at signup or invite acceptance | callback provisioning |
| ONBOARDING | persists + resumes | `relay-onboarding-experience` (localStorage draft, `/api/onboarding`) |
| SESSION REFRESH | existing | Supabase SSR cookies |
| LOGOUT | existing | `signOut` clears the session |
| RLS | org-scoped | `current_org_id()` policies on leads/messages/reps |
| CROSS-ORG DENIAL | PASS (policy) | RLS + explicit org checks in the inbound routes |
| MOBILE | not re-verified this pass | existing responsive primitives |

**Invite design.** The pending invitation lives in Supabase `app_metadata`
(admin-only, not user-editable). The callback reads it, provisions the rep and
`organization_roles` row exactly once (unique `auth_user_id`; idempotent
`organization_id, person_id` upsert), and sends the member to onboarding. No
invitation metadata → sign out + `no_workspace`. No new table, no DDL.

---

## Performance

Cold authenticated render, local **dev** server, seeded production account
(`scripts/qa/perf-navigation-probe.mjs`). These numbers are not a production
benchmark: dev includes compilation, the machine was running several other
worktrees, and the probe's second pass is the warm one.

| Route | Before (dev log, quiet) | After (dev, loaded) |
| --- | --- | --- |
| Today (`/dashboard`) | 8.6s / 11.7s / 9.5s | 42.8s / 21.9s (TTFB 8.4s) |
| Leads | — | timed out at 45s |
| Chats | — | 17.4s / 8.4s (TTFB 7.3s) |
| Prospect | — | 5.4s / 6.7s (TTFB 6.4s) |
| Studio | — | aborted |
| Admin QA | — | browser closed |

**Do not read this as a before/after delta.** The two runs happened under very
different machine load, and the dev server compiles on first visit. What the
code change guarantees is structural: the sequential round-trips are gone
(3 → 2 waves in `getAuthContext`, 2 → 1 on Today, 6 → 2 in the admin loader,
7 → 3 in the rep loader). A credible BEFORE/AFTER needs the same quiet preview
build measured twice; that is the outstanding item for BUG-001.

---

## Verification

| Gate | Result |
| --- | --- |
| TYPECHECK (`tsc --noEmit`) | PASS |
| LINT (`eslint .`) | 0 errors / 805 warnings (identical to the pre-existing baseline) |
| BUILD (`next build`) | PASS |
| FULL TESTS | **264 files / 3978 tests / 0 failed** |
| PRODUCT CONTRACTS | 41 passed |
| RELEASE GATE LOGIC | PASS (AUTH_ONBOARDING_GATE is now a required gate) |
| BROWSER GATE | **NOT RUN** — running the mutating browser matrix against the production Supabase would create real leads; no isolated preview exists |
| BUG004_INBOUND_GATE | **NOT RUN** — same reason |
| AUTH_ONBOARDING_GATE | **NOT RUN** — needs a live invitation email + callback on a preview domain |
| SHA GATE | **NOT VERIFIED** — no deployment |
| PRODUCTION SMOKE | **NOT RUN** — no deployment |

### Exact reasons for the blocked gates

1. **No preview deployment.** Vercel CLI access is denied for this team, so no
   isolated environment exists. Running the browser matrix against the local
   server means running it against the **production** database.
2. **Mutating specs.** The browser suite seeds inbound leads and messages. The
   project just completed a production test-data cleanup; re-seeding production
   would undo it.
3. **Invitation email.** A full invite E2E needs Supabase email delivery and an
   allowed redirect URL on the preview domain. Neither can be configured from
   this environment (no management token).
4. **SHA parity.** `/api/version` only reports a SHA for a Vercel build; the dev
   server reports `null`.

---

## Files changed

- `src/lib/auth/organization.ts` — two-wave auth context
- `src/app/(app)/dashboard/page.tsx` — parallel auth + accountability
- `src/lib/relay/dashboard-loader.ts` — parallel independent reads
- `src/components/lead-workspace-simple.tsx` — canonical-intent signal gating
- `src/lib/leads/targeting-pure.ts` — location rules
- `src/lib/prospect/paste-normalize.ts` — Markdown stripping
- `src/lib/intelligence-v3/normalize-external-input.ts` — Markdown at the boundary
- `src/lib/intelligence-v3/bridge.ts` — names, credentials, current employer
- `src/app/(app)/prospect/page.tsx` — Opportunity score / Sender match labels
- `src/components/inbound/inbound-desk.tsx` — no false "not created"
- `src/lib/auth/capabilities.ts` — runtime provider probe, password reset
- `src/lib/auth/error-messages.ts` — actionable signup codes
- `src/lib/auth/invitations.ts` — invitation contract
- `src/lib/auth/invitations-server.ts` — idempotent provisioning
- `src/app/api/admin/invitations/route.ts` — invite API
- `src/app/auth/callback/route.ts` — safe redirect + invite acceptance
- `src/app/api/signup/route.ts` — atomic signup + codes
- `src/components/admin/invite-person-dialog.tsx` — invite UI
- `src/components/admin/people-view.tsx` — wire the invite UI
- `scripts/qa/release-gates.mjs` — `AUTH_ONBOARDING_GATE`
- `scripts/qa/qa-release.mjs`, `qa-production-release.mjs`, `release-manifest.mjs`
- `scripts/qa/perf-navigation-probe.mjs` — measurement
- tests: `qa-relay-bug-002-decision-coherence`, `qa-relay-bug-006-015-016-identity`,
  `qa-relay-bug-013-sender-score-separation`, `qa-relay-auth-lifecycle`,
  `qa-relay-auth-invitations`, `qa-relay-release-gate` (updated)

---

## Final verdict

| Area | Verdict |
| --- | --- |
| BUG-001 | PASS (structural) / production measurement outstanding |
| BUG-002 | PASS |
| BUG-006 | PASS |
| BUG-008 | PASS |
| BUG-009 | PASS |
| BUG-011 | PASS |
| BUG-013 | PASS |
| BUG-014 | PASS |
| BUG-015 | PASS |
| BUG-016 | PASS |
| BUG-004/007/010/012 | PASS |
| AUTOMATED_CODE_GATE | PASS |
| BROWSER_GATE | NOT RUN (production-data safety) |
| BUG004_INBOUND_GATE | NOT RUN |
| AUTH_ONBOARDING_GATE | NOT RUN |
| SHA_GATE | NOT VERIFIED |
| PRODUCTION_SMOKE | NOT RUN |

**FINAL VERDICT: NO-GO for production promotion** — the code gates are green and
the release candidate is ready to deploy, but the absolute gate requires browser
acceptance, `tested SHA == deployed SHA`, and a production smoke. None of the
three can be performed without an isolated preview and deployment access. This
is a deployment blocker, not a code blocker.
