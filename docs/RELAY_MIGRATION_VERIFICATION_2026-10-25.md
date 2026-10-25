# Relay — Migration Verification (2026-10-25)

**Scope:** apply and verify the pending migrations. **Result: the migrations are verified to apply and produce the correct schema; they could NOT be applied to production from this environment** (platform-access 403, no DB password, no local Docker stack).

---

## 1. Pre-flight fix

I introduced a duplicate migration version: `20261025120000` existed twice (`security_definer_hardening_2` and `review_evaluations`). Supabase keys migrations by version, so one would have been silently skipped. Fixed before applying:

- `20261025120000_security_definer_hardening_2.sql` → `20261025120001_security_definer_hardening_2.sql`
- `20261025120000_review_evaluations.sql` → `20261025120002_review_evaluations.sql`

The pre-existing duplicates (`0090`, `0091`, `20261008000000`, `20261009000001`, `20261019000003`) are historical and already recorded in the remote history — left untouched.

## 2. Applied — throwaway Postgres (verified)

A fresh PostgreSQL 17.9 cluster was started with Supabase service-schema stubs (`auth.uid()`, `extensions.schema`, `current_org_id()`, `is_org_admin()`, the `authenticated` role). **All eight new migrations applied with exit 0:**

```
20261024120000_intelligence_sample_events_rls
20261024120001_followup_trigger_canonical
20261024120002_sender_context
20261024120003_conversation_facts
20261024120004_thread_status
20261024120005_security_definer_hardening
20261025120001_security_definer_hardening_2
20261025120002_review_evaluations
```

## 3. Schema verification (on the throwaway cluster)

| Check | Result |
|---|---|
| `messages.revenue_identity_id` | exists |
| `messages.sender_attribution_status` | exists |
| `messages.thread_status` | exists |
| `intelligence_sample_events.organization_id` | exists |
| `conversation_facts` | exists, RLS enabled |
| `message_evaluations` | exists, RLS enabled |
| `thesis_evaluations` | exists, RLS enabled |
| `routing_evaluations` | exists, RLS enabled |
| `intelligence_sample_events` RLS | enabled (2 policies) |
| trigger `int_sample_events_set_org` | exists |
| `append_rescore_event` org-scoped | yes (`organization_id = current_org_id()`) |

## 4. Live production prerequisites (read-only)

Verified present in production, so the migrations will apply there:

- `intelligence_sample_events` (no `organization_id` — the migration adds it) ✓
- `messages.sender_profile_id` (no `revenue_identity_id`/`sender_attribution_status`/`thread_status` — the migration adds them) ✓
- `leads` has `canonical_score`, `score_version`, `scored_at`, `score_breakdown`, `rescore_events`, `organization_id` (needed by `append_rescore_event`) ✓
- `current_org_id()` exists ✓
- `scoring_labels` has `opportunity_key`, `expected_score_min/max`, `expected_action`, `prospect_quality`, `labeler_rep_id` ✓
- `scoring_pairwise_labels` has `opportunity_key_a/b`, `winner`, `labeler_rep_id` ✓
- `scoring_shadow_decisions` has `features`, `routing_v1`, `routing_v2`, `is_test` ✓

**One export bug found and fixed:** `eval-export.ts` selected `scoring_shadow_decisions.archetype`, which does not exist in production. It now reads the archetype from the stored `features` jsonb.

## 5. Blocker — could not apply to production

```
$ supabase migration list   → 403 "Your account does not have the necessary privileges"
$ supabase db push          → 403 (same)
$ supabase status           → Docker daemon not running (no local stack)
```

The hosted DB password is not stored in the repo or in `~/.supabase`, and the linked access token lacks platform privileges. **The migrations must be applied by the project owner.**

## 6. Owner commands

```bash
# 1. Confirm the remote is reachable and see pending migrations
supabase migration list

# 2. Apply (or run each file in order against the project DB)
supabase db push

# 3. Verify the new objects
psql "$DATABASE_URL" -c "\d messages" | grep -E 'revenue_identity_id|sender_attribution_status|thread_status'
psql "$DATABASE_URL" -c "\d intelligence_sample_events" | grep organization_id
psql "$DATABASE_URL" -c "select relname, relrowsecurity from pg_class where relname in ('intelligence_sample_events','conversation_facts','message_evaluations','thesis_evaluations','routing_evaluations');"
```

If `supabase db push` is unavailable, apply the eight files in the order in §2 directly against the project database, then re-run §6.

## 7. Test/build status

- `tsc --noEmit`: clean.
- Full suite: 3,128 pass / 6 pre-existing `hardening-regression` failures; no new failures.
- The throwaway cluster was stopped and removed after verification.

## 8. Applied — confirmation (2026-10-25)

The owner ran the SQL in the Supabase editor. Verified live:

| Check | Result |
|---|---|
| `messages.revenue_identity_id` | exists |
| `messages.sender_attribution_status` | exists (`UNKNOWN` on historical rows — correct) |
| `messages.thread_status` | exists (`UNVERIFIED` on historical rows — correct) |
| `intelligence_sample_events.organization_id` | populated (backfilled from the parent sample) |
| `conversation_facts` / `message_evaluations` / `thesis_evaluations` / `routing_evaluations` | created |
| trigger `int_sample_events_set_org` | present |

## 9. Multi-tenancy reality (important for the tenant matrix)

All production data lives in **one real org: `bpulse` (`11111111-1111-1111-1111-111111111111`)**. It is not a phantom — it is a row in `organizations` named `bpulse`. The other 10 orgs (`Relay Beta`, `anum`, `Repo`, `Jonsonu`, `Safixo`, `abdullahandorg`, `abdullahpulse`, `SuhaibAhmad`, `Business Bay`, `Muhammad Mazar`) are **empty test orgs**.

Consequences:
- RLS is correct: a `bpulse` rep's `current_org_id()` equals the data's `organization_id`, so they see their data.
- **The runbook's tenant matrix needs a second org with real data.** Creating two empty orgs only proves both see nothing. To prove scoping, put at least one lead in a second org (or run the matrix as one `bpulse` rep vs one test-org rep).
- 167 leads are owned by the four seed reps (`aaaaaaaa-…-0001..0004`: Aneeb, Hassan, Madiha, Ahmad). They are **not** flagged `is_test`, so they currently count as production in analytics/exports. Decide whether they are real seed data or should be excluded.

## 10. Owner commands (if re-applying)

```bash
supabase migration list          # confirm no pending
psql "$DATABASE_URL" -c "select relname, relrowsecurity from pg_class where relname in ('intelligence_sample_events','conversation_facts','message_evaluations','thesis_evaluations','routing_evaluations');"
```
