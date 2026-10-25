# Relay — First-100 Human Learning Campaign + Production Activation — Status

**Date:** 2026-10-25 · **Scoring:** V3 (unchanged) · **Routing:** v1 live / v2 shadow · **Promotion:** NO-GO
**Companion docs:** `docs/RELAY_PRODUCTION_ACTIVATION_RUNBOOK.md` · `docs/RELAY_LEARNING_ACTIVATION_STATUS.md`

> **Honesty:** this pass built the campaign UI, the learning-health summary, the dataset export V2 modes, and the activation runbook. **No human has used the tools and no production deployment/migration/browser pass was possible.** The campaign cannot be called active until the runbook is executed and the first labels exist.

---

## FIRST-100 CAMPAIGN UX

**BUILT.** `/admin/training-data` now opens with a campaign header: `First 100 real opportunities` showing Opportunity labels `X / 100`, Pairwise judgments, Routing reviews, Message reviews and Thesis reviews, plus remaining count. A second panel shows Learning health (message pass rate, thesis misleading rate, V1/V2 routing accuracy, reviewer agreement, label distribution).

## REVIEW SPEED

Keyboard shortcuts added to the quick-label form: **1–5** select prospect quality, **Enter** saves. Shortcuts are ignored while typing in an input/textarea/select. **Not timed in a browser.**

## LABEL COUNT

**0.**

## PAIRWISE UX

A `PairwisePanel` exists in the training-data center. **Not browser-verified.**

## MESSAGE REVIEW

Tool + persistence exist (`/admin/qa` → Message review). **No campaign header or per-item progression rebuilt.**

## THESIS REVIEW

Tool + persistence exist (`/admin/qa` → Thesis review). **No campaign header rebuilt.**

## ROUTING REVIEW

Persists `best_sender_profile_id`, `v1_correct`, `v2_correct` to `routing_evaluations`. **0 judged.**

## ACTIVE LEARNING

The priority reasons are computed and now surfaced as **human labels** (e.g. "Model disagreement", "Outcome contradicts the rank") instead of raw enum strings.

## MODEL COMPARISON

`modelComparison` with strict gating: `INSUFFICIENT_DATA` (<30), `PRELIMINARY_ONLY` (30–99), `PROMOTION STUDY` (≥100). Never shows a winner before 100; never auto-promotes.

## DATASET EXPORT V2

**BUILT.** Six modes — `SCORING_EVAL`, `PAIRWISE_RANKING`, `ROUTING_EVAL`, `MESSAGE_QUALITY`, `THESIS_QUALITY`, `OUTCOME_TRAINING` — each joining the canonical tables, org-scoped, test-data excluded. `GET /api/dataset/export?mode=...`.

## REVENUE FUNNEL

`revenueFunnel` + a funnel tab on `/admin/qa`. **Stage-to-stage conversion and median time not added.**

## LEARNING HEALTH

**BUILT.** One admin summary: opportunity labels, pairwise, routing, messages, theses, outcome-linked, message pass rate, thesis misleading rate, V1/V2 routing accuracy, label distribution and reviewer agreement.

## AI USAGE

Backend paginates. **Admin UI not verified.**

## QA ACTION COMPLETENESS

**FIXED.** Thread Confirm/Dismiss persist `thread_status`; Reassign now **navigates** to the lead sender tab instead of returning a 400. Routing and evaluation actions persist.

## RESPONSIVE / ACCESSIBILITY

The campaign header collapses to 2 columns under `lg`. Keyboard shortcuts are scoped away from text inputs. **No 375px browser pass.**

## PERFORMANCE

The campaign header adds two aggregate queries on the training-data page; no per-row fetches. **Not measured.**

## BUILD

**PASS** (exit 0).

## TESTS

- New campaign suite: 10 tests pass (first-100 progress, reason labels, keyboard shortcuts, export modes + builders, QA action persistence, reviewer agreement, learning health).
- `tsc --noEmit`: clean.
- **Full suite: 3,128 pass / 6 fail** — the same 6 pre-existing `hardening-regression` failures; **no new failures**.

## PRODUCTION ACTIVATION RUNBOOK

**BUILT.** `docs/RELAY_PRODUCTION_ACTIVATION_RUNBOOK.md` — freeze, deploy, verify `/api/version`, apply migrations in order, RLS tenant matrix, Sprint A/B browser suite, live data checks, first label, first evaluations, analytics sanity, begin the campaign.

## FILES CHANGED

- `src/lib/admin/learning-health.ts` (new)
- `src/components/admin/learning-health.tsx` (new)
- `src/components/admin/training-data-center.tsx` (reason labels, keyboard shortcuts)
- `src/app/(app)/admin/training-data/page.tsx` (campaign header)
- `src/lib/dataset/eval-export.ts` (new)
- `src/app/api/dataset/export/route.ts`, `src/lib/dataset/types.ts` (export V2 modes)
- `src/app/(app)/admin/qa/page.tsx` (Reassign navigates)
- `tests/relay-campaign-2026-10-25.test.ts` (new)
- `docs/RELAY_PRODUCTION_ACTIVATION_RUNBOOK.md`, `docs/RELAY_FIRST100_CAMPAIGN_STATUS.md` (new)

## WHAT STILL REQUIRES HUMAN/PRODUCTION

- Execute the runbook (deploy, migrate, tenant matrix, browser suite).
- Run the first-100 campaign and record real labels.
- Build the message/thesis campaign headers and per-item progression.
- Add funnel stage conversion + median time.
- Verify the AI-usage admin UI totals.
- Browser/375px/screenshot pass.

---

## HUMAN LEARNING UX: NOT READY

The campaign UI, learning health and export modes exist, but the campaign has not been run and the message/thesis campaign headers are missing.

## LEARNING LOOP: INCOMPLETE

Zero labels; the loop is built but not operating.

## DATASET: READY FOR EVALUATION

All six export modes are implemented and org-scoped.

## MESSAGE REVIEW: READY

Tool + persistence exist; no human scores.

## THESIS REVIEW: READY

Tool + persistence exist; no human scores.

## ROUTING REVIEW: READY

Persistence exists; 0 judged.

## PRODUCTION ACTIVATION: RUNBOOK READY

The runbook exists; it has not been executed.

## SCORING: KEEP V3
## ROUTING: V1 LIVE / V2 SHADOW
## CANDIDATE PROMOTION: NO-GO
## POST-MVP: WAIT FOR 100 REAL LABELS

---

*Skipped: browser pass (no running app); message/thesis campaign headers; funnel conversion + median time; AI-usage UI verification; human reviews | Risk: zero labels; the campaign is not operating; the runbook is unexecuted; the export modes are unapplied*