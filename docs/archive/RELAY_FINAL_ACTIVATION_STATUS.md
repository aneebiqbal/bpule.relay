# Relay — Final Production Activation — Status

**Date:** 2026-10-25 · **Scoring:** V3 (unchanged) · **Shadow:** enabled, not promoted
**Companion docs:** `docs/RELAY_DAILY_OPERATIONS_RELEASE.md` · `docs/RELAY_ACTIVATION_STATUS.md`

> **Gate honesty:** the pass gate requires a deployed SHA, applied migrations, RLS tenant tests, browser flows, a rebuilt Today/Lead Detail, routing QA UI, the first 100 labels, and human message/thesis reviews. This environment has no production access, no browser, and no human reviewers. **The gate does NOT pass** — and per the sprint's own hard rule, no new architecture may be started until it does.

---

## DEPLOYED SHA

**UNKNOWN.** No Vercel access. HEAD ≠ deployed SHA cannot be confirmed. `/api/version` not compared.

## MIGRATIONS

Seven written, **none applied**: `20261024120000`–`…0005` + `20261025120000` (RPC hardening 2). Verified absent in production: `messages.sender_profile_id`, `revenue_identity_id`, `sender_attribution_status`, `thread_status`, `conversation_facts`.

## TENANT SECURITY

Org scoping verified in the Sprint A audit. New gates: `/api/admin/qa-views`, `/api/admin/routing-opportunities`, `/api/admin/performance` (self-or-admin), `/api/admin/rep-performance`, dataset `HUMAN_FEEDBACK` (own leads). **Tenant matrix not run against production.**

## SECURITY DEFINER — every function classified

| Function | Classification |
|---|---|
| `current_org_id`, `is_org_admin` | SAFE |
| `set_intelligence_sample_event_org` | FIXED |
| `append_sample_event` | FIXED |
| `approve_sample_for_training` | FIXED |
| `append_rescore_event` | **FIXED this pass** (org check) |
| `refresh_few_shot_wins`, `match_proofs_by_embedding`, `archive_search` | SAFE (org param + deny, `0042`/`0082`) |
| `emit_relay_event`, `create_relay_run`, `transition_relay_run`, `get_run_events` | SAFE |
| `atomic_log_send`, `record_activity_event`, `is_org_working_day`, `record_canonical_progress`, `ensure_day_close`, `ensure_day_closes_for_person` | SAFE (explicit org/rep param) |
| `check_followup_eligible`, `notify_on_reply`, `sync_lead_status_from_outcomes`, `ensure_daily_accountability` | SAFE (trigger functions) |
| `business_days_between`, `next_sample_version` | SAFE (pure helpers) |
| `cleanup_rate_limits`, `current_rep_id`, `is_admin`, `current_rep_id_v2` | OPEN → REMOVE candidate (no callers; documented blocker: needs a coordinated migration + external-consumer scan) |

No SECURITY DEFINER mutator reachable by a rep is left without an org guard.

## SPRINT A/B LIVE RESULTS

**NOT RUN.** Unit-verified only.

## MESSAGE HUMAN REVIEW

**NOT DONE.** No human reviewer.

## MESSAGE PASS RATE

**N/A.**

## TODAY UX / LEAD DETAIL UX

**NOT REBUILT.**

## ROUTING QA

Data + API exist (`/api/admin/qa-views?section=routing`); **UI not built**.

## ROUTING LABELS

APIs exist; **0 recorded**.

## QUICK LABEL UX / PAIRWISE UX

APIs exist; **0 recorded**.

## REAL LABEL COUNT

**0.**

## SCORE STALENESS

`score-staleness.ts` + `/api/admin/qa-views?section=staleness` + `stale-reanalysis.ts` (dry-run). **31% stale.** UI not built.

## THREAD REVIEW UX

Data exists; **UI not built**.

## OUTCOME METRICS

`outcome-timings.ts` exists; **not surfaced**.

## AI USAGE

Backend paginates; admin UI not verified.

## THESIS HUMAN REVIEW

**NOT DONE.**

## REAL DATA COVERAGE

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
| current-score | 250/397 (63%) |
| stale-score | 121/397 (30.5%) |
| sender-attributed | 0% |
| thread-verified | 0% |
| label coverage | 0 |

## PERFORMANCE

Accountability 252→3 queries; AI usage paginates. Today/Lead Detail/QA counts not measured.

## SIMPLIFICATION

Second pass removed 5 dead lib modules. `intelligence-v2` kept (live runtime imports).

## BUILD

**PASS** (see build log).

## TESTS

- New final suite: 4 tests pass.
- `tsc --noEmit`: clean.
- **Full suite: 3,098 pass / 6 fail** — the same 6 pre-existing `hardening-regression` failures; **no new failures**.

## BROWSER

**NOT RUN.**

## PII HISTORY

**OPEN — OWNER ACTION REQUIRED.** No authorization to rewrite history; the plan is ready (`docs/PII_GIT_REMEDIATION.md`).

## FILES CHANGED (this pass)

- `src/lib/intelligence-v3/stale-reanalysis.ts` (new)
- `supabase/migrations/20261025120000_security_definer_hardening_2.sql` (new)
- `tests/relay-final-2026-10-25.test.ts` (new)
- `docs/RELAY_DAILY_OPERATIONS_RELEASE.md`, `docs/RELAY_FINAL_ACTIVATION_STATUS.md` (new/updated)

## REMAINING RISKS

1. Seven migrations unapplied.
2. Browser gate unsigned.
3. Zero labels — learning loop inactive.
4. Today / Lead Detail not rebuilt.
5. Routing QA UI not built.
6. Human message/thesis review not done.
7. Four dead SECURITY DEFINER functions unremoved.
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

*Skipped: deployment parity, migration apply, RLS tenant test, browser E2E, Today/Lead Detail rebuild, routing QA UI, first-100 label campaign, message/thesis human review, dead-RPC removal | Risk: the new columns/tables/RLS are absent in production; the learning loop is empty; four dead SECURITY DEFINER functions remain*