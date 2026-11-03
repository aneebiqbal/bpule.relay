# Relay migration reconciliation, 2026-11

Draft for human review. Prepared 2026-11-01 from a read-only, schema-only production dump and the
`supabase migration list --linked` output. No row data was read, nothing was applied or repaired.

## 1. Result

The migration history says 53 version rows are unrecorded. Those rows cover **55 local files**: versions
`0090` and `0091` each have two files, and some 2026 versions repeat (see §2). The schema dump shows
that almost all of them were applied out of band. One example: `action_events` is created only by the
unrecorded `20261005000000`, yet it exists in production.

| Category | Files |
|---|---|
| Schema effect fully present, safe to record as applied | 47 (44 files in the 2026 range, plus 3 files under the already recorded `0090`/`0091`) |
| No schema effect (assertions only) | 1 (`20261006000001`) |
| Schema effect UNKNOWN (storage only, outside the dump) | 1 (`0091_profile_spreadsheet_support.sql`) |
| **Truly needs applying** | **6** listed: `20261023000000`, `20261029120001`, `20261031120000`, `20261101120000`, `20261101130000`, `20261101140000`, plus **2** written after the listing: `20261101135000`, `20261101151000` |

On its own, `20261101140000` **fails**: production `notifications` has no `recipient_id` or
`dedupe_key` column (§5.2). `20261101135000` adds them and must run first.

Caveats on the "fully present" count: 11 of those files also contain data backfills, and their
row-level effect is UNKNOWN (§4.4). `0090_profile_intelligence_v2.sql` is counted as present for the
public schema only; its storage part is UNKNOWN.

Out-of-listing files:
- `apply_observability_ddl.sql`: the CLI skips it because the name has no version. Its DDL is a
  subset of `20261006000000` and is present.
- `20261101135000_notifications_canonical_shape.sql` and `20261101151000_lead_message_previews.sql`:
  written during this review, after the 09:35 listing, so they are not among the 53 rows. Both were
  run in the isolated harness (§9.1). See §5.2 and §7.

## 2. Version collisions: RESOLVED 2026-11-01 (second pass)

Production's history table (`supabase_migrations.schema_migrations`, read-only dump, names and SQL
only) recorded `0090` = `add_org_columns` and `0091` = `fix_targets_schema`. Every collision now has
one file per version. The file production recorded, or the one unsafe to re-run, keeps the original
version, and the order is preserved:

| Was | Now |
|---|---|
| `0090_profile_intelligence_v2` | `00905_profile_intelligence_v2` (no dependency on 0089/0090 columns) |
| `0091_profile_spreadsheet_support` | `00915_profile_spreadsheet_support` |
| `20261008000000_action_ledger_idempotency` | `20261008000001_…` (`action_ledger_fix_check` keeps …000000) |
| `20261008000000_studio_v3_visual_director_enhancement` | `20261008000002_…` |
| `20261009000001_upwork_extraction_enhancements` | `20261009000003_…` (`fix_content_rls` keeps …000001) |
| `20261019000003_org_settings` | `20261019000004_…` (`help_requests` keeps …000003) |
| `20261101150000_lead_message_previews` (collided with the concurrent `…150000_pin_security_definer_search_path`) | `20261101151000_lead_message_previews` |

Repair list update for §8: replace `20261008000000 20261009000001 20261019000003` with
`20261008000000 20261008000001 20261008000002 20261009000001 20261009000003 20261019000003 20261019000004`,
and add `00905 00915`. `00915` only updates a storage bucket's MIME list, which the dump cannot
show; it is idempotent and safe to re-run instead. Environments that already ran the renamed files
will see them as pending: mark them applied, never re-run them blindly (§4.3).
`supabase/catchup/2026-10-19-*.sql` keep the old names as dated records.

The original analysis follows, kept for the record.

### 2.0 Original finding



`supabase_migrations.schema_migrations` is keyed on `version`, so it can hold only one row per numeric
prefix. These local versions map to more than one file:

| Version | Files | History state |
|---|---|---|
| `0090` | `0090_add_org_columns.sql`, `0090_profile_intelligence_v2.sql` | Recorded once. The CLI pairs the remote row with one file and lists the other as pending. **Which file the remote row was written for is UNKNOWN**; the team can check `select version, name from supabase_migrations.schema_migrations where version in ('0090','0091')`. |
| `0091` | `0091_fix_targets_schema.sql`, `0091_profile_spreadsheet_support.sql` | Same as `0090`. |
| `20261008000000` | `action_ledger_fix_check`, `action_ledger_idempotency`, `studio_v3_visual_director_enhancement` | Not recorded (3 files) |
| `20261009000001` | `fix_content_rls`, `upwork_extraction_enhancements` | Not recorded (2 files) |
| `20261019000003` | `help_requests`, `org_settings` | Not recorded (2 files) |

What this means in practice:
- `migration repair --status applied 20261008000000` writes one row. The CLI will then show the other
  files as pending, which is the `0090` situation today.
- A later `supabase db push` could try to run a "pending" duplicate. Several duplicates are
  superseded files that must not be re-run (§4.3). For example, re-running
  `20261008000000_action_ledger_fix_check.sql` would drop `RECOMMENDATION_SHOWN` and
  `RECOMMENDATION_ACTED` from the action_type CHECK.
- Recommendation (team decision, not done here): give every duplicate file a unique version before
  repairing. Pick versions that keep relative order and confirm with a local `supabase db reset`.
  Free versions next to the 2026 collisions: `20261008000001`, `20261008000002`, `20261009000003`,
  `20261019000004`. Hold off on renaming the `0090`/`0091` files until the recorded name is known.

`mig_state.txt` also contains a parse artifact ("A new version of Supabase CLI…" marked
NOT_RECORDED). It is not a migration, which is why 54 lines become 53 real rows.

## 3. Reconciliation table

PRESENT = what running the file now would produce already matches the dump. I compared columns and
types, CHECK value lists, index definitions, policy expressions, function bodies (exact prosrc, ignoring
whitespace), triggers, RLS and grants. "Superseded" means a later file in this same unrecorded batch
replaced the object, and production matches that later file.

| FILE | RECORDED? | SCHEMA EFFECT PRESENT? | SAFE TO MARK APPLIED? | ACTUALLY NEEDS APPLY? | DEPENDENCIES |
|---|---|---|---|---|---|
| 0090_add_org_columns.sql | Ambiguous (v0090 recorded once, 2 files) | YES: 3 `organizations` columns with defaults. NULL backfill UNKNOWN | N/A: version already recorded; fix collision | NO | organizations (0020) |
| 0090_profile_intelligence_v2.sql | Ambiguous (v0090) | YES for public: 28 `profiles` cols + 3 CHECKs, 4 tables, 14 idx, 15 policies, RLS ×4. Storage bucket row + 3 `storage.objects` policies UNKNOWN (not in dump) | N/A (collision) | NO (public); storage UNKNOWN | profiles (0006), reps, current_org_id()/is_admin() (0021) |
| 0091_fix_targets_schema.sql | Ambiguous (v0091 recorded once, 2 files) | YES, superseded: both tables, unique keys, 6 idx, 7 policies, trigger, `ensure_daily_accountability` and 4-arg `record_activity_event` identical. `is_org_working_day` differs only because 20261030120000 replaced it | N/A (collision) | NO. **Never re-run** (§4.3) | 0090_add_org_columns (working_days, holidays), revenue_identities (0081), is_org_admin() (0085) |
| 0091_profile_spreadsheet_support.sql | Ambiguous (v0091) | UNKNOWN: only effect is an UPDATE of the `storage.buckets` row | N/A (collision) | UNKNOWN: check the `profile-sources` MIME list in Studio. Idempotent | profile-sources bucket (0090_profile_intelligence_v2) |
| 20261004000000_profile_enrichment.sql | NO | YES: 3 tables, 30 cols + 3 CHECKs, 8 idx (5 unique), 8 functions identical, append-only trigger, 3 policies, RLS, REVOKE PUBLIC / service_role grants | YES | NO | 0090_profile_intelligence_v2 tables, portfolio_projects (0081), proof_cards (0036) |
| 20261005000000_action_ledger_upwork.sql | NO | YES (partly superseded): 4 tables, 15 idx, 8 policies, RLS, 5 `leads` referral cols (DO block). `action_events` action_type list later widened. `upwork_jobs` CREATE is a no-op (table predates it, from 0009), so its status/budget_type CHECKs never applied, by design | YES | NO | leads, reps, profiles, upwork_jobs (0009) |
| 20261006000000_score_observability.sql | NO | YES: 11 `leads` cols + 2 CHECKs, 2 idx. Score backfill UNKNOWN | YES | NO | leads, profiles |
| 20261006000001_verify_score_migration.sql | NO | N/A: assertions + SELECT only | YES | NO. Re-run raises if any lead has score > 12 (data UNKNOWN) | 20261006000000 |
| 20261006000002_new_trend_sources.sql | NO | YES, superseded: CHECK now also allows `newsapi` (from 20261016000000). Seed rows UNKNOWN | YES | NO. **Never re-run** (§4.3) | trend_sources (20260929180943) |
| 20261007000000_fix_onboarding_rls.sql | NO | YES: 4 insert policies equivalent (only qualification differs) | YES | NO | content_personas (0018), daily_content_* (20260929180943) |
| 20261008000000_action_ledger_fix_check.sql | NO (dup version ×3) | YES, superseded: prod list adds RECOMMENDATION_SHOWN/ACTED (20261022000000) | YES, after collision fix | NO. **Never re-run** | 20261005000000 |
| 20261008000000_action_ledger_idempotency.sql | NO (dup ×3) | YES: col + unique idx identical. Key backfill UNKNOWN | YES, after collision fix | NO | 20261005000000 |
| 20261008000000_studio_v3_visual_director_enhancement.sql | NO (dup ×3) | YES: 8 `daily_content_ideas` cols | YES, after collision fix | NO | daily_content_ideas |
| 20261009000000_semantic_content_memory.sql | NO | YES: vector ext, 2 cols, hnsw + btree idx, function identical | YES | NO | content_memories (0035), vector |
| 20261009000001_fix_content_rls.sql | NO (dup ×2) | YES: 9 `*_owner` policies equivalent | YES, after collision fix | NO | content_* tables (0018–0038), current_rep_id() |
| 20261009000001_upwork_extraction_enhancements.sql | NO (dup ×2) | YES: 6 `upwork_jobs` cols | YES, after collision fix | NO | upwork_jobs |
| 20261009000002_studio_v3_quality_columns.sql | NO | YES: 2 cols | YES | NO | daily_content_ideas |
| 20261016000000_newsapi_trend_sources.sql | NO | YES: CHECK list identical (10 values). Seed rows UNKNOWN | YES | NO | trend_sources |
| 20261016000001_one_connection_per_lead.sql | NO | YES: partial unique idx identical | YES | NO (DELETE now a no-op because the index exists) | messages |
| 20261017000000_conversation_memory.sql | NO | YES: 2 `conversation_states` cols. `messages.direction` fix UNKNOWN | YES | NO | conversation_states (0036), messages.direction (20261001000001) |
| 20261019000000_performance_config.sql | NO | YES: 2 `organization_rulebooks` jsonb cols. UPDATE UNKNOWN | YES | NO | organization_rulebooks (0022) |
| 20261019000001_signal_events.sql | NO | YES: table, 4 idx, RLS, 2 policies equivalent | YES | NO | leads, organizations |
| 20261019000002_performance_config.sql | NO | YES: table, idx, RLS, 2 policies equivalent | YES | NO | organizations, reps |
| 20261019000003_help_requests.sql | NO (dup ×2) | YES: table, 4 idx, 3 policies, RLS | YES, after collision fix | NO. Not re-runnable (plain CREATE INDEX/POLICY) | leads, reps |
| 20261019000003_org_settings.sql | NO (dup ×2) | YES: `organizations.settings`, 2 functions identical | YES, after collision fix | NO | organizations |
| 20261020000000_scoring_feedback.sql | NO | YES: table, 3 idx, 2 policies, RLS | YES | NO | leads, captured_prospects, reps |
| 20261020000001_intelligence_samples.sql | NO | YES, superseded: table, 2 `leads` cols, 12 idx, function identical. label_status CHECK later widened (TRAINING_APPROVED) | YES | NO | leads, upwork_jobs |
| 20261020000002_intelligence_samples_hardening.sql | NO | YES, superseded: events table, 14 cols, 5 idx (2 unique) present. Its 5 policies were replaced by 20261022110000/20261024120000, its 2 functions by 20261024120005, its event_type list by 20261022110000 | YES | NO. **Never re-run** (§4.3) | 20261020000001 |
| 20261021000000_upwork_canonical_score.sql | NO | YES: 6 cols + CHECK, idx | YES | NO | upwork_jobs |
| 20261021180000_ai_trace_scope.sql | NO | YES: 3 cols, 2 idx | YES | NO | ai_traces (20260920000000) |
| 20261022000000_action_ledger_recommendation_types.sql | NO | YES: action_type CHECK identical (18 values) | YES | NO | 20261005000000 |
| 20261022100000_scoring_labels_and_shadow.sql | NO | YES: 2 tables, 7 idx, 3 policies, RLS | YES | NO | leads, captured_prospects, upwork_jobs, profiles |
| 20261022110000_dataset_governance.sql | NO | YES: label_status and event_type CHECKs identical, unique idem idx, old idx gone, 5 policies identical | YES | NO (dedupe DELETE now a no-op because the unique idx exists) | 20261020000002 |
| 20261022120000_data_integrity_opportunity_key.sql | NO | YES: 10 cols, 3 idx. Backfills UNKNOWN | YES | NO | captured_prospects, leads, intelligence_samples, scoring_shadow_decisions (20261022100000) |
| 20261022130000_labeling_v2.sql | NO | YES: table, 4 cols + CHECKs, 2 idx, 2 policies | YES | NO | 20261022100000 |
| 20261022140000_scoring_shadow_routing.sql | NO | YES: 2 cols | YES | NO | 20261022100000 |
| 20261022150000_scoring_shadow_sales_thesis.sql | NO | YES: 2 cols | YES | NO | 20261022100000 |
| **20261023000000_scope_lead_company_uniqueness.sql** | NO | **NO**: `leads_company_key_unique` is still global `(company_key) WHERE status <> 'dead'`, not `(organization_id, company_key) … AND NOT archived` | NO | **YES** | leads.company_key, leads.archived |
| 20261024120000_intelligence_sample_events_rls.sql | NO | YES: org col, idx, function + trigger, RLS, 2 policies identical. Backfill UNKNOWN | YES | NO | 20261020000002 |
| 20261024120001_followup_trigger_canonical.sql | NO | YES: `check_followup_eligible` identical | YES | NO | leads, outcomes |
| 20261024120002_sender_context.sql | NO | YES: 2 `messages` cols, idx. UPDATE UNKNOWN | YES | NO | messages.sender_profile_id (0088 / 202609xx) |
| 20261024120003_conversation_facts.sql | NO | YES, full: 9 cols, kind (10) + confidence (3) CHECKs, 2 idx, RLS, 2 policies identical | YES | NO | current_org_id() |
| 20261024120004_thread_status.sql | NO | YES: `messages.thread_status` | YES | NO | messages |
| 20261024120005_security_definer_hardening.sql | NO | YES: both function bodies identical | YES | NO | 20261020000002, 20261024120000 |
| 20261025120001_security_definer_hardening_2.sql | NO | YES: `append_rescore_event` identical | YES | NO | leads rescore cols |
| 20261025120002_review_evaluations.sql | NO | YES, full: 3 tables, all CHECK lists, 3 unique keys, 3 idx, RLS ×3, 6 policies identical | YES | NO. Not re-runnable (plain CREATE POLICY) | current_org_id() |
| **20261029120001_upwork_sender_attribution.sql** | NO | **NO**: `upwork_jobs.sender_profile_id`, `upwork_jobs.connects_used`, `upwork_messages.sender_profile_id` and both idx absent | NO | **YES** | profiles, upwork_jobs, upwork_messages (0009) |
| 20261030120000_organization_operating_clock.sql | NO | YES: table + 3 CHECKs, RLS, 3 policies, `is_org_working_day` and both `record_activity_event` overloads identical. Seed rows UNKNOWN | YES | NO | organizations, daily_accountability.source_event_ids |
| 20261030120100_rep_day.sql | NO | YES: 2 tables, unique keys, 4 idx, 4 policies, RLS | YES | NO | 20261030120000, teams/team_memberships (20260923000000) |
| 20261030120200_operational_scheduler.sql | NO | YES, superseded: table, unique key, 3 idx, RLS. job_kind CHECK later widened by 20261030120300 | YES | NO | organizations, reps |
| 20261030120300_email_engine.sql | NO | YES: 2 tables, 15 cols + CHECKs, job_kind CHECK identical, 3 idx, policy, RLS | YES | NO. Not re-runnable (plain CREATE POLICY) | 20261030120000, 20261030120200, email_* (20260925000000) |
| **20261031120000_assigned_tasks.sql** | NO | **NO**: `assigned_tasks`, `task_events`, 7 idx, 5 policies all absent | NO | **YES** | reps, leads, current_org_id()/current_rep_id()/is_org_admin() |
| **20261101120000_operations_workspace.sql** | NO | **NO**: 5 helper functions + `internal_notes_guard` absent. `is_admin`/`is_org_admin` still the legacy `reps.role` bodies. `tm_select`/`ae_select` still old text. 3 tables absent | NO | **YES** | **20261031120000** (policies on assigned_tasks/task_events, task_events CHECK), organization_roles/teams/team_memberships (20260923000000), leads.company_key |
| **20261101130000_meeting_booked_event.sql** | NO | **NO**: action_type CHECK lacks `MEETING_BOOKED` (prod list is a strict subset of the new list) | NO | **YES** | 20261022000000 (present) |
| **20261101140000_notification_dedupe.sql** | NO | **NO**: unique idx absent, and the columns it needs do not exist | NO | **YES, but blocked** | 0085-shaped `notifications` (absent) → needs 20261101135000 or equivalent |

## 4. Per-file notes

### 4.1 Files that need applying

- **20261023000000_scope_lead_company_uniqueness**: replaces the global unique index with a per-org one.
  - The preflight is guaranteed to pass: the existing global index already forbids duplicate non-dead
    company keys across all orgs, so per-org duplicates cannot exist.
  - Takes `SHARE ROW EXCLUSIVE` on `leads`, which blocks lead writes for the duration (~800 rows by
    planner estimate).
  - Contains an explicit `begin; … commit;`. Under `supabase db push` the CLI already wraps each file
    in a transaction. How the nested BEGIN/COMMIT behaves there is UNKNOWN; it may commit early. Apply
    via SQL editor/psql as one script, or remove the explicit transaction.
- **20261029120001_upwork_sender_attribution**: additive, nullable columns with an FK to `profiles`
  (`on delete set null`). Low risk. Fixes BUG-28/29 (`connects_used` writes currently fail).
- **20261031120000_assigned_tasks**: new tables only. Idempotent. Its policies are replaced straight
  away by 20261101120000.
- **20261101120000_operations_workspace**: the riskiest of the set.
  - Redefines `is_admin()` and `is_org_admin()`, which 10 and 158 production policy statements
    reference respectively. Admin authority moves to `organization_roles`.
  - Reps with `reps.role = 'admin'` plus a MANAGER/MEMBER org role lose DB admin. Org-role
    ADMIN/OWNER without `reps.role = 'admin'` gain it. How many people are affected is UNKNOWN
    because row data was not read; count before applying.
  - `ae_select` moves from role PUBLIC to `authenticated`.
  - Idempotent: everything is `drop … if exists` or `create or replace`.
- **20261101130000_meeting_booked_event**: drops and re-adds the CHECK, then validates every
  `action_events` row (~5.2k estimated) under an ACCESS EXCLUSIVE lock. All current values are in the
  new list, so validation passes. Independent of the other Phase 8 files.
- **20261101140000_notification_dedupe**: see §5.2. As written, it fails with "column n.recipient_id
  does not exist". The DELETE is destructive by design (it keeps the oldest row per group).

### 4.2 Destructive or data-changing statements (all files)

| File | Statement | Current effect if run |
|---|---|---|
| 0091_fix_targets_schema | Conditional `DROP TABLE daily_targets / daily_accountability CASCADE` | Not triggered (activity_type exists), but see §4.3 |
| 20261006000000 | `UPDATE leads SET score = NULL …` where score > 12 | UNKNOWN (data) |
| 20261016000001 | `DELETE` duplicate connection messages | No-op: unique idx exists |
| 20261022110000 | `DELETE` duplicate sample events; DO block drops label_status/event_type CHECKs, then re-adds | Re-adds the same lists as prod |
| 20261023000000 | `DROP INDEX leads_company_key_unique`, then recreate | Intended |
| 20261030120000 | `DROP FUNCTION record_activity_event(uuid,uuid,text,uuid,text)`, then recreate | Same body as prod |
| 20261101140000 | `DELETE` newer duplicate notifications | Fails today (missing columns) |

### 4.3 Superseded files: record as applied, never re-run

Each of these is older than production, so re-running one would roll back a later fix:

- `0091_fix_targets_schema`: reverts `is_org_working_day` to the version without
  `organization_operating_policy`.
- `20261006000002_new_trend_sources`: plain `DROP CONSTRAINT`, then re-adds the list without
  `newsapi`. It fails if any `newsapi` rows exist, and narrows the list otherwise.
- `20261008000000_action_ledger_fix_check`: drops RECOMMENDATION_SHOWN/ACTED. Same fail-or-narrow
  behaviour.
- `20261020000002_intelligence_samples_hardening`: fails on `create policy` (no drop). If it got
  further, it would reinstate the unscoped SECURITY DEFINER `append_sample_event` and
  `approve_sample_for_training` that 20261024120005 closed.
- `20261005000000`, `20261020000001`, `20261030120200`: their inline CHECK lists are older. They are
  no-ops on re-run (`create table if not exists`).

These files also fail on re-run (plain CREATE INDEX/POLICY): `20261019000003_help_requests`,
`20261025120002_review_evaluations`, `20261030120300_email_engine`.

### 4.4 Data backfills: UNKNOWN

The schema-only dump cannot show whether these UPDATE/INSERT statements ran. All are guarded
(`where … is null` / `on conflict`), so they are safe to run manually if the team wants certainty:
0090_add_org_columns, 20261006000000, 20261006000002, 20261008000000_action_ledger_idempotency,
20261016000000, 20261017000000, 20261019000000, 20261022120000, 20261024120000, 20261024120002,
20261030120000.

## 5. Known facts, verified in the dump

### 5.1 Absent objects

- Tables `assigned_tasks`, `task_events`, `internal_notes`, `internal_note_events` and `saved_views`
  do not exist (0 occurrences in the dump).
- Functions `is_org_admin_or_owner`, `manages_team`, `is_org_manager_of`, `can_see_rep`,
  `can_access_note_subject` and `internal_notes_guard` do not exist. All come from the unapplied
  20261101120000. `has_org_admin_role` is also absent.

### 5.2 `public.notifications`: shape mismatch and security defect

- **Shape.** Production has the 0088 shape: `id, organization_id, rep_id, type, title, message,
  metadata, read, created_at`. There is no `recipient_id`, `notification_type`, `body`, `link` or
  `dedupe_key`. The app writer (`src/lib/notifications/deliver.ts`) uses the 0085 shape, so its reads
  and inserts fail against production.
- **0085 is recorded but its notifications part is absent.** There is no `notif_*` index or policy.
  Recorded does not mean applied.
- **Security defect.**
  - No `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and no policies.
  - `GRANT ALL ON TABLE public.notifications TO anon` and `… TO authenticated`.
  - Anyone holding the public anon key can read, insert, update and delete every row through
    PostgREST. The planner estimates 0 rows today.
- **Fix path.** `20261101135000_notifications_canonical_shape.sql`, which appeared during this
  review, adds the 0085 columns, backfills them, enables RLS, revokes anon and adds the
  `notif_select`/`notif_insert`/`notif_update` policies. Nothing is dropped or deleted; legacy rows get
  a unique `legacy:<id>` dedupe key. It must run before 20261101140000. In the isolated harness (§9.1)
  it reproduced and then closed the exposure. It still needs human review before production.

### 5.3 `conversation_facts` and the evaluation tables

`conversation_facts`, `message_evaluations`, `thesis_evaluations` and `routing_evaluations` carry
their full migration effects. Every column, every CHECK value list, the unique keys, indexes, RLS and
policy expressions match 20261024120003 and 20261025120002.

## 6. Other findings (outside the 55 files)

- **Eight public tables have RLS disabled and `GRANT ALL … TO anon`**: `notifications`,
  `relay_events` (~7.6k rows est.), `relay_runs` (~970), `revenue_identities` (11),
  `identity_assignments` (18), `accountability_audit_log`, `activity_log` and `style_cards`. None of
  them has a policy. This is the same defect class as §5.2 and is recommended for Security review.
- `daily_accountability` has two identical UNIQUE constraints (`…_activi_key` from 0091 and
  `…_activity_ty_key`). The index is redundant but harmless.
- The `*_owner` content policies (20261009000001, matching prod) test `auth.uid() IN (SELECT id FROM
  reps …)`. That compares an auth uid to `reps.id`, so the admin branch likely never matches.
  Observation only.

## 7. Recommended apply order

Verified 2026-11-01 on a production-schema copy and on the full local stack. All ten apply in this
order, twice (idempotent), with 0 errors:

1. `20261023000000_scope_lead_company_uniqueness.sql`: explicit BEGIN/COMMIT; run it without `-1`. Write window (§4.1).
2. `20261029120001_upwork_sender_attribution.sql`
3. `20261031120000_assigned_tasks.sql`
4. `20261101120000_operations_workspace.sql`: run the admin-authority count first.
5. `20261101130000_meeting_booked_event.sql`
6. `20261101135000_notifications_canonical_shape.sql`: security fix (notifications)
7. `20261101140000_notification_dedupe.sql`: run its header count first
8. `20261101150000_pin_security_definer_search_path.sql`: added by a concurrent writer; applies cleanly
9. `20261101151000_lead_message_previews.sql`
10. `20261101160000_close_anon_exposure.sql`: security fix (the 7 tables, the definer guards, signal_events); see `docs/RELAY_SECURITY_ANON_EXPOSURE_AUDIT.md`

Files 6 and 10 can go first on their own as the security fix, after GRC sign-off. Applied before
file 4, admin means `reps.role = 'admin'` until file 4 widens it. Apply each file explicitly
(psql / SQL editor, reviewed), then record it with `supabase migration repair --status applied <version>`.
`db push` refuses versions older than the last remote one unless `--include-all` is passed.

## 8. Safe to mark applied (do not run without review)

These 41 versions have every schema effect present. Fix the three duplicated 2026 versions first
(§2). Otherwise each repair records one row, and the sibling files keep showing as pending.

```
supabase migration repair --status applied \
  20261004000000 20261005000000 20261006000000 20261006000001 20261006000002 \
  20261007000000 20261008000000 20261009000000 20261009000001 20261009000002 \
  20261016000000 20261016000001 20261017000000 20261019000000 20261019000001 \
  20261019000002 20261019000003 20261020000000 20261020000001 20261020000002 \
  20261021000000 20261021180000 20261022000000 20261022100000 20261022110000 \
  20261022120000 20261022130000 20261022140000 20261022150000 20261024120000 \
  20261024120001 20261024120002 20261024120003 20261024120004 20261024120005 \
  20261025120001 20261025120002 20261030120000 20261030120100 20261030120200 \
  20261030120300
```

- Excluded because they need applying: `20261023000000`, `20261029120001`, `20261031120000`,
  `20261101120000`, `20261101130000`, `20261101140000`.
- Excluded because they are already recorded and collide: `0090`, `0091`.

## 9. How this was checked

- **Inputs:**
  - `prod_schema.sql`: a schema-only `pg_dump` of the public schema, taken read-only on 2026-11-01.
  - `mig_state.txt` and `miglist.txt` from `supabase migration list --linked`.
  - Planner estimates from `table_stats.txt`, used only for the "~N rows" figures.
- **Not read:** no row data from any table. No database connection was made for this document.
- **Method:** every unrecorded file was split into statements, and each statement was matched to the
  dump.
  - Columns: name and type.
  - CHECK constraints: the quoted value set.
  - Indexes: the normalized definition.
  - Policies: the normalized USING/WITH CHECK expression. Mismatches were reviewed by hand.
  - Functions: the body compared to `prosrc`, ignoring whitespace.
  - Triggers, RLS, FKs and grants: matched by name.
  - Where prod differed, the later local file that produced the prod state was identified.
- **Limits:**
  - The `storage`, `cron` and `auth` schemas, bucket rows and data backfills are not in the dump, so
    they are marked UNKNOWN.
  - Which file the `0090` and `0091` remote rows were recorded for is UNKNOWN.
  - Exact CLI behaviour with duplicate versions and nested BEGIN/COMMIT was not tested.

### 9.1 Isolated execution of the Phase 8 files (synthetic rows)

On a throwaway `supabase/postgres:17.6.1.166` container (no production data) with
`supabase/tests/sql/auth_uid_shim.sql`, `operations_workspace_rls_fixture.sql` and the
production-shaped `phase8_activation_fixture.sql` (0088 notifications with RLS off and anon `GRANT
ALL`, production `action_type` list), the five Phase 8 files (`…120000`, `…130000`, `…135000`,
`…140000`, `…150000`) were applied in order, then applied again. Both runs succeeded, so the files
are idempotent.

| Harness | Before | After |
|---|---|---|
| `operations_workspace_rls.sql` | 8 pass / 3 fail (the three known scope bugs, reproduced) | 32 / 0 |
| `phase8_activation_checks.sql` | 2 / 0 (anon reads notifications; `MEETING_BOOKED` rejected) | 19 / 0 |

This proves the policies and DDL against production-shaped tables. It does not prove the production
data: backfill counts, the admin-authority change and the legacy-row count still need the read-only
pre-checks.
