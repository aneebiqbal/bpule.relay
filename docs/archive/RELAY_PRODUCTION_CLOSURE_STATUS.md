# Relay — Production Closure + Daily Operations + Learning Activation — Status

**Date:** 2026-10-24 · **Scoring:** V3 (unchanged) · **Shadow:** enabled, not promoted
**Companion docs:** `docs/RELAY_DAILY_OPERATIONS_RELEASE.md` (Phase 28) · `docs/RELAY_TRUST_PROGRAM_STATUS.md` · `docs/RELAY_SPRINT_B_STATUS.md` · `docs/RELAY_PRODUCT_SIMPLIFICATION_PLAN.md`

> **Pass-gate honesty:** the gate requires applied migrations, an RLS tenant test, browser verification on the deployed SHA, Today/Lead Detail rebuilds, and the first 100 labels. This environment has no production access and no browser, so those could not be done. **The sprint does NOT pass the gate.** Everything buildable here is built and unit-verified; the build passes.

---

## DEPLOYMENT STATUS

**NOT VERIFIED.** No Vercel access. Deployed SHA / deployment id unknown. `/api/version` not compared. Browser claims invalid.

## MIGRATION STATUS

Six migrations written, **none applied**: `20261024120000` (RLS), `…0001` (trigger), `…0002` (sender context), `…0003` (facts), `…0004` (thread status), `…0005` (RPC hardening). Verified absent in production: `messages.sender_attribution_status`, `messages.thread_status`, `conversation_facts`.

## RLS STATUS

`intelligence_sample_events` RLS remains **not enabled** in production until `20261024120000` is applied. Tenant test not run.

## SPRINT A/B LIVE VERIFICATION

**NOT RUN.** Unit-verified only.

## TODAY UX

**NOT REBUILT.** No browser. The data feeding Today is now correct (analytics fixes), but the page is the Sprint-B layout.

## LEAD DETAIL UX

**NOT REBUILT.** The thesis, facts, thread status and score-staleness helpers are available to the page.

## ROUTING QA

**NOT BUILT.** v1/v2 comparison UI absent; shadow table populated (2,900 rows). Flags not computed.

## LABELING

Quick-label + pairwise APIs wired and tested. **Zero labels recorded.**

## ACTIVE LEARNING

`training-data.ts` prioritises disagreement / low confidence / feedback / unexpected outcomes / threshold cases. Empty because there are no labels.

## REAL LABEL COUNT

**0.** No labels exist; the first-100 campaign cannot run without human review time.

## AI COST

**FIXED.** Groq (default) and LongCat had `costPerInputToken: 0` → universal $0. Now priced; `recordScopedTrace` derives cost from tokens. `estimateCostUsd` tested.

## OUTCOME METRICS

`outcome-timings.ts` derives `firstContactAt`, `firstReplyAt`, `firstCommercialReplyAt`, `meetingAt`, `proposalAt`, `wonAt`, `lostAt` and the durations. Not surfaced in a dashboard yet.

## THREAD INTEGRITY

`validateThreadIdentity` + inbound 409 + `messages.thread_status` (`VERIFIED`/`UNVERIFIED`) — bare paste marks UNVERIFIED. UX for review/reassign not built.

## SCORE STALENESS

`score-staleness.ts` reports current/stale/unscored coverage and stale-version breakdown. 31% of rows are stale; the UI to surface it was not built.

## ONE SCORE WRITER STATUS

**DONE.** The legacy 0–12 `computeScore` no longer persists to `leads.score` in `prospect/save`, `leads/route`, or `leads/import`; the canonical 0–100 score is the only live write. Architecture regression test added.

## SIMPLIFICATION RESULTS

**DONE (safe subset).** Removed dead pages and components; added redirects.

## REMOVED ROUTES

- `/conversations` → `/chats` (redirect)
- `/usage` → `/dashboard` (redirect)
- `/content/growth` → `/content-v2/growth` (redirect)
- `/find-jobs` → `/upwork` (redirect)
- `/resume/generate` → `/content` (redirect)
- `/studio/drafts/new` → `/content` (redirect)
- `/admin/revenue-identities` → `/profile-intelligence?tab=identities` (redirect)

## REMOVED COMPONENTS

- `components/leads-pipeline.tsx`
- `components/leads-tab-view.tsx`
- `components/public-nav.tsx`
- `components/public-footer.tsx`

## SECURITY RPC AUDIT

`append_sample_event` and `approve_sample_for_training` were callable by any authenticated user with no org/reviewer check → **hardened** in `20261024120005` (org check + admin check). The other SECURITY DEFINER functions (`refresh_few_shot_wins`, `match_proofs_by_embedding`, `archive_search`, orchestration RPCs) are **unreviewed** beyond this.

## DATASET PERMISSIONS

`dataset/capture` `HUMAN_FEEDBACK` now requires the caller to own the sample's lead (managers/admins may review any). The unused `approveForTraining` import was removed.

## MESSAGE HUMAN REVIEW

**NOT DONE.** No human performed a 50-message review.

## THESIS HUMAN REVIEW

**NOT DONE.** No human reviewed 50 theses.

## REAL DATA STABILITY

| Store | Count |
|---|---|
| leads / prospects | 397 / 724 |
| messages | 537 |
| samples / events | 434 / 1,343 |
| shadow decisions | 2,900 |
| labels / pairwise | 0 / 0 |
| proof_cards / proof_items | 39 / 0 |
| ai_traces | 3,010 |

| Metric | Value |
|---|---|
| current-score coverage | 250/397 (63%) |
| stale-score coverage | 121/397 (30.5%) |
| unscored | 26 (6.5%) |
| messages with sender_profile_id | 0/537 |
| terminal leads | 7 |
| label coverage | 0 |

## PERFORMANCE

Accountability `getTeamCalendar` batched: **252 → 3 queries**. AI-usage stats now paginate (no 1000-row truncation). Today/Lead Detail API counts not measured (no running app).

## BUILD

**`pnpm build`: PASS (exit 0).** Removed routes are absent from the build output; no broken imports.

## TESTS

- New closure suite: 4 tests; one-score-writer suite: 4 tests; trust suite: 15 tests.
- `tsc --noEmit`: clean.
- **Full suite: 3,148 pass / 6 fail** — the same 6 pre-existing `hardening-regression` failures; **no new failures**. Three existing tests were updated to the new one-score-writer contract (they asserted the old two-writer behaviour the program asked to remove).

## BROWSER RESULTS

**NOT RUN.**

## FILES CHANGED (this pass)

- `src/lib/sales/outcome-timings.ts` (new)
- `src/lib/intelligence-v3/score-staleness.ts` (new)
- `src/app/api/prospect/save/route.ts`, `src/app/api/leads/route.ts`, `src/app/api/leads/import/route.ts` (one score writer)
- `src/app/api/dataset/capture/route.ts` (feedback ownership)
- `src/lib/ai/runtime/telemetry.ts` (usage pagination)
- `next.config.ts` (redirects)
- Removed 5 dead pages + 4 dead components
- `tests/relay-closure-2026-10-24.test.ts` (new)
- `docs/RELAY_DAILY_OPERATIONS_RELEASE.md`, `docs/RELAY_PRODUCTION_CLOSURE_STATUS.md` (new)

## MIGRATIONS

`20261024120005_security_definer_hardening.sql` (new). Five prior migrations unapplied.

## REMAINING RISKS

1. Six migrations unapplied — the new columns/tables/RLS/RPC hardening are absent in production.
2. Browser gate unsigned.
3. Zero labels — learning loop inactive.
4. Today / Lead Detail not rebuilt.
5. Routing v2 comparison not exposed.
6. Message/thesis human review not performed.
7. PII history open.
8. Remaining SECURITY DEFINER functions unreviewed.

---

## PRODUCT STATUS: CONDITIONAL

Not daily-operations ready: code is safe and coherent, build passes, but migrations are unapplied, the browser gate is unsigned, and the learning loop is empty.

## MESSAGE STATUS: NEEDS IMPROVEMENT

Gated and thesis-driven, but no human/browser proof.

## DATA STATUS: PARTIAL

Correctness fixed and proof canonical, but the new columns are unapplied and zero labels make learning data untrustworthy.

## LEARNING LOOP: INACTIVE

APIs work; zero labels.

## ROUTING STATUS: SHADOW ONLY

v2 evaluated in shadow; no comparison UI; not ready for promotion study.

## SCORING: KEEP V3

No weights/bands/promotions touched.

## CANDIDATE PROMOTION: NO-GO

Zero human labels.

## POST-MVP: STABILIZE FIRST

Migrations + browser gate + labels + Today/Lead Detail must land first.

---

*Skipped: deployment parity, migration apply, RLS tenant test, browser E2E, Today/Lead Detail rebuild, routing QA UI, first-100 label campaign, message/thesis human review. | Risk: the new columns/tables/RLS are absent in production until migrations are applied; message quality is gated but unproven; the learning loop is empty*