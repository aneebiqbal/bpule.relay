# Relay — Trust + Learning + Revenue UX Program — Status

**Date:** 2026-10-24 · **Scope this session:** Days 2, 4.5, 5, 5.5, 6 (code + tests) and the simplification plan. **Days 1 and 3/4 UI could not be done** (no production access, no running app/browser).

**Companion docs:** `docs/RELAY_AUDIT_2026-10-24.md` · `docs/RELAY_POST_MVP_PROGRAM_STATUS.md` (Sprint A) · `docs/RELAY_SPRINT_B_STATUS.md` (Sprint B) · `docs/FOLLOWUP_POLICY_MAP.md` · `docs/PII_GIT_REMEDIATION.md` · `docs/RELAY_PRODUCT_SIMPLIFICATION_PLAN.md`

> **Pass-gate honesty:** the gate requires applied migrations, RLS tenant tests and browser verification. Those need production access and a browser this environment does not have. **The program is therefore NOT passing**, even though every code item that can be built here is built and unit-verified.

---

## DEPLOYMENT PARITY

**NOT VERIFIED.** No Vercel CLI / deployed-SHA access. `/api/version` could not be compared to HEAD. Working tree has uncommitted changes (see FILES CHANGED). Do not browser-test on this environment's SHA.

## MIGRATION STATUS

Four Sprint A/B migrations + one new one are **written, not applied**:

| Migration | Status |
|---|---|
| `20261024120000_intelligence_sample_events_rls` | written, unapplied |
| `20261024120001_followup_trigger_canonical` | written, unapplied |
| `20261024120002_sender_context` | written, unapplied |
| `20261024120003_conversation_facts` | written, unapplied |
| `20261024120004_thread_status` | written, unapplied |

RLS is not enabled on `intelligence_sample_events` in production until `20261024120000` is applied. Tenant tests could not be run against production.

## SPRINT A/B BROWSER VERIFICATION

**NOT RUN.** No running app / deployed SHA. All Sprint A/B behaviour (opt-out, terminal block, fabrication block, follow-up, sender persistence, facts, thread mismatch) is unit-verified only.

## SALES THESIS AUTO-DERIVATION

**DONE.** `src/lib/conversation/derive-sales-thesis.ts` — `deriveSalesThesis()` derives the thesis deterministically from `SourceFacts` + buyer intent + archetype + fit + sender, and marks every field FACT / HYPOTHESIS / UNKNOWN.

- A verified buyer request → `likelyOpportunity` is **FACT** ("Direct request: …").
- A capability signal without a request → **HYPOTHESIS** ("Potential … capacity pressure").
- No signal → **UNKNOWN** ("Unverified").
- Service provider / recruiter / candidate / closed → no sales pitch; risks listed.
- Confidence: `Potential` (fact + capability overlap) / `Possible` (hypothesis) / `Unverified`.

The composer consumes `SalesThesis` (Sprint B) — now it can be auto-populated.

## TODAY UX BEFORE/AFTER

**NOT REDESIGNED.** No browser. The data feeding Today is now correct (analytics fixes below), but the page still shows the Sprint-B-era layout.

## LEAD DETAIL BEFORE/AFTER

**NOT REDESIGNED.** The thesis, facts and thread status are available to the page; the visual reorganisation was not done.

## ROUTING V1/V2

- Routing v1 is live; v2 remains shadow (`scoring-v4/shadow.ts`).
- `compareRouting` runs in shadow only.
- **Not exposed** as a v1/v2 comparison table in admin QA (the shadow table exists; the UI comparison was not built).
- Disagreement/flags (`V1_V2_DISAGREE`, `BEST_SENDER_INACCESSIBLE`, `NO_VERIFIED_PROOF`, `CURRENT_SENDER_UNKNOWN`) are **not** computed/exposed.

## PROOF SYSTEM STATUS

**Canonical decision: `proof_cards`.** `proof_items` is empty (0 rows); `proof_cards` holds 39 rows with `verified`, `safe_claim`, `forbidden_claims`, `capability`, `strength`.

- `SupabaseStore.listProofItems` now **falls back to verified `proof_cards`** when a profile has no items, filtering out forbidden claims — so routing and messaging get real proof without a migration.
- Trust states: only `verified = true` + no `forbidden_claims` cards are treated as APPROVED_REAL.
- `sender-suggestion.ts` already read both stores.

## HUMAN LABEL STATUS

- Quick-label API exists and is wired (`mode: 'quick'`: prospectQuality, likelyOpportunity, quickAction, decisionCorrect, bestSender, note).
- **Pairwise is now wired** (`mode: 'pairwise'` → `scoring_pairwise_labels`).
- **Zero labels recorded** — this is the blocker. The pipeline works; nobody has used it.

## PAIRWISE LABEL STATUS

**DONE.** `validatePairwiseLabel` + route + table. Rejects identical keys and invalid winners.

## ACTIVE LEARNING STATUS

`lib/admin/training-data.ts` prioritises V3/shadow disagreement, low confidence, human feedback, unexpected outcomes and band edges. It consumes `scoring_labels` / `scoring_shadow_decisions`. **No labels → the queue is empty.**

## AI COST STATUS

**FIXED.** Root cause: Groq (the default provider) and LongCat hardcoded `costPerInputToken: 0`, so every call was $0.

- `groq.ts`: gpt-oss-20b `0.10/0.50`, gpt-oss-120b `0.24/1.20` (USD per 1M); cost computed from tokens.
- `longcat.ts`: `0.10/0.50`; cost computed from tokens.
- `recordScopedTrace`: derives cost from tokens + `estimateCostUsd` when the caller did not compute it (never a universal $0).
- `estimateCostUsd(tier, in, out)` tested.

## ANALYTICS CORRECTNESS

| Metric | Fix |
|---|---|
| Command-center wins | `CLIENT_WON` now counts as **wins**, not opportunities; brief + sinceYesterday no longer hardcode 0 |
| Observability orphans | now counts rows whose `lead_id` has no matching lead (was counting all rows) |
| Accountability N+1 | `getTeamCalendar` batched: **252 queries → 3** for 18 reps × 7 days |
| Dataset msg pairs | fixed in Sprint A (exact count + org scope) |
| Revenue intelligence / accountability | fixed in the audit pass (no `leads.updated_at`) |

AI-usage 1000-row cap: `getAiUsageStats` still fetches in range without an explicit limit; noted, not fixed this pass.

## ACCOUNTABILITY PERFORMANCE

`getTeamCalendar` is now one grouped read per range (messages, won outcomes, owner map) instead of per-day × per-rep queries. Measured structurally: 252 → 3 queries for the admin load.

## THREAD INTEGRITY

- `validateThreadIdentity` + inbound route returns **409 `THREAD_MISMATCH_REVIEW_REQUIRED`** on a sender/lead mismatch (Sprint B).
- **Day 6:** `messages.thread_status` (`VERIFIED` / `UNVERIFIED`, migration `20261024120004`) — the bare paste flow marks `UNVERIFIED` so it is never treated as strongly linked; a supplied-and-matching identity marks `VERIFIED`.
- Provider-thread identity validation is in the module for the future webhook path.

## REAL-DATA RESULTS

Read-only production query (2026-10-24): 393 leads / 718 prospects / 529 messages / 2,868 shadow rows / 0 labels / 39 proof_cards / 0 proof_items / 2,978 ai_traces.

- 31% of scored leads carry a stale `score_version` (v3.1/v3.2 vs current v3.3).
- Score collapse persists: 78% MAYBE, 0% SKIP.
- New outbound-message gate on 120 real messages: **2 FABRICATED + 4 UNSUPPORTED blocked**, 114 safe.
- Upwork: **10/96** messages carry an unfilled placeholder and would now be refused.

## MESSAGE QUALITY

| | Before | After |
|---|---|---|
| Fabricated | ≥3 shipped | **blocked** (2 found in a 120-sample) |
| Unsupported | shipped | **blocked** (4 flagged) |
| Generic opener | shipped | **blocked** for cold |
| Marketing-not-sales | shipped | **blocked** for cold |
| Sales thesis | shape only | **auto-derived, FACT/HYPOTHESIS labelled** |

## RANKING METRICS

**NOT COMPUTED.** `scoring_labels` = 0 → no NDCG / pairwise accuracy / Spearman. No candidate promoted.

## SECURITY

| Gap | Status |
|---|---|
| `/api/admin/routing-opportunities` role gate | **FIXED** (`VIEW_TEAM_ANALYTICS`) |
| Command palette admin commands visible to all | **FIXED** (`isAdmin` from `/api/me/status`, Admin group filtered) |
| `app-rail` stale `reps.role` | **FIXED** (canonical `authCtx.isAdmin` from the layout) |
| SECURITY DEFINER RPCs unchecked | **OPEN** |
| dataset write permissions | **OPEN** |
| PII in git | **OPEN** (plan only) |

Role matrix (OWNER/ADMIN/MANAGER/REP): org scoping and cross-org denial verified in the Sprint A audit; the newly gated routes use `can(ctx,'VIEW_TEAM_ANALYTICS')`.

## BUILD

- `npx tsc --noEmit`: **clean**.
- `pnpm build`: **not run** this session.
- Migrations unapplied.

## TESTS

- New trust-program suite: **15 tests pass**.
- Full suite: **3,139 pass / 6 fail** (the 6 pre-existing `hardening-regression` failures); **no new failures** from this pass.
- Classification: NEW 0, PRE_EXISTING 6, FLAKY 0, ENVIRONMENTAL 0, BLOCKING 0 new.

## BROWSER RESULTS

**Not run.** No running app / deployed SHA. All UI claims are source-derived.

## FILES CHANGED (this session)

- `src/lib/conversation/derive-sales-thesis.ts` (new)
- `src/lib/ai/runtime/providers/groq.ts`, `longcat.ts` (pricing + cost)
- `src/lib/ai/runtime/telemetry.ts` (token-based cost)
- `src/lib/admin/command-center-v2.ts` (wins)
- `src/lib/admin/observability.ts` (orphans)
- `src/lib/accountability/metrics.ts` (batched calendar)
- `src/lib/store/supabase-store.ts` (proof_cards fallback, thread_status)
- `src/lib/store/types.ts` (recordProspectReply options)
- `src/app/api/admin/training-data/labels/route.ts` (pairwise)
- `src/app/api/admin/routing-opportunities/route.ts` (role gate)
- `src/app/api/me/status/route.ts` (isAdmin/isManager)
- `src/app/(app)/layout.tsx`, `src/components/app-rail.tsx`, `command-palette.tsx`, `command-palette-provider.tsx` (canonical role)
- `src/app/api/leads/[id]/conversation/inbound/route.ts` (thread status)
- `tests/relay-trust-program-2026-10-24.test.ts` (new)
- `docs/RELAY_PRODUCT_SIMPLIFICATION_PLAN.md`, `docs/RELAY_TRUST_PROGRAM_STATUS.md` (new)

## MIGRATIONS

- `20261024120004_thread_status.sql` (new).
- Four Sprint A/B migrations remain unapplied.

## REMAINING RISKS

1. **Migrations unapplied** — RLS, sender context, facts and thread status do not exist in production yet.
2. **No browser verification** — the pass gate cannot be signed.
3. **Zero human labels** — the learning loop is not active.
4. **Routing v2 not exposed/measured.**
5. **Today / Lead Detail not redesigned.**
6. **PII history open.**
7. **SECURITY DEFINER RPCs and dataset write permissions open.**
8. **AI-usage stats still cap at 1000 rows in range.**

## PRODUCT SIMPLIFICATION PLAN

`docs/RELAY_PRODUCT_SIMPLIFICATION_PLAN.md` — reviewed REMOVE/MERGE/KEEP lists for dead routes, dead components, duplicate content/studio flows, `/chats` vs `/relay`, the legacy scorer writer and the dead orchestration/timing engine, with imports, links, API dependencies, redirect plan and migration impact. **No deletion performed.**

---

## PRODUCT STATUS: CONDITIONAL

Not daily-operations ready: the analytics now tell the truth and the thesis is derived, but migrations are unapplied, the browser gate is unsigned, the learning loop is empty, and Today/Lead Detail are unchanged.

## MESSAGE STATUS: NEEDS HUMAN PROOF

The engine is now gated and thesis-driven, but no human or browser pass has confirmed the output.

## DATA STATUS: PARTIAL

Correctness bugs are fixed and proof is canonical, but the new columns/tables are unapplied and zero labels make the learning data untrustworthy.

## LEARNING LOOP: NOT ACTIVE

The quick-label and pairwise APIs work; **zero labels exist**.

## SCORING: KEEP V3

No weights, bands or shadow promotions touched.

## CANDIDATE PROMOTION: NO-GO

Zero human labels → no candidate can be promoted.

## POST-MVP: STABILIZE FIRST

Migrations + browser gate + human labels + Today/Lead Detail must land before growth features.

---

*Skipped: deployment parity, migration apply, RLS tenant test, browser E2E, Today/Lead Detail redesign, routing v2 comparison UI, AI-usage pagination, build, outcome-time metrics storage. | Risk: the new columns/tables do not exist in production until the migrations are applied; message quality is gated but unproven in a browser; the learning loop is empty so no ranking metric can be trusted*