# RELAY + STUDIO — REMEDIATION BACKLOG

Ordered by root cause, grouped by theme. Each item includes scope, dependencies, acceptance criteria, and regression test requirement.

---

## P0 — MUST FIX BEFORE RELEASE

### Group A: Security & Access Control

| ID | Item | Scope | Dependencies | Acceptance Criteria | Regression Test |
|----|------|-------|--------------|---------------------|-----------------|
| P0-A1 | Fix stale `reps.role` privilege escalation | `organization.ts`, `admin-page.ts` | None | `reps.role` no longer grants admin access; `organization_roles` is sole source of truth | `tests/role-access.test.ts` + new test for demoted user |
| P0-A2 | Add session revocation on account deletion | `account/delete/route.ts` | None | After deletion, old session cookies are invalid | New integration test |
| P0-A3 | Fix rate limiter fail-open | `signup/route.ts` | None | DB errors result in rate-limited response; external rate limiter recommended | `tests/rate-limiter-fail-closed.test.ts` |
| P0-A4 | Fix corrupted service role key | `.env.local` | Supabase Dashboard | Signup, cron, org deletion work end-to-end | Manual verification |

### Group B: AI Integrity

| ID | Item | Scope | Dependencies | Acceptance Criteria | Regression Test |
|----|------|-------|--------------|---------------------|-----------------|
| P0-B1 | Remove evidence fabrication fallbacks | `extraction-pipeline.ts`, `orchestrator.ts` | Product decision: show "unknown" to users | AI's null probableNeed/trigger propagates as null; no invented needs | `tests/prospect-intelligence.test.ts` updated |
| P0-B2 | Fix score floor inflation | `scoring-engine.ts`, `remote-eligibility.ts` | None | Zero-signal prospect scores near zero; baselines removed | `tests/intelligence-v2-benchmark.test.ts` updated |
| P0-B3 | Remove scoring dimensions from evidence ledger | `orchestrator.ts:383-398` | P0-B1 | Evidence ledger contains only extracted facts, not scoring artifacts | `tests/canonical-score-surface-consistency.test.ts` |

### Group C: Product Blockers

| ID | Item | Scope | Dependencies | Acceptance Criteria | Regression Test |
|----|------|-------|--------------|---------------------|-----------------|
| P0-C1 | Fix Studio onboarding infinite redirect | `/api/content/onboarding/complete/route.ts` | Decision: auto-create voice profile or guard | Studio onboarding completes and redirects to reachable page | `tests/content-studio.test.ts` + new E2E |
| P0-C2 | Fix `/admin` missing page | `src/app/(app)/admin/page.tsx` | None | `/admin` redirects to `/admin/command-center` or renders admin home | Manual verification |
| P0-C3 | Fix `refresh_few_shot_wins` RPC org isolation | Migration 0082 | P0-A4 (service key) | RPC rejects cross-org calls | `supabase/tests/rpc-isolation-adversarial.ts` |

---

## P1 — MUST FIX FOR RELIABLE DAILY USE

### Group D: Session & Auth Reliability

| ID | Item | Scope | Dependencies | Acceptance Criteria | Regression Test |
|----|------|-------|--------------|---------------------|-----------------|
| P1-D1 | Fix RSC session refresh | `server.ts`, `proxy.ts` | Architecture decision: middleware vs proxy | Session refresh works during RSC streaming; no unexpected 401s | New integration test with near-expired token |
| P1-D2 | Increase login timeout | `login-experience.tsx` | None | 5s timeout with exponential backoff; differentiates slow server from cookie block | Manual testing on slow network |
| P1-D3 | Add voice profile to conversation copilot | `copilot/index.ts` | None | Reply drafts use sender's calibrated voice card | `tests/conversation-workspace.test.ts` + quality review |

### Group E: Data Integrity

| ID | Item | Scope | Dependencies | Acceptance Criteria | Regression Test |
|----|------|-------|--------------|---------------------|-----------------|
| P1-E1 | Add org ID filters to store methods | `supabase-store.ts` (12 methods) | None | All queries include `.eq('organization_id', this.orgId)` | `supabase/tests/rls-adversarial.ts` expanded |
| P1-E2 | Implement `current_org_id()` DB function | New migration | P0-A4 | Database-level tenant isolation fallback | `supabase/tests/rpc-isolation-adversarial.ts` |

### Group F: Core Product Gaps

| ID | Item | Scope | Dependencies | Acceptance Criteria | Regression Test |
|----|------|-------|--------------|---------------------|-----------------|
| P1-F1 | Fix forge winner duplication | `forge.ts:173-174` | None | When one candidate passes, loser slot is empty or distinct | `tests/content-studio.test.ts` |
| P1-F2 | Add connection rejection state to relationship state machine | `relationship-state-state.ts` | None | Leads transition to terminal state after connection rejection/timeout | `tests/relationship-state.test.ts` |
| P1-F3 | Fix `/conversations` orphan | `app-rail.tsx` or redirect | Decision: merge `/relay` and `/conversations` | Conversation workspace reachable from navigation | E2E navigation test |
| P1-F4 | Fix landing anchor links | `landing-nav.tsx`, `marketing-nav.tsx`, `convergence-landing.tsx` | None | All anchor links resolve to existing section IDs | E2E landing test |
| P1-F5 | Fix admin Command Center data source | `dashboard-loader.ts` | None | Shows real team activity from `daily_targets`/`daily_accountability` | `tests/admin-command-center.test.ts` |
| P1-F6 | Wire `sender_profile_id` to UI | `lead-workspace.tsx`, `draft/route.ts` | None | Profile selector defaults to lead's stored profile | E2E lead detail test |

---

## P2 — SHOULD FIX FOR QUALITY

### Group G: AI Quality

| ID | Item | Scope | Dependencies | Acceptance Criteria | Regression Test |
|----|------|-------|--------------|---------------------|-----------------|
| P2-G1 | Unify AI routing (remove legacy path) | `routing.ts`, `provider.ts`, `draft.ts`, `calibrate.ts` | Migrate all call sites to Runtime V3 | Single routing system; consistent telemetry | Full test suite |
| P2-G2 | Fix forge candidate C persona | `forge.ts:118` | None | Escalation uses distinct persona or corrective prompt | Quality review |
| P2-G3 | Learn `shortVsDeep` taste dimension | `taste.ts:122-135` | None | Taste profile updates on short/deep signal | `tests/content-dna.test.ts` |
| P2-G4 | Fix taste signal double-counting | `v2/generate/route.ts`, `feedback/route.ts` | None | Single signal per user journey | `tests/taste-signal-path.test.ts` |
| P2-G5 | Fix draft topic cluster linkage | `generate-draft/route.ts` | None | Drafts created with correct `topicClusterId` | `tests/content-studio.test.ts` |
| P2-G6 | Improve idea deduplication | `daily-ideas.ts`, `idea-engine.ts` | Embedding-based similarity | Semantic duplicate detection, not just title matching | `tests/content-quality.test.ts` |
| P2-G7 | Add regeneration feedback loop | `draft-workspace.ts` | None | Previous failure signals fed to regeneration | Quality review |
| P2-G8 | Fix score baseline inflation (remaining) | `scoring-engine.ts` | P0-B2 | Non-buyer gets 0 for opportunity fit; growth_signal requires buyer evidence | `tests/intelligence-v2-benchmark.test.ts` |

### Group H: Navigation & UX

| ID | Item | Scope | Dependencies | Acceptance Criteria | Regression Test |
|----|------|-------|--------------|---------------------|-----------------|
| P2-H1 | Add nav links for orphan routes | `app-rail.tsx` | Decision on which routes to expose | All functional routes reachable | E2E navigation |
| P2-H2 | Fix follow-up timer reference point | `relationship-state.ts` | None | Timer uses last outbound message, not first DM | `tests/followup-eligibility.test.ts` |
| P2-H3 | Fix follow-up cap duplication | `relationship-state.ts` | None | Single source of truth for max followups | `tests/followup-eligibility.test.ts` |
| P2-H4 | Remove or populate `followUpDueLabel` | `relationship-state.ts` | None | Field populated or removed | N/A |

### Group I: Data Consistency

| ID | Item | Scope | Dependencies | Acceptance Criteria | Regression Test |
|----|------|-------|--------------|---------------------|-----------------|
| P2-I1 | Add voice profile guard to Studio onboarding API | `/api/content/onboarding/complete/route.ts` | P0-C1 | API rejects or auto-creates voice profile | Integration test |
| P2-I2 | Fix calibration `normalizeCard` fallback | `calibrate.ts:171-177` | None | Quiz seed preserved when AI returns empty arrays | `tests/writing-engine.test.ts` |
| P2-I3 | Fix inbound reply style card usage | `inbound/reply/route.ts` | None | Full style card passed, not just summary | `tests/inbound-reply-quality.test.ts` |
| P2-I4 | Fix signup rulebook cleanup | `signup/route.ts` | None | Rollback only deletes rulebook if it was created | Integration test |

---

## P3 — NICE TO HAVE

| ID | Item | Scope | Acceptance Criteria |
|----|------|-------|---------------------|
| P3-01 | Lower persona-fit threshold for non-technical roles | `quality-gate.ts` | Threshold 0.1 for all roles, or content quality improves |
| P3-02 | Remove dead code and tables | Multiple files | Timing engine, orphaned routes, dead tables removed |
| P3-03 | Add prompt injection detection | AI call sites | User content scanned for instruction patterns |
| P3-04 | Increase login timeout exponential backoff | `login-experience.tsx` | 5s with exponential backoff |
| P3-05 | Validate `next` parameter allowlist | `auth/callback/route.ts` | Only known-safe paths accepted |
| P3-06 | Add server-side resend cooldown | Signup API | Email resend rate limited server-side |
| P3-07 | Document deprecated env vars | `.env.local.example` | All vars documented |
| P3-08 | Implement cross-session idea deduplication | `idea-engine.ts` | Ideas compared against full history, not just current session |

---

## DEPENDENCY GRAPH

```
P0-A4 (service key) → P0-C3 (RPC fix) → P1-E2 (DB function)
P0-B1 (remove fabrication) → P0-B3 (clean evidence ledger)
P0-B2 (score baselines) → P2-G8 (remaining score fixes)
P0-C1 (Studio redirect) → P2-I1 (guard)
P0-A1 (role fix) → P1-D3 (copilot voice)
```

## ESTIMATED EFFORT

| Priority | Items | Est. Effort |
|----------|-------|-------------|
| P0 | 12 | 3-4 days |
| P1 | 15 | 5-7 days |
| P2 | 17 | 5-7 days |
| P3 | 8 | 2-3 days |
| **Total** | **52** | **15-21 days** |
