# Relay — Production Activation Runbook

**Purpose:** the exact, ordered, no-guesswork sequence to take Relay from code to a live, learning product.
**Prerequisite:** the intended release SHA is known and frozen.

> Every step below is a command or a check with an expected result. If a step fails, stop and fix it before continuing. Do not mark a step done by assumption.

---

## 0. Freeze

- [ ] Announce a deploy freeze; no merges to `main`.
- [ ] Record the intended release SHA: `git rev-parse HEAD` → `________`.
- [ ] Record the branch: `________` and `origin/main`: `________`.
- [ ] Confirm the working tree is clean (`git status`).

## 1. Deploy

- [ ] Deploy the intended SHA (Vercel/CI). Do not deploy `main` if it moved.
- [ ] Record the deployment ID: `________`.
- [ ] Verify the deployed SHA matches: `curl -s https://<host>/api/version` → the SHA must equal the intended SHA. **If it differs, stop.**

## 2. Apply migrations (exact order)

```bash
# in order; verify the schema after each
supabase migration up   # or apply each file in order
```

1. `20261024120000_intelligence_sample_events_rls`
2. `20261024120001_followup_trigger_canonical`
3. `20261024120002_sender_context`
4. `20261024120003_conversation_facts`
5. `20261024120004_thread_status`
6. `20261024120005_security_definer_hardening`
7. `20261025120000_security_definer_hardening_2`
8. `20261025120000_review_evaluations`

- [ ] After each: confirm no error; confirm the migration appears in history.
- [ ] Verify `messages.sender_profile_id`, `revenue_identity_id`, `sender_attribution_status`, `thread_status` exist.
- [ ] Verify `conversation_facts`, `message_evaluations`, `thesis_evaluations`, `routing_evaluations` exist.
- [ ] Verify `intelligence_sample_events` has RLS enabled and `int_events_org_read`/`insert` policies.
- [ ] Verify `append_rescore_event`, `append_sample_event`, `approve_sample_for_training` are the hardened versions.

## 3. RLS tenant matrix

Create two orgs (A, B) and one rep each. As REP A:
- [ ] Cannot read Org B lead → 0 rows.
- [ ] Cannot read Org B message → 0 rows.
- [ ] Cannot read a Org B dataset sample → 404.
- [ ] Cannot call `append_sample_event` for a Org B sample → denied.
- [ ] Cannot call `approve_sample_for_training` → denied (admin only).
- [ ] Cannot read `/api/admin/qa-views` → 403.
- [ ] Cannot change another rep's lead → denied.

As ADMIN A:
- [ ] Can read Org A data only.
- [ ] Can approve a training sample in Org A.

As MANAGER A: [ ] Only the managed team's scope.

As OWNER: [ ] Org-wide.

## 4. Sprint A/B live browser suite (on the deployed SHA)

- [ ] **Opt-out**: send a reply "Please do not send me any additional messages." → `DO_NOT_CONTACT`, terminal, no follow-up, no queue task, no send button.
- [ ] **Refusal**: "We decided to handle this internally." → `lost`/closed, no follow-up.
- [ ] **Fabrication**: a draft with an unsupported company/domain/number/metric → blocked, reason shown, no Log Sent.
- [ ] **Generic cold**: "Loved what you're building…" → blocked or regenerated, not silently sendable.
- [ ] **Commercial reply**: "Budget is around $30k. Can we talk Thursday?" → `BUDGET_DISCLOSED` + `MEETING_REQUEST`, a budget fact persisted, next action = schedule meeting.
- [ ] **Proposal**: "Can you send us a proposal?" → `PROPOSAL_REQUEST` → `PREPARE_PROPOSAL`.
- [ ] **Thread mismatch**: attach a message from the wrong sender → 409 `THREAD_MISMATCH_REVIEW_REQUIRED`, no attachment.
- [ ] **Unverified paste**: no sender identity → `thread_status = UNVERIFIED`, not silently VERIFIED.

## 5. Live data checks

- [ ] Send one controlled message → `messages.sender_profile_id`, `revenue_identity_id`, `sender_attribution_status` populated.
- [ ] Post one inbound reply → `conversation_facts` row with the quoted fact, source message id, confidence.
- [ ] Confirm `conversation_states.next_followup_at` is set after an outbound.

## 6. First human label

- [ ] Open `/admin/training-data` → the campaign header shows `0 / 100`.
- [ ] Label one real opportunity with a quick label → the count becomes `1 / 100`.

## 7. First evaluations

- [ ] `/admin/qa` → Routing: mark V1/V2 correct + best sender → persisted (`routing_evaluations`).
- [ ] `/admin/qa` → Message review: score 1–5 + classification → persisted (`message_evaluations`).
- [ ] `/admin/qa` → Thesis review: STRONG/USEFUL/WEAK/MISLEADING → persisted (`thesis_evaluations`).
- [ ] Pairwise: record one A/B/TIE/UNSURE → persisted (`scoring_pairwise_labels`).

## 8. Analytics sanity

- [ ] `/admin/ai-usage` shows non-zero spend and full-range totals (no 1000-row truncation).
- [ ] `/admin/qa` → Revenue funnel shows the canonical stages.
- [ ] `/admin/accountability` shows real wins (not 0) and no N+1 spike.

## 9. Begin the first-100 campaign

- [ ] Review daily from `/admin/training-data`, in priority order, using keys 1–5.
- [ ] Track median review time; target < 10 s.
- [ ] When ≥ 100 labels exist, open `/admin/qa` → Model comparison → it must read `PROMOTION STUDY` (never auto-promotes).

---

## Rollback

- [ ] Migrations are additive; to roll back, restore the prior DB snapshot and redeploy the prior SHA.
- [ ] Do not delete evaluation rows to "reset" a campaign.

## Sign-off

- [ ] Deployed SHA == intended SHA.
- [ ] Migrations applied and schema verified.
- [ ] Tenant matrix passes.
- [ ] Sprint A/B passes.
- [ ] First label + first evaluations recorded.
- [ ] Analytics truthful.

**Only then** may Relay begin the first-100 campaign and consider post-MVP growth features.
