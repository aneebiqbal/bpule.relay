# RELAY + STUDIO — MASTER ISSUE LEDGER

**Audit Date:** 2026-0-29
**Total Issues:** 61 (10 P0, 18 P1, 25 P2, 8 P3)

---

## P0 — CRITICAL

| ID | Area | Feature | Summary | Root Cause | Affected Code | Security/Data Risk | Status |
|----|------|---------|---------|------------|---------------|-------------------|--------|
| P0-01 | Auth | Admin access | Stale `reps.role` overrides `organization_roles` — demoted users retain admin | `organization.ts:68-73` falls back to `reps.role === 'admin'` when table says MEMBER | `src/lib/auth/organization.ts:68-73`, `src/lib/auth/admin-page.ts:7` | Privilege escalation | OPEN |
| P0-02 | Auth | Account deletion | No session revocation after account deletion — deleted users' cookies valid until natural expiry | `account/delete/route.ts` calls `admin.deleteUser()` but never calls `admin.signOut()` | `src/app/api/account/delete/route.ts:41,57` | Session hijack after deletion | OPEN |
| P0-03 | Auth | Signup | Rate limiter fails open on DB errors — unlimited signups during any DB issue | `signup/route.ts:42-44` returns `false` (not rate limited) on query error | `src/app/api/signup/route.ts:42-44` | Abuse, cost explosion | OPEN |
| P0-04 | AI | Evidence fabrication | Scoring dimensions injected as BUYER_INTENT evidence in ledger | `orchestrator.ts:383-398` creates evidence entries from scoring dimension labels | `src/lib/intelligence-v2/orchestrator.ts:383-398` | Misleading evidence display | OPEN |
| P0-05 | AI | Evidence fabrication | AI's null probableNeed always overridden with fabricated statement | `extraction-pipeline.ts:1009-1011` forces fallback when AI returns null | `src/lib/intelligence-v2/extraction-pipeline.ts:1009-1011` | Fabricated prospect needs | OPEN |
| P0-06 | Onboarding | Studio redirect | Studio onboarding never creates voice profile → infinite redirect loop | `/api/content/onboarding/complete` creates ContentPersona but never calls `setVoiceProfile()` | `src/app/api/content/onboarding/complete/route.ts:62-141` | Users stranded post-onboarding | OPEN |
| P0-07 | Navigation | Admin route | `/admin` has loading.tsx but no page.tsx — route is broken | Missing `src/app/(app)/admin/page.tsx` | `src/app/(app)/admin/loading.tsx` exists, no page | Admin 404 | OPEN |
| P0-08 | AI | Score inflation | ~31-point score floor with zero evidence — every profile scores 31-40 | Accumulated baselines across 8 scoring dimensions | `src/lib/intelligence-v2/scoring-engine.ts:359,479,534,575,609,638,673` | Meaningless qualification scores | OPEN |
| P0-09 | Pre-existing | Signup | Service role key JWT corrupted — all service-role ops fail | Corrupted `exp` field in JWT | `.env.local` SUPABASE_SERVICE_ROLE_KEY | Signup, cron, org deletion broken | OPEN |
| P0-10 | Pre-existing | Security | `refresh_few_shot_wins` accepts any org ID without membership verification | RPC lacks org membership check | `src/lib/ai/few-shot.ts` → RPC | Cross-org data access | OPEN |

---

## P1 — HIGH

| ID | Area | Feature | Summary | Root Cause | Affected Code | Status |
|----|------|---------|---------|------------|---------------|--------|
| P1-01 | Auth | Session | Session refresh silently fails in RSC — users get unexpected 401s | `server.ts:33-42` cookie write fails in RSC, error silently caught | `src/lib/supabase/server.ts:33-42` | OPEN |
| P1-02 | Auth | Login | 1.2s timeout too aggressive — false "cookie blocked" errors on slow networks | `login-experience.tsx:37-50` polls only 8×150ms | `src/components/auth/login-experience.tsx:37-50` | OPEN |
| P1-03 | Auth | Workspace | `_userId` parameter in workspace auth is dead — gives false sense of per-user auth | `workspace.ts:72,88` accepts but never validates `_userId` | `src/lib/auth/workspace.ts:72,88` | OPEN |
| P1-04 | Data | Store | `listAllReps()` and `listAllProfiles()` lack org filter — cross-org leak if RLS fails | No `.eq('organization_id')` in query | `src/lib/store/supabase-store.ts:1482,1571` | OPEN |
| P1-05 | Data | Store | `deleteFact/Play/ProofItem/GoldenCase` lack org filter — admin in org A can delete org B records | Only `.eq('id', id)` filter | `src/lib/store/supabase-store.ts:1446,1477,1722,2161` | OPEN |
| P1-06 | AI | Conversation | Copilot ignores calibrated voice card — replies don't match outbound voice | `copilot/index.ts` never accepts or uses StyleCard | `src/lib/ai/copilot/index.ts:39,112,146` | OPEN |
| P1-07 | AI | Persona | Voice is per-rep not per-profile — persona switching has no effect on voice | `getVoiceProfile()` queries by `rep_id` only | `src/lib/store/supabase-store.ts:1355-1372` | OPEN |
| P1-08 | AI | Forge | Winner returned in both candidate slots when `other` is null | `forge.ts:173-174` fallback assigns winner to loser slot | `src/lib/content/intelligence/forge.ts:173-174` | OPEN |
| P1-09 | AI | State | No connection rejection/timeout state — leads stuck in "Waiting for connection" forever | `relationship-state.ts:154-171` has no terminal state for rejected connections | `src/lib/relay/relationship-state.ts:154-171` | OPEN |
| P1-10 | AI | State | Any inbound message treated as reply requiring action — rejections, auto-replies misread | `relationship-state.ts:94-96` treats all inbound as conversational reply | `src/lib/relay/relationship-state.ts:94-96` | OPEN |
| P1-11 | Onboarding | Orphaned API | `/api/onboarding/complete` is dead code — never called from UI | `RelayOnboardingExperience` calls `/api/onboarding`, not `/api/onboarding/complete` | `src/app/api/onboarding/complete/route.ts` | OPEN |
| P1-12 | Navigation | Orphan routes | `/conversations` is unreachable — sidebar points to `/relay` | No nav link to `/conversations` | `src/components/app-rail.tsx` | OPEN |
| P1-13 | Navigation | Dead anchors | Landing nav links to section IDs that don't exist in component | `/#moves`, `/#studio`, `/#team`, `/#how-it-works` not in `convergence-landing.tsx` | `src/components/landing/landing-nav.tsx`, `src/components/marketing/marketing-nav.tsx` | OPEN |
| P1-14 | Admin | Command Center | Reads from empty `day_closes` system — shows all-zero stats | `dashboard-loader.ts` queries `day_closes` joined with `revenue_identity_contracts` (zero rows) | `src/lib/relay/dashboard-loader.ts` | OPEN |
| P1-15 | Pre-existing | Mobile | 3 mobile viewport E2E tests failing — responsive nav/tap targets | Mobile nav issues | `e2e/mobile.spec.ts` | OPEN |
| P1-16 | Pre-existing | Lead outreach | Lead outreach E2E form interaction failing — label selectors mismatch | Selector issues | `e2e/leads.spec.ts` | OPEN |
| P1-17 | Pre-existing | Reply/Studio | Reply API and studio quick-capture E2E assertions failing | Route/selector issues | `e2e/reply-conversation.spec.ts`, `e2e/studio.spec.ts` | OPEN |
| P1-18 | Pre-existing | Schema | `tailored_cvs` table missing in active Supabase project | Migration 0087 not applied | `supabase/migrations/0087_tailored_cv_persistence.sql` | OPEN |

---

## P2 — MEDIUM

| ID | Area | Feature | Summary | Root Cause | Affected Code | Status |
|----|------|---------|---------|------------|---------------|--------|
| P2-01 | AI | Routing | Two co-existing AI routing systems (Runtime V3 + legacy chain) | Both `src/lib/ai/runtime/` and `src/lib/ai/routing.ts` active | Multiple files | OPEN |
| P2-02 | AI | Taste | `shortVsDeep` taste dimension never learned — dead signal path | `applyDimensionalSignal` doesn't handle `wasShort` | `src/lib/content/intelligence/v2/taste.ts:122-135` | OPEN |
| P2-03 | AI | Forge | Escalation candidate C uses writer 'B' instead of fresh persona | `forge.ts:118` reuses 'B' persona | `src/lib/content/intelligence/forge.ts:118` | OPEN |
| P2-04 | AI | Forge | Candidate B generated before escalation decision gates it | `forge.ts:106` always generates B | `src/lib/content/intelligence/forge.ts:106` | OPEN |
| P2-05 | AI | Drafts | `generate-draft` creates drafts with no `topicClusterId` | `generate-draft/route.ts:223-236` doesn't pass cluster ID | `src/app/api/content/generate-draft/route.ts:223-236` | OPEN |
| P2-06 | AI | Taste | `generate-draft` ignores taste profile entirely | No taste loading in v1 generate route | `src/app/api/content/generate-draft/route.ts:101-113` | OPEN |
| P2-07 | AI | Taste | Taste signal double-counting across generate/feedback/post | Different idempotency keys for same journey | `v2/generate/route.ts:193-229`, `feedback/route.ts:47-96` | OPEN |
| P2-08 | AI | Ideas | Idea deduplication is title/prefix-only — misses paraphrases | `daily-ideas.ts:291-300` uses `title.toLowerCase().slice(0,40)` | `src/lib/content/daily-ideas.ts:291-300` | OPEN |
| P2-09 | AI | Ideas | Originality scoring excludes `hook_used` memories | `idea-engine.ts:170-171` only checks topic_covered/angle_used | `src/lib/content/intelligence/v2/idea-engine.ts:170-171` | OPEN |
| P2-10 | AI | Score | 8 points awarded for NOT_APPLICABLE/UNCLEAR remote eligibility | `remote-eligibility.ts:434-437` gives 8/20 for irrelevant/unclear | `src/lib/intelligence-v2/remote-eligibility.ts:434-437` | OPEN |
| P2-11 | AI | Score | 5-point baseline for opportunity fit with no evidence | `scoring-engine.ts:359` starts at 5 | `src/lib/intelligence-v2/scoring-engine.ts:359` | OPEN |
| P2-12 | AI | Score | 12 points for growth_signal without buyer evidence | `scoring-engine.ts:374-381` awards 12 for growth | `src/lib/intelligence-v2/scoring-engine.ts:374-381` | OPEN |
| P2-13 | AI | Persona | `sender_profile_id` stored but never used to pre-select profile | Draft route defaults to `profiles[0]` | `src/app/api/leads/[id]/draft/route.ts:98` | OPEN |
| P2-14 | AI | Persona | Content persona `voiceProfileId` is dead code — checked but never used for fetch | Routes check `persona.voiceProfileId` but call `getVoiceProfile()` (rep-keyed) | `src/app/api/content/generate/route.ts:115-120` | OPEN |
| P2-15 | AI | Calibration | `normalizeCard` silently drops `never_words`/`preferred_words` when AI returns empty | `calibrate.ts:171-177` no fallback to quiz seed for `source='both'` | `src/lib/style/calibrate.ts:171-177` | OPEN |
| P2-16 | AI | Inbound | Inbound reply only uses style card summary, not full card | `inbound/reply/route.ts:59` extracts only `.summary` | `src/app/api/inbound/reply/route.ts:59` | OPEN |
| P2-17 | Data | Store | `listFacts()`, `listPlays()` lack org filter | No `.eq('organization_id')` | `src/lib/store/supabase-store.ts:1404,1452` | OPEN |
| P2-18 | Data | Store | `updateLeadScore/Tags` lack org filter | Only `id` + `owner_rep_id` filter | `src/lib/store/supabase-store.ts:743,807` | OPEN |
| P2-19 | Data | DB | `current_org_id()` database function doesn't exist — no DB-level fallback | All security is application-layer | N/A | OPEN |
| P2-20 | Navigation | Orphans | `/activate`, `/manage-profiles`, `/resume/generate`, `/revenue/email`, `/workspace/[id]`, `/admin/ai-usage`, `/admin/growth` have no nav link | Missing from AppRail | `src/components/app-rail.tsx` | OPEN |
| P2-21 | State | Follow-up | Follow-up timer uses first DM date, not last outbound message | `relationship-state.ts:107-109` uses `lastDmMsg.sentAt` | `src/lib/relay/relationship-state.ts:107-109` | OPEN |
| P2-22 | State | Follow-up | `followupMaxUsed` hardcodes 3 instead of using shared constant | `relationship-state.ts:110` vs `message-eligibility.ts:51` | `src/lib/relay/relationship-state.ts:110` | OPEN |
| P2-23 | State | Follow-up | `followUpDueLabel` field declared but never populated | All return objects set it to `null` | `src/lib/relay/relationship-state.ts` | OPEN |
| P2-24 | Onboarding | Studio guard | `/api/content/onboarding/complete` has no voice-profile guard | Only checks auth, not `user.profile` | `src/app/api/content/onboarding/complete/route.ts:42-44` | OPEN |
| P2-25 | Auth | Signup | Cleanup references `organization_rulebooks` unconditionally during rollback | `signup/route.ts:139,160-168` | `src/app/api/signup/route.ts:139,160-168` | OPEN |

---

## P3 — LOW

| ID | Area | Feature | Summary | Root Cause | Affected Code | Status |
|----|------|---------|---------|------------|---------------|--------|
| P3-01 | AI | Quality gate | Persona-fit threshold 0.05 too permissive for non-technical roles | `quality-gate.ts:200-202` | `src/lib/content/quality-gate.ts:200-202` | OPEN |
| P3-02 | AI | Score | Non-buyers get 4/20 for opportunity fit despite "not buying" note | `scoring-engine.ts:346-355` | `src/lib/intelligence-v2/scoring-engine.ts:346-355` | OPEN |
| P3-03 | AI | Evidence | `deriveSignalEvidenceFallback` returns arbitrary raw text as signal evidence | `orchestrator.ts:717-721` | `src/lib/intelligence-v2/orchestrator.ts:717-721` | OPEN |
| P3-04 | Data | Store | `demoRevenueIdentities` use `org-demo` while `DEMO_ORG_ID` is different | Inconsistent demo constants | `src/lib/store/mock-store.ts` | OPEN |
| P3-05 | Auth | Login | Client-only cooldown on resend — bypassable via refresh/devtools | `signup-experience.tsx:107-115` | `src/components/auth/signup-experience.tsx:107-115` | OPEN |
| P3-06 | Auth | Callback | Open redirect potential via `next` parameter | `auth/callback/route.ts:41-42` | `src/app/auth/callback/route.ts:41-42` | OPEN |
| P3-07 | Navigation | Studio | `/studio/drafts/[id]` outside app shell — no sidebar | Standalone route with manual auth | `src/app/studio/drafts/[id]/page.tsx` | OPEN |
| P3-08 | Dead code | Timing | `timing-engine.ts` is decorative scaffolding with zero UI consumers | Built but never wired to components | `src/lib/relay/timing-engine.ts` | OPEN |
