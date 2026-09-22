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
