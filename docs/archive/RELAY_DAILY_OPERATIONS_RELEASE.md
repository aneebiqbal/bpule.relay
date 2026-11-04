# Relay — Daily Operations Release

**Date:** 2026-10-24 · **Scoring:** `relay_decision_v3.3.0` (V3) · **Shadow:** enabled, not promoted · **Deployed SHA:** NOT VERIFIED (no Vercel access)

> This release makes Relay *safe and coherent*; it does **not** yet prove itself on a deployed SHA. The browser gate is unsigned, migrations are unapplied, and the learning loop has zero labels.

---

## Deployed SHA

**UNKNOWN.** No Vercel CLI / deployment access in this environment. `/api/version` could not be compared to HEAD. **Browser claims are invalid until the intended SHA is deployed and verified.**

## Migrations

| Migration | Status |
|---|---|
| `20261024120000_intelligence_sample_events_rls` | written, **unapplied** |
| `20261024120001_followup_trigger_canonical` | written, **unapplied** |
| `20261024120002_sender_context` | written, **unapplied** |
| `20261024120003_conversation_facts` | written, **unapplied** |
| `20261024120004_thread_status` | written, **unapplied** |
| `20261024120005_security_definer_hardening` | written, **unapplied** |

Until `20261024120002/3/4` are applied, `messages.sender_profile_id`, `revenue_identity_id`, `sender_attribution_status`, `thread_status`, and `conversation_facts` do **not** exist in production (verified: the columns are absent today).

## Browser pass

**NOT RUN.** No running app / deployed SHA. The Sprint A/B safety path (opt-out, terminal block, fabrication block, sender persistence, facts, thread mismatch) is unit-verified only.

## Role matrix

| Role | Data scope | Notes |
|---|---|---|
| OWNER | org-wide | full admin |
| ADMIN | org-wide | `can(ctx,'VIEW_TEAM_ANALYTICS')` on gated routes |
| MANAGER | managed teams | team analytics only |
| REP | own + team-visible | gated from admin routes |

Cross-org denial verified in the Sprint A audit (org scoping by construction). New gates this pass: `/api/admin/routing-opportunities`, `/api/admin/performance` (self-or-admin), `/api/admin/rep-performance`, dataset `HUMAN_FEEDBACK` (own leads), SECURITY DEFINER RPCs.

## Data status

| Store | Count |
|---|---|
| leads | 397 |
| captured_prospects | 724 |
| messages | 537 |
| intelligence_samples / events | 434 / 1,343 |
| scoring_shadow_decisions | 2,900 |
| scoring_labels / pairwise | **0 / 0** |
| proof_cards / proof_items | 39 / 0 |
| ai_traces | 3,010 |

| Metric | Value |
|---|---|
| Current-score coverage | 250/397 (63%) |
| Stale-score coverage | 121/397 (30.5%) |
| Unscored | 26/397 (6.5%) |
| Thread verified % | 0% (column absent until migration) |
| Sender attribution % | 0% (column absent until migration) |
| Messages with `sender_profile_id` | 0/537 (all NULL — the bug, now fixed in code) |
| Terminal leads | 7 (no/lost/won) |
| Label coverage | **0** |
| Routing v1/v2 comparison coverage | shadow-only; not exposed in UI |
| Message blocked % (120-sample gate) | 5% (2 fabricated + 4 unsupported) |

## Message quality

Safety gate blocks fabricated claims, unsupported claims and generic/networking openers. Sales thesis is auto-derived and labelled FACT/HYPOTHESIS/UNKNOWN. **No human pass rate exists** (no human review performed).

## Labels

Quick-label and pairwise APIs are wired and tested. **Zero labels recorded** — the workflow works; nobody has used it.

## Routing

Routing v1 live; v2 shadow. v1/v2 comparison is not exposed in admin QA; the shadow table is populated (2,900 rows).

## Staleness

`score-staleness.ts` reports current/stale/unscored coverage and the stale-version breakdown. 31% of rows are stale; the UI change to surface it was not built.

## Known risks

1. Migrations unapplied — RLS, sender context, facts, thread status, RPC hardening absent in production.
2. Browser gate unsigned.
3. Zero labels — the learning loop is inactive.
4. Today / Lead Detail not redesigned.
5. Routing v2 comparison not exposed.
6. PII history open.
7. AI-usage stats paginate now, but the admin page still fetches a single page.
8. SECURITY DEFINER RPCs for orchestration/relay remain unreviewed beyond the two hardened.

## Final activation pass (2026-10-25)

### SECURITY DEFINER audit — every function classified

| Function | Classification | Basis |
|---|---|---|
| `current_org_id`, `is_org_admin` | **SAFE** | the tenant helpers |
| `set_intelligence_sample_event_org` | **FIXED** | org-derived |
| `append_sample_event` | **FIXED** | org check (`20261024120005`) |
| `approve_sample_for_training` | **FIXED** | admin + org check (`20261024120005`) |
| `append_rescore_event` | **FIXED** | org check (`20261025120000`) |
| `refresh_few_shot_wins` | **SAFE** | org param + cross-org deny (`0042`/`0082`) |
| `match_proofs_by_embedding` | **SAFE** | org param + deny (`0042`) |
| `archive_search` | **SAFE** | org param + deny (`0042`) |
| `emit_relay_event`, `create_relay_run` | **SAFE** | org-checked |
| `transition_relay_run`, `get_run_events` | **SAFE** | org param + deny |
| `atomic_log_send`, `record_activity_event`, `is_org_working_day`, `record_canonical_progress`, `ensure_day_close`, `ensure_day_closes_for_person` | **SAFE** | explicit org/rep parameter; internal or trigger callers |
| `check_followup_eligible`, `notify_on_reply`, `sync_lead_status_from_outcomes`, `ensure_daily_accountability` | **SAFE** | trigger functions (not RPC-callable) |
| `business_days_between`, `next_sample_version` | **SAFE** | pure helpers, no mutation |
| `cleanup_rate_limits`, `current_rep_id`, `is_admin`, `current_rep_id_v2` | **OPEN → REMOVE candidate** | no callers found in `src` or migrations; harmless but dead. Blocked: removal needs a coordinated migration and a scan of any external consumer. |

No SECURITY DEFINER mutator reachable by a rep is left without an org guard.

### Controlled stale reanalysis

`src/lib/intelligence-v3/stale-reanalysis.ts` produces a **dry-run** report (stale count, sample, version breakdown) and never mass-writes. Applying is an explicit per-lead action.

### Live data migration check

**NOT RUN.** The new columns are absent in production until the migrations are applied.

## To close the gate

1. Deploy the intended SHA; record the SHA and `/api/version`.
2. Apply the seven migrations in order; verify schema, RLS, policies, triggers.
3. Run the tenant/role security matrix (OWNER A / ADMIN A / MANAGER A / REP A / REP B).
4. Run the Sprint A/B browser matrix on the deployed SHA.
5. Redesign Today and Lead Detail.
6. Produce the first 100 real labels + human message/thesis reviews.
7. Surface routing v1/v2 comparison in the QA UI.
