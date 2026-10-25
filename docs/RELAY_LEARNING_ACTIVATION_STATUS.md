# Relay — Human Learning + Revenue Proof + Evaluation — Status

**Date:** 2026-10-25 · **Scoring:** V3 (unchanged) · **Routing:** v1 live / v2 shadow · **Promotion:** NO-GO
**Companion docs:** `docs/RELAY_UX_ACTIVATION_STATUS.md` · `docs/RELAY_DAILY_OPERATIONS_RELEASE.md`

> **Honesty:** no V3 change, no band change, no new scorer, no v2 promotion, no Deal Coach. This pass built the human-judgment layer on top of the existing intelligence. **No browser pass or human review was possible**, so the gate's browser/human steps are unmet.

---

## FIRST-100 UX

The review card + quick-label controls exist on `/admin/training-data`. **The first-100 progress indicator and keyboard shortcuts were not rebuilt** (they exist as APIs).

## LABEL SPEED

The quick-label API posts a single call; the review card is one screen. **Not timed in a browser.**

## LABEL COUNT

**0.**

## PAIRWISE UX

Pairwise API + table exist. **The side-by-side review tab was not rebuilt.**

## PAIRWISE COUNT

**0.**

## ACTIVE LEARNING REASONS

`training-data.ts` computes the priority reasons (V3/shadow disagreement, routing disagreement, high-value/low-confidence, unexpected outcome, threshold, unknown-intent, feedback). **The surfaced "why this case is in review" list was not rebuilt.**

## MESSAGE REVIEW TOOL

**BUILT.** `/admin/qa` (tab: **Message review**) samples messages and records a 1–5 score + classification (SALES_READY / GENERIC / MARKETING_NOT_SALES / UNSUPPORTED / FABRICATED / WRONG_STAGE) into `message_evaluations` via `/api/admin/qa/evaluations`. A side panel aggregates human message quality.

## MESSAGE HUMAN RESULTS

**NONE.** No human has scored messages.

## THESIS REVIEW TOOL

**BUILT.** `/admin/qa` (tab: **Thesis review**) shows the derived thesis and records STRONG / USEFUL / WEAK / MISLEADING into `thesis_evaluations`, with an aggregate panel.

## THESIS HUMAN RESULTS

**NONE.**

## ROUTING LABELS

**BUILT.** The routing table now records `best_sender_profile_id`, `v1_correct` and `v2_correct` into `routing_evaluations` via the same endpoint. Previously visual-only.

## ROUTING V1/V2 HUMAN METRICS

`routingEvaluationStats` reports judged count, v1/v2 correct rates and best-sender picks. **0 judged.**

## MODEL COMPARISON

**BUILT with minimum-sample gating.** `modelComparison` returns `INSUFFICIENT_DATA` (<30 labels), `PRELIMINARY_ONLY` (30–99) or `PROMOTION_STUDY` (≥100); only at the last tier does it compute band accuracy. **Never auto-promotes.** With 0 labels it returns INSUFFICIENT_DATA.

## REVENUE FUNNEL

**BUILT.** `revenueFunnel` derives Qualified / Conversation / Meeting / Proposal / Won / Lost from stored outcomes (best stage per lead). Surfaced on `/admin/qa` (tab: **Revenue funnel**).

## OUTCOME METRICS

`outcome-timings.ts` exists; **not surfaced.**

## DATA EXPORTS

The dataset export already supports modes; **a V2 export set (SCORING_EVAL / PAIRWISE_RANKING / ROUTING_EVAL / MESSAGE_QUALITY / THESIS_QUALITY / OUTCOME_TRAINING) was not built.**

## AI USAGE

Backend paginates; **the admin UI total fix was not verified.**

## ADMIN QA ACTION PERSISTENCE

**FIXED.** Thread Confirm/Dismiss persist `messages.thread_status`; Reassign returns a clear 400 (needs a target). Routing judgments persist to `routing_evaluations`. Stale re-analysis is a dry run by design.

## RESPONSIVE / ACCESSIBILITY

The QA page is a table that scrolls horizontally on small screens. **No 375px browser pass.**

## PERFORMANCE

The QA page makes one fetch; evaluations are per-row writes. **Not measured.**

## BUILD

**PASS** (exit 0).

## TESTS

- New learning suite: 8 tests pass (sample gating, message/thesis/routing persistence, funnel).
- `tsc --noEmit`: clean.
- **Full suite: 3,118 pass / 6 fail** — the same 6 pre-existing `hardening-regression` failures; **no new failures**.

## FILES CHANGED

- `src/lib/admin/evaluations.ts` (new)
- `src/app/api/admin/qa/evaluations/route.ts` (new)
- `src/app/api/admin/qa-views/route.ts` (new sections)
- `src/app/(app)/admin/qa/page.tsx` (new tabs + persistence)
- `supabase/migrations/20261025120000_review_evaluations.sql` (new)
- `tests/relay-learning-2026-10-25.test.ts` (new)

## WHAT STILL REQUIRES PRODUCTION

- Deploy + migrate; verify the evaluation tables exist.
- Run the first-100 label campaign and the human message/thesis reviews.
- Build the first-100 progress UI, pairwise tab and active-learning reason list.
- Build the dataset export V2 set.
- Verify the AI-usage admin UI consumes full totals.
- Browser pass and screenshots.

---

## HUMAN LEARNING UX: NOT READY

The review tools and persistence exist, but the campaign UI (first-100 progress, pairwise tab, active-learning reasons) and the human reviews are missing.

## LEARNING LOOP: INACTIVE

Zero labels.

## MESSAGE EVALUATION: READY

The tool + persistence exist; no human scores yet.

## THESIS EVALUATION: READY

The tool + persistence exist; no human scores yet.

## ROUTING EVALUATION: READY

Best-sender + v1/v2 judgments persist; 0 judged.

## DATASET: NOT READY

Export V2 not built; zero labels.

## SCORING: KEEP V3
## ROUTING: KEEP V1 LIVE / V2 SHADOW
## CANDIDATE PROMOTION: NO-GO
## POST-MVP: WAIT FOR PRODUCTION ACTIVATION

---

*Skipped: browser pass (no running app); first-100 progress UI; pairwise tab; active-learning reason list; dataset export V2; AI-usage UI verification; human message/thesis reviews | Risk: the evaluation tables are unapplied; zero labels; no human review; the learning loop is inactive*