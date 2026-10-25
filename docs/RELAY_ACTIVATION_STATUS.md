# Relay — Activation + Human Proof + Daily Operations — Status

**Date:** 2026-10-24 · **Scoring:** V3 (unchanged) · **Shadow:** enabled, not promoted
**Companion docs:** `docs/RELAY_DAILY_OPERATIONS_RELEASE.md` · `docs/RELAY_PRODUCTION_CLOSURE_STATUS.md`

> **Gate honesty:** the pass gate requires a deployed SHA, applied migrations, RLS tenant tests, browser flows, Today/Lead Detail rebuilds, human reviews and the first labels. This environment has no production access, no browser, and no human reviewers. **The gate does NOT pass.** Everything buildable here is built, tested and build-green; the human/production steps are listed as the remaining activation path.

---

## DEPLOYED SHA

**UNKNOWN.** No Vercel access. HEAD ≠ deployed SHA cannot be confirmed. `/api/version` not compared.

## MIGRATIONS

Six written, **none applied**. Verified absent in production: `messages.sender_profile_id`, `revenue_identity_id`, `sender_attribution_status`, `thread_status`, `conversation_facts`.

## TENANT SECURITY

Org scoping and cross-org denial verified in the Sprint A audit. New gates: `/api/admin/qa-views`, `/api/admin/routing-opportunities`, `/api/admin/performance` (self-or-admin), `/api/admin/rep-performance`, dataset `HUMAN_FEEDBACK` (own leads), SECURITY DEFINER RPCs. **Tenant matrix not run against production.**

### SECURITY DEFINER inventory (SAFE / FIXED / OPEN)

| Function | Status |
|---|---|
| `current_org_id`, `is_org_admin` | SAFE (the helpers) |
| `set_intelligence_sample_event_org` | FIXED (org-derived) |
| `append_sample_event` | **FIXED** (org check) |
| `approve_sample_for_training` | **FIXED** (admin + org check) |
| `emit_relay_event`, `create_relay_run` | SAFE (org-checked) |
| `refresh_few_shot_wins`, `match_proofs_by_embedding`, `archive_search` | OPEN (used by RPCs; org passed as a parameter — not re-verified) |
| `atomic_log_send`, `sync_lead_status_from_outcomes`, `transition_relay_run`, `get_run_events`, `append_rescore_event`, `record_canonical_progress`, `ensure_day_close`, `next_sample_version`, `cleanup_rate_limits` | OPEN (trigger/internal callers; not re-verified) |
| legacy `current_rep_id`, `is_admin` (0001) | OPEN (superseded by `current_org_id`/`is_org_admin`; unused) |

## SPRINT A/B LIVE RESULTS

**NOT RUN.** Unit-verified only.

## MESSAGE HUMAN REVIEW

**NOT DONE.** No human reviewer available.

## MESSAGE PASS RATE

**N/A** — no human scores. The safety gate blocks fabricated/unsupported/generic; a 120-message sample found 2 fabricated + 4 unsupported.

## TODAY UX

**NOT REBUILT.** No browser.

## LEAD DETAIL UX

**NOT REBUILT.** Thesis/facts/thread/staleness helpers are available.

## ROUTING QA

**DATA + API DONE.** `src/lib/relay/routing-comparison.ts` computes v1/v2 + flags (`V1_V2_DISAGREE`, `BEST_SENDER_INACCESSIBLE`, `NO_VERIFIED_PROOF`, `CURRENT_SENDER_UNKNOWN`, `PLATFORM_MISMATCH`). `src/lib/admin/qa-views.ts` + `GET /api/admin/qa-views` expose routing, staleness, threads and stale-lead report. **The UI page wiring is not built.**

## ROUTING LABELS

Persisted via `scoring_labels.best_sender_profile_id` / `decision_correct` (quick + detailed). **Zero recorded.**

## QUICK LABEL UX

The Training Data page has the quick-label controls (verified in the prior audit). **Zero labels recorded.**

## PAIRWISE UX

Pairwise API wired (`mode: 'pairwise'` → `scoring_pairwise_labels`). **Zero recorded.**

## REAL LABEL COUNT

**0.**

## SCORE STALENESS

`score-staleness.ts` + `/api/admin/qa-views?section=staleness` report current/stale/unscored. **31% stale (121/397).** No mass auto-write; a controlled re-analysis report (`staleLeadIds`) exists.

## THREAD REVIEW UX

`messages.thread_status` (`VERIFIED`/`UNVERIFIED`) + `/api/admin/qa-views?section=threads` list unverified threads. **Review/Confirm/Reassign UX not built.**

## OUTCOME METRICS

`outcome-timings.ts` derives the timestamps/durations. Not surfaced in a dashboard.

## AI USAGE

Backend paginates. Admin UI not verified to consume full totals.

## THESIS HUMAN REVIEW

**NOT DONE.**

## REAL DATA COVERAGE

| Store | Count |
|---|---|
| leads / prospects | 397 / 724 |
| messages | 537 |
| samples / events | 434 / 1,343 |
| shadow decisions | 2,900 (calibrated_v4 261, ordinal_logit 249, gbdt_pairwise 246, knn_features 244) |
| labels / pairwise | 0 / 0 |
| proof_cards / proof_items | 39 / 0 |
| ai_traces | 3,010 |

| Metric | Value |
|---|---|
| current-score | 250/397 (63%) |
| stale-score | 121/397 (30.5%) |
| sender-attributed | 0% (column absent until migration) |
| thread-verified | 0% (column absent until migration) |
| thesis coverage | shadow `sales_thesis` populated on 380/1000 sampled rows |
| routing comparison coverage | 380/1000 sampled shadow rows |
| label coverage | 0 |

## PERFORMANCE

Accountability 252→3 queries; AI usage paginates. Today/Lead Detail/QA API counts not measured (no running app).

## SIMPLIFICATION

**Second pass done.** Removed: `relay/timing-engine.ts`, `orchestration/next-action.ts`, `relay/hallucination-guard.ts`, `relay/objection-memory.ts`, `relay/message-eligibility.ts`. `intelligence-v2` was **kept** — it has live runtime imports (`produceCanonicalIntelligence`).

## BUILD

**PASS** (`pnpm build`, exit 0). Removed routes are absent from the build output.

## TESTS

- New activation suite: 6 tests pass.
- `tsc --noEmit`: clean.
- **Full suite: 3,094 pass / 6 fail** — the same 6 pre-existing `hardening-regression` failures; **no new failures**. Two test files for the deleted dead modules were removed with them.
- Two test files for the deleted dead modules (`message-eligibility`, `orchestration/next-action`) were removed with them.

## BROWSER

**NOT RUN.**

## FILES CHANGED (this pass)

- `src/lib/relay/routing-comparison.ts` (new)
- `src/lib/admin/qa-views.ts` (new)
- `src/app/api/admin/qa-views/route.ts` (new)
- Removed 5 dead lib modules
- `tests/relay-activation-2026-10-24.test.ts` (new)

## REMAINING RISKS

1. Six migrations unapplied.
2. Browser gate unsigned.
3. Zero labels — learning loop inactive.
4. Today/Lead Detail not rebuilt.
5. Routing QA UI not built.
6. Human message/thesis review not done.
7. SECURITY DEFINER inventory partly OPEN.
8. PII history open.

---

## PRODUCT STATUS: CONDITIONAL
## MESSAGE STATUS: NEEDS IMPROVEMENT
## THESIS STATUS: NEEDS CALIBRATION
## DATA STATUS: PARTIAL
## LEARNING LOOP: INACTIVE
## ROUTING: SHADOW ONLY
## SCORING: KEEP V3
## CANDIDATE PROMOTION: NO-GO
## POST-MVP: STABILIZE FIRST

---

*Skipped: deployment parity, migration apply, RLS tenant test, browser E2E, Today/Lead Detail rebuild, routing QA UI, first-100 label campaign, message/thesis human review | Risk: the new columns/tables/RLS are absent in production; the learning loop is empty; SECURITY DEFINER inventory partly open*