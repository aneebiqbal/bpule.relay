# Relay Production Bug Bash — Ledger

## P0 (Critical: Security/Data Loss/Broken Core)

| ID | Severity | Journey | Root Cause | Fix | Regression Test | Verified |
|----|----------|---------|------------|-----|-----------------|----------|
| P0-01 | P0 | Auth/Signup | Service role key JWT is **corrupted** — `exp` field has garbage bytes (`Ioy...` instead of `MjE...`). All service-role ops fail with `Invalid API key`. Signup, cron, org deletion, adversarial test all broken. | Get fresh service role key from Supabase Dashboard → Settings → API, replace in .env.local | Signup new user → verify email → login | ❌ |
| P0-02 | P0 | Security | `refresh_few_shot_wins(p_org_id)` accepts any org ID without verifying caller membership. Created fix migration (0082) but cannot apply until service role key is fixed. | Migration 0082 adds: `IF p_org_id != current_org_id() THEN raise exception 'cross-org denied'` | Call RPC with different org ID → denied | ❌ (fix written, not applied) |

## P1 (Major: Wrong Result/Permission Failure)

| ID | Severity | Journey | Root Cause | Fix | Regression Test | Verified |
|----|----------|---------|------------|-----|-----------------|----------|
| P1-01 | P1 | Revenue Identity | `matchProofItems()` and `matchProofItemsByEmbedding()` used org-wide profile list — proof matching could return items from wrong Revenue Identity | ✅ FIXED: Both functions now accept optional `profileId` param. Draft route passes `profile?.id` to scope proof matching to selected identity. | Generate outreach for Fizza → verify only Fizza's proof items used | ⳽ (fix in code, needs build verification) |
| P1-02 | P1 | Security | Rate limiting is in-memory Map — won't work on serverless/Vercel | Use Redis/Upstash or Supabase-based rate limiter | Deploy to Vercel → verify rate limit works across instances | ❌ |

## P2 (Polish/Reliability)

| ID | Severity | Journey | Root Cause | Fix | Regression Test | Verified |
|----|----------|---------|------------|-----|-----------------|----------|
| P2-01 | P2 | Studio | `sanitizeContentCaption()` is typography cleanup, not security | Rename to reflect actual purpose, separate from security layer | N/A | ❌ |


## Additional Findings

| ID | Severity | Journey | Root Cause | Fix | Verified |
|----|----------|---------|------------|-----|----------|
| P1-03 | P1 | Inbound | `INBOUND_REPLY_SYSTEM` not exported from module | ✅ Added `export` keyword | ✅ |
| P1-04 | P1 | Build | `fetchLeadsAll` private in SupabaseStore but public in interface | ✅ Made public | ✅ |
| P1-05 | P1 | Build | Missing `listMessages`, `fetchLeadsAll`, `listAllProofItems` in mock-store | ✅ Added implementations | ✅ |
| P1-06 | P1 | Build | Lead type new fields (direction, source, inboundMessage, inboundRaw) were required but not always provided | ✅ Made optional with `?` | ✅ |

## Relay Hardening Sprint (Current)

| ID | Severity | Route / Workflow | Reproduction | Root Cause | Fix | Regression Test | Browser Retest | Status |
|----|----------|------------------|--------------|------------|-----|-----------------|----------------|--------|
| REL-FUNC-001 | P0 | `/prospect` Analyze | Paste semantically weak text and run analysis | Qualification pipeline always proceeded to scoring once extraction returned any shape | Added deterministic qualification gate (`inputQuality`, `extractability`, `evidenceCoverage`, `qualificationEligibility`) and blocked scoring when insufficient | `tests/prospect-qualification-gate.test.ts` | ✅ (smoke: long garbage input shows not-enough-info state) | ✅ Fixed |
| REL-FUNC-002 | P0 | `/prospect` Create Lead | Try creating lead after insufficient analysis | Save action did not enforce qualification eligibility server-side | Added server-side eligibility enforcement in `POST /api/prospect/save` and `POST /api/leads` (`422 NOT ENOUGH INFORMATION`) | `tests/prospect-qualification-gate.test.ts` | ✅ (button disabled after insufficient analysis) | ✅ Fixed |
| REL-FUNC-003 | P0 | Lead creation dedupe | Re-save same profile URL or same contact+company | Dedupe keyed mostly by company name; URL/contact collisions could slip and same-company contacts were hard-blocked with no override path | Added URL + company/contact hard-duplicate checks, potential-duplicate classification, existing lead metadata, and explicit `allowPotentialDuplicate` override path | `tests/lead-dedupe-guard.test.ts` | ⚠️ Partial (API/path verified, full auth role sweep pending) | ✅ Fixed (pending full role QA) |
| REL-FUNC-004 | P1 | `/prospect` duplicate UX | Duplicate conflict returned opaque error with no next action | Duplicate response lacked canonical lead ID in blocked flows | Return existing lead ID/company + `canCreateSeparate`; UI now offers `View existing` and `Create separate` | `tests/lead-dedupe-guard.test.ts` | ⚠️ Partial | ✅ Fixed |
| REL-FUNC-005 | P0 | Lead Detail (`/leads/[id]`) vs Prospect Check / Leads list / Today | Save a lead through Prospect Check (gets a canonical /100 score), then open it from the Leads list vs. open it directly at `/leads/[id]` | Lead Detail (`leads/[id]/page.tsx` → `LeadWorkspace`) unconditionally called the legacy `computeScore()` rubric (0-12 scale, different dimensions) and never read `lead.canonicalScore`/`scoreBreakdown`, even when canonical intelligence existed. Leads list, the Relay/Today queue, and the draft API already correctly preferred canonical — Lead Detail was the one outlier still producing an independently-recomputed, differently-scaled score, and the score ring literally hardcoded "out of 12" regardless of which score was shown. Root cause: no single shared "canonical → legacy display shape" bridge existed, so `draft/route.ts` had grown its own inline (partially correct) version while Lead Detail had none at all. | Added `canonicalToLegacyScoreResult()` in `src/lib/intelligence-v2/orchestrator.ts` as the one shared bridge from persisted canonical fields to the legacy `ScoreResult` UI shape; wired it into `leads/[id]/page.tsx` (was missing) and refactored `draft/route.ts` to use it instead of its own inline duplicate. Fixed `ScoreRing`/"out of 12"/Strong-Good-Fair-Weak thresholds in `lead-workspace.tsx` to be scale-aware (canonical shows /10 using canonical score bands; legacy leads keep /12). | `tests/canonical-score-surface-consistency.test.ts` | Static verification only — no live LinkedIn/browser retest yet (Phase 13 cross-surface pass still needed for Today/Revenue Intelligence/Email Outreach/Conversation views) | ✅ Fixed (Lead Detail); broader cross-surface sweep pending |
| REL-FUNC-006 | P0 | Deterministic extraction fallback — `constrainNonBuyerPassA` / clinician classifier | Paste ANY software job posting or profile whose text happens to contain the bare word "do" (e.g. "What you'll do:") | `isClinicianProfile()`'s `CLINICIAN_TITLE` regex included bare 2-letter medical credential abbreviations (`\bmd\b`, `\bdo\b`, `\brn\b`) matched case-insensitively. `constrainNonBuyerPassA()` feeds the *entire raw source text* into this check (not just the extracted title), so any ordinary use of "do" as a verb false-positived as a clinician profile, silently stripping `opportunity.signals` down to the clinician-allowed subset — zeroing out real `hiring`/`funding`/`explicit_ask` signals with no warning or error. Root-caused via `tests/intelligence-v2-benchmark.test.ts`'s "Founding Engineer — Series A SaaS" case scoring 42 instead of >=45. | Split `CLINICIAN_TITLE` into full-word patterns (safe against free text) and a separate abbreviation pattern requiring conventional credential formatting (`, MD` / `Dr. Name, MD`) instead of bare word-boundary matching. | `tests/role-signals.test.ts` | ✅ (unit-level; also fixes the benchmark case) | ✅ Fixed |
| REL-FUNC-007 | P1 | Deterministic extraction fallback — hiring signal detection | Paste a job posting that never uses the literal word "hiring" (e.g. titled "Senior Fullstack Engineer" with "What you'll do" / "Requirements" / "Apply" sections but no "we're hiring" phrasing) | `extractOpportunitySignals()`'s hiring-signal regexes only matched literal "hiring" near a role keyword, or specific "looking for a developer/engineer" phrasing — missed the common job-posting structure of title + role keyword + posting sections with no explicit "hiring" word. | Added a structural job-posting detector (tech-role title line + What-you'll-do/Responsibilities/Requirements section + Apply/Compensation mention) as an additional path to the `hiring` signal, reusing the existing negation-context guard (extended with a whole-document variant since structural matches have no single anchor index). | `tests/intelligence-v2-benchmark.test.ts` (Founding Engineer, Vercel-competitor cases) | ✅ | ✅ Fixed |
| REL-FUNC-008 | P2 | Deterministic extraction fallback — hybrid/onsite location extraction | Job posting states `Location: San Francisco, CA (hybrid)` without an "in/at/from" preposition immediately before the city | Office-location regex in `assessRemoteEligibility()` only matched `(in\|at\|from) City, ST` narrative phrasing, missing the very common structured `Location: City, ST` job-posting field format, so hybrid/onsite roles with this format stayed `UNCLEAR` instead of correctly resolving to `INELIGIBLE`. | Added a second pattern matching the `Location:` field format alongside the existing narrative-phrasing pattern. | `tests/intelligence-v2-benchmark.test.ts` (Hybrid — San Francisco case) | ✅ | ✅ Fixed |
| REL-FUNC-009 | P3 | Test fixture — `tests/intelligence-v2-benchmark.test.ts` | N/A (test-only) | "Founding Engineer — Series A SaaS" fixture used `rawtext:` (lowercase) instead of `rawText:`, so `client.rawText` was `undefined` and the case ran against empty input. | Corrected the field name. | N/A (fixture correction, not production code) | ✅ | ✅ Fixed |
| REL-FUNC-010 | P2 | Lead Detail (`/leads/[id]`) — score display | Open a post-canonical lead with a legacy fallback threshold copy path | After REL-FUNC-005 made `score.total` correctly hold the canonical 0-100 value, `LeadWorkspace`'s "not eligible for drafting" message still hardcoded `Scored {score.total}/12`, producing nonsensical output like "Scored 47/12" — matches the user-reported "9 out of 12 — Good / Scored 9/12" mismatch against a canonical score of 47. | Made the denominator scale-aware (`/100` when `currentLead.canonicalScore` is present, `/12` otherwise), matching the pattern already used for the score ring above it. | `tests/canonical-score-surface-consistency.test.ts` (asserts the underlying invariant: `total` is always the true canonical value, never silently rescaled) | ✅ | ✅ Fixed |
| REL-FUNC-011 | P1 | Cross-surface messaging policy — Lead Intelligence vs Lead Detail | Save a lead whose relevant-change signal (e.g. growth/launch/migration) resolves to `CONNECT_OR_OBSERVE`; open it on Prospect Check vs Lead Detail | Both surfaces independently build a `RevenueStrategy` for a *different channel* (`analyze/route.ts` uses `channel:'connection'`, `lead-workspace.tsx`'s snapshot strip uses `channel:'dm'`). For a `RELEVANT_CHANGE` reason, `messageRecommended` legitimately differs by channel (a connection note is fine, forcing a DM is not) — both outcomes are individually correct, but both were displayed as the bare shared enum `CONNECT_OR_OBSERVE` / generic "no message" text with no indication they answered different questions, so the product presented them as contradictory instructions for the same lead. | Added `MessagingPolicy` (`CONNECT_WITH_NOTE` / `CONNECT_WITHOUT_NOTE` / `OBSERVE` / `DM` / `EMAIL` / `UPWORK_PROPOSAL` / `FOLLOW_UP` / `REPLY` / `RESEARCH_MORE` / `SKIP`) and `deriveMessagingPolicy(contact, channel)` — a pure, channel-explicit derivation from the *same* `ContactDecision` every surface already computes (no change to the underlying decision logic, only how it's labeled). Added to `RevenueStrategy`/`RevenueLoopSnapshot`, wired into both the Prospect Check chip (labeled "Connection") and the Lead Detail strip (labeled "DM"), so the same lead can show two different, self-describing, individually-correct policies without reading as a contradiction. | `tests/messaging-policy-consistency.test.ts` | Static verification only — no live browser retest yet | ✅ Fixed |

## Final Hardening Results

### Tests
- **Unit/Integration: 585 passed / 0 failed** (29 test files)
- **E2E (desktop-chrome, demo mode): 108 passed / 11 failed**
- **Production build: PASS**

### Change Summary
- 28 modified files, 17 new files
- ~2,965 insertions, ~583 deletions

### Passing Critical Paths
- Smoke: 7/7 (onboarding, dashboard, navigation, routes)
- Prospect: 10/10 (input validation, garbage rejection, secret blocking, save flow, double-click protection)
- Leads: list/detail, search/filter, contact, draft buttons
- Studio: page render, content creation, drafts list, empty state, library
- Navigation: deep links, history, routing, cmd+k, back/forward, refresh
- Adversarial: XSS, SQL injection, unicode, long words, null bytes, HTML entities, rapid submit, multi-tab, network failure
- Secondary: upwork, inbound, search, facts, archive, onboarding, usage, account, assigned profiles

### Remaining E2E Failures (11)
- Mobile viewport (3): responsive nav, bottom nav clickability, tap targets
- Lead outreach form (2): new-lead form label selectors, duplicate conflict display
- Cross-feature (1): lead detail state persistence
- Reply/API (1): inbound reply route response assertion
- Studio (2): quick capture area selector, daily content route
- API direct (1): prospect analyze accepts valid input
- Lead detail (1): action buttons selector

## Remaining Blockers

| ID | Severity | Blocker | Impact |
|----|----------|---------|--------|
| REL-BLOCK-001 | P1 | Mobile viewport tests failing (3) — responsive nav/tap targets need verification. | Mobile QA incomplete. |
| REL-BLOCK-002 | P1 | Lead outreach E2E form interaction failing — label selectors may not match actual form. | Lead creation via /leads/new not fully browser-verified. |
| REL-BLOCK-003 | P1 | Reply API and studio quick-capture E2E assertions failing. | Reply/studio paths need selector/route fixes. |
| REL-BLOCK-004 | P2 | Existing repo-wide ESLint debt (43 errors, 189 warnings) pre-existing. | Prevents clean `pnpm lint` gate. |

## Team Bug Bash — Production Acceptance Gate (Current)

Reported by the real team using the application. Baseline: `a301371` (see `RELAY_TEAM_BUG_BASH_BASELINE.md`). Status column uses REPRO (reproduced against real code before fixing) / ROOT-CAUSED / FIXED / VERIFIED (unit+integration) / BROWSER (real Playwright E2E) / LIVE-BLOCKED (would need a live AI provider or live browser session this sandbox doesn't have, flagged not glossed over).

| ID | Severity | Reported | Status | Notes |
|----|----------|----------|--------|-------|
| TEAM-001 | P0 | Today section not showing updates/progress | CONDITIONAL PASS (root-caused, fixed, integration-tested; browser/DB acceptance proof outstanding) | Real gap in Upwork accountability — see detail below. |
| TEAM-002 | P0 | Same lead shows different scores internal vs external | Investigating | Likely overlaps REL-FUNC-005 (fixed) — auditing whether other consumers still diverge. |
| TEAM-003 | P0 | Creating a draft pollutes timeline/accountability | Root-caused, fixed (real finding differs from literal report) | See TEAM-003 detail below. |
| TEAM-004 | P0 | Prospect summary (HIGH/CONTACT NOW) disagrees with Detail (no evidence, score 0) | Investigating | Likely same class as REL-FUNC-004/005 surface-consistency work — verifying. |
| TEAM-005 | P0 | Score changes across reanalysis (60→25→20) | Investigating | Overlaps input-hash reuse work (Phase 6) — migration not yet applied to live DB, flagged. |
| TEAM-006 | P0 | Generate Lead 75+ returns nothing, UI goes blurry | Investigating | Client state / loading-overlay / error-boundary trace required. |
| TEAM-007 | P1 | Follow-up / Reply sections do not open | Investigating | Full journey trace, not just click handler. |
| TEAM-008 | P1 | 100% confidence shown alongside "Not Enough Info" contradiction | Investigating | Confidence vs qualification-eligibility semantics audit — not a numeric-equality fix. |
| TEAM-009 | P2 | Feature request: visibility into saved/connected/DM-due leads | Investigating | Use canonical Lead + event/Next Action architecture, no new CRM subsystem. |
| TEAM-010 | P2 | Feature request: standalone Email action control | Investigating | Build on Email Outreach V1; overlaps Daria fixture's prepare/send decoupling (already fixed). |

### TEAM-003 detail — Log Sent had no idempotency protection

**Reproduction against real code**: read `saveDraft()` vs `markContacted()` (`src/lib/store/supabase-store.ts`) end to end. `saveDraft()` inserts a `messages` row with `sent_text: null` and no `sent_at` — `countTodaysSends()`/`countTodaysSendsByTypes()` filter on `sent_at` via `.gte()`, which `NULL` never satisfies. **The literal "creating a draft counts as completed work" bug was NOT reproduced** — draft rows are correctly excluded from every accountability count and from Today's `daily_accountability.completed_count` (traced: `getDailyWorkspace` → `getMyTodayAccountability` → `daily_accountability` table, populated only by the `record_activity_event` RPC, called only from inside `markContacted`, never from `saveDraft`).

**What WAS found, real and unprotected**: `POST /api/leads/[id]/contact` (the actual "Log Sent" route for dm/connection/followup/reply) had **no idempotency key**, unlike Email Outreach V1's `sendPreparedEmail` (which already checks `idempotency_key` before doing anything — see `tests/email-prepare-send-api.integration.test.ts`'s "is idempotent on double-click" test, which only covers email). A double-click, network retry, or duplicate request against this route would:
1. Insert a second `messages` row with `sent_text` populated (no dedup check in `markContacted`'s insert).
2. Double-increment `daily_accountability.completed_count` via `record_activity_event` (called unconditionally per `markContacted` invocation, RPC itself has no idempotency key either — always `+1`).
3. Emit a second `OUTREACH_RECORDED` `relay_events` row — `emit_relay_event`'s own DB-level dedup (unique on `organization_id+source+source_event_id`) exists and works, but was defeated by the caller building `sourceEventId` with `${Date.now()}` in it, making every call's key unique regardless of whether it was a genuine retry.

Client-side, the Send button is disabled while `sending` (covers same-tab double-click) but nothing protected against a real network-level retry or a second tab — exactly what TEAM-003's own test list asks for ("double-click Log Sent → exactly 1 activity", "retry API → exactly 1 activity", "two tabs → exactly 1 activity").

**Fix**: added `idempotency_key` column + unique index to `messages` (migration `20260927000000_messages_idempotency_key.sql`, **written, not yet applied to the live DB**); `markContacted` now checks it first (before the daily-limit count, so a retry doesn't consume a ceiling slot) and returns the already-recorded result on a match, fail-open if the migration hasn't been applied; fixed `OUTREACH_RECORDED`'s `sourceEventId` to use the idempotency key (or the inserted message id) instead of `Date.now()`, so the existing DB-level event dedup actually works; client (`lead-workspace.tsx`) mints one key per distinct send attempt, reused across retries of the same text, regenerated on genuinely new text.

**Regression tests**: `tests/log-sent-idempotency.test.ts` (route-level: duplicate key is a no-op, different key is not treated as duplicate, missing key stays backward-compatible).

**Verified**: unit/integration (3 new tests, full suite 867/876 passing, same 9 pre-existing unrelated failures). **Not yet verified**: live browser double-click / two-tab / real network-retry proof (needs a live app session), migration not applied to live DB.

**Separate finding, not fixed (flagging, not silently dropping)**: `POST /api/accountability/event` (`src/app/api/accountability/event/route.ts`) is a second, entirely separate accountability-write mechanism with its own upsert-into-`daily_accountability` logic and its own weak idempotency (unconditional `completed_count + 1` on every call, no dedup at all). Grepped the whole app — **it is never called from anywhere**, i.e. dead code. Its own comment claims "Reps cannot fake this — it's triggered by actual system events," which nothing in the code actually enforces if it WERE wired up. Recommend either wiring it up properly (with the same idempotency-key discipline as the fix above) if it's meant to be used, or removing it — leaving working-but-unused, weakly-guarded, misleadingly-commented code in the codebase is itself a risk for a future engineer who wires it up trusting the comment. Not removed/fixed in this pass since it has zero current callers and isn't part of any TEAM-reported symptom — flagging for a product decision on which system is canonical going forward (this overlaps TEAM-002's "one canonical owner" mandate).

### relay.bpulse.dev/prospect "Create Lead does nothing" — traced to upstream extraction + missing UI explanation, NOT the qualification gate

**Explicit instruction followed**: did NOT weaken `hasKnownCompany()` (it correctly treats the literal fallback string `"Unknown company"` as "no company" — that's the gate doing its job). Two separate, real problems found and fixed instead:

1. **Upstream extraction gap (the actual root cause when a real company IS present in the source)**: `extractCompany()` only recognized "Title at Company" and (after an earlier fix this session) "Founder of Company" headline patterns. Stress-tested against plausible real-world LinkedIn phrasing (no live repro of the exact reported case was available — Bakary's literal source text was requested but not yet supplied) and found two more real gaps: comma-separated headlines ("CEO, CometHire" — at least as common as "at" in real exports) and About-section prose mentioning the company without any headline pattern at all ("I work for CometHire..."). Added both, each verified against a battery of ordinary prose (`for Q3 this year`, `at scale`, `with Passion and dedication`, etc.) to confirm they do NOT fabricate a company from generic capitalized text — a real false-positive was caught and rejected during development (a broader `\bfor\s+(...)` pattern grabbed "Q3 this year" as a company name; replaced with a narrower, verb-anchored, single-token-capture version). One genuinely hard case ("I lead recruiting operations for CometHire") is deliberately left unresolved rather than risk a fabrication — documented as a known gap in `tests/company-extraction.test.ts`, not silently patched over.

2. **UI honesty gap (independent of whether extraction succeeds)**: even when blocking Save/Create Lead is the CORRECT behavior (company genuinely not established), the button only relabeled to "Lead not eligible" with zero explanation of why or what to do — this is what a user experiencing a genuinely-blocked-for-good-reason lead would also describe as "nothing happens." Added an explicit panel showing the specific missing context (from `qualification.missingCritical`, e.g. "Missing: company context") and a clear next action (paste more of the source), so a legitimate block is distinguishable from a dead control.

`tests/company-extraction.test.ts` (7 tests: 2 positive extraction cases, 2 false-positive-guard cases, 1 pre-existing-pattern regression, 1 batch of 5 ordinary-prose non-fabrication checks, 1 documented-gap case). Full suite: same 9 pre-existing unrelated failures, no regressions (894 total). Typecheck and build clean.

**Not yet verified**: live browser proof against the actual reported case (no source text supplied yet), and whether this specific extraction gap is even what Bakary's real profile hit — flagged, not assumed.

### TEAM-001 detail — Upwork applications never incremented accountability

**Trace performed** (canonical event → persistence → accountability aggregation → Today API → Today UI): `dashboard/page.tsx` → `loadRepWorkspaceData` → `getDailyWorkspace()` (`src/lib/auth/workspace.ts`) → `store.getMyTodayAccountability()` → reads `daily_accountability.completed_count`. Traced every write path into that table.

**Confirmed correct**: DM, connection, follow-up, reply, and **email** (Email Outreach V1's `sendPreparedEmail` correctly calls `store.markContacted(..., 'email', ...)`) all route through `markContacted()`, which calls the `record_activity_event` RPC for every active matching `daily_targets` row, incrementing `daily_accountability.completed_count` transactionally (DB-level `on conflict ... do update`).

**Confirmed broken**: `markUpworkApplied()` — the single call site for `POST /api/upwork/jobs/[id]/apply`, the only "log Upwork application" action in the app — wrote directly to `upwork_jobs.status` and inserted into `upwork_messages`, and **never called `record_activity_event` at all**. Since `UPWORK_PACK` (`src/lib/accountability/default-targets.ts`) assigns both an `application` (10/day) and a `proposal` (10/day) target to every Upwork-channel Revenue Identity, a rep logging real Upwork applications all day would see Today's progress bar for that channel stay at 0/10 regardless of actual work completed — a precise, literal match for "Today section is not showing updates/progress."

**Fix**: added the same `record_activity_event` increment pattern `markContacted()` already uses, crediting only the `application` activity type (not also `proposal` — one real action must credit exactly one target, not two, to avoid a different accountability-integrity bug of double-counting). Non-fatal on RPC failure, matching the existing pattern exactly.

**Note**: the mock/demo store's `getMyTodayAccountability()` returns hardcoded synthetic numbers (`t.activityType === 'dm' ? 22 : ...`) regardless of real actions — architecturally fine for a demo fixture, not touched, and not the cause of the reported bug (confirmed the live `relay.bpulse.dev` environment runs the real Supabase-backed store, not demo mode).

`tests/upwork-accountability.test.ts` (3 tests, direct integration against `SupabaseStore` + a fake Supabase client asserting the actual RPC call args). Full suite: same 9 pre-existing unrelated failures, no regressions (897 total). Typecheck and build clean.

**Status: CONDITIONAL PASS.** Root-caused and fixed at the code/API/DB level with integration-test proof of the RPC call. Not yet verified: full browser journey (log an Upwork application → refresh Today → see the count increment) against a live session, per the outstanding TEAM-001/002/004/005 acceptance matrix still owed.
