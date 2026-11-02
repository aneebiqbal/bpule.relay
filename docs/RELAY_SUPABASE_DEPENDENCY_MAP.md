# RELAY — SUPABASE DEPENDENCY MAP

Generated from a read-only inventory of the Supabase production project.

| Field | Value |
| --- | --- |
| Supabase project ref | `fhnkanwvgamitrcuzpem` (name: `scout`) |
| Organization | `hrdmtwhuopdrrppbfkcg` |
| Region | Northeast Asia (Seoul) |
| PostgreSQL | 17.6 (x86_64, gcc 15.2.0) |
| Database size | 185 MB |
| Database | `postgres` |
| Schemas | 12 |
| Tables (public) | 123 |
| Columns (public) | 1861 |
| Indexes (public) | 507 |
| Functions (public) | 158 |
| SECURITY DEFINER functions (public) | 27 |
| Triggers (public) | 6 |
| RLS policies (public) | 0 |
| Foreign keys (public) | 0 |
| auth.users | 32 |
| auth.identities | 31 (1 provider) |
| Storage buckets | 2 (profile-sources, proof-cvs) |
| Realtime publication | supabase_realtime |

> **Access note:** the project is currently in an `exceed_egress_quota` restriction state,
> which returns HTTP 402 from every gateway service (PostgREST, Auth admin, Storage, Realtime).
> Direct Postgres and the Management API SQL endpoints remain reachable and were used for
> this inventory. No writes were issued to Supabase.

## 1. Schemas

| Schema | Owner | Role |
| --- | --- | --- |
| `auth` | supabase_admin | Supabase-managed |
| `cron` | supabase_admin | Supabase-managed |
| `extensions` | postgres | Extensions |
| `graphql` | supabase_admin | Supabase-managed |
| `graphql_public` | supabase_admin | Supabase-managed |
| `net` | supabase_admin | Supabase-managed |
| `pgbouncer` | pgbouncer | Supabase-managed |
| `public` | pg_database_owner | **Relay application** |
| `realtime` | supabase_admin | Supabase-managed |
| `storage` | supabase_admin | Supabase-managed |
| `supabase_migrations` | postgres | Supabase-managed |
| `vault` | supabase_admin | Supabase-managed |

## 2. Extensions

| Extension | Version | Neon availability |
| --- | --- | --- |
| `pg_cron` | 1.6.4 | not available on Neon |
| `pg_net` | 0.20.4 | not available on Neon |
| `pg_stat_statements` | 1.11 | available |
| `pgcrypto` | 1.3 | built-in / available |
| `plpgsql` | 1.0 | unknown |
| `supabase_vault` | 0.3.1 | not available on Neon |
| `uuid-ossp` | 1.1 | available |
| `vector` | 0.8.2 | available (pgvector) |

## 3. Tables (public) with row counts

| Table | Rows | RLS | Policies |
| --- | ---: | --- | ---: |
| `accountability_audit_log` | 0 | no | 0 |
| `accountability_templates` | 4 | no | 0 |
| `action_events` | 5177 | no | 0 |
| `activity_log` | 0 | no | 0 |
| `ai_traces` | 6413 | no | 0 |
| `capabilities` | 96 | no | 0 |
| `captured_prospects` | 1536 | no | 0 |
| `contact_points` | 0 | no | 0 |
| `content_draft_feedback` | 0 | no | 0 |
| `content_drafts` | 0 | no | 0 |
| `content_engagement_events` | 0 | no | 0 |
| `content_evaluations` | 0 | no | 0 |
| `content_history` | 0 | no | 0 |
| `content_idea_genomes` | 0 | no | 0 |
| `content_interview_answers` | 0 | no | 0 |
| `content_interview_sessions` | 0 | no | 0 |
| `content_journey` | 5 | no | 0 |
| `content_memories` | 20 | no | 0 |
| `content_opportunities` | 0 | no | 0 |
| `content_personas` | 7 | no | 0 |
| `content_pillars` | 0 | no | 0 |
| `content_post_structures` | 0 | no | 0 |
| `content_profiles` | 7 | no | 0 |
| `content_quick_captures` | 0 | no | 0 |
| `content_research_findings` | 0 | no | 0 |
| `content_taste_profiles` | 0 | no | 0 |
| `contract_allocations` | 0 | no | 0 |
| `conversation_facts` | 0 | no | 0 |
| `conversation_states` | 785 | no | 0 |
| `csv_imports` | 3 | no | 0 |
| `daily_accountability` | 274 | no | 0 |
| `daily_content_briefs` | 13 | no | 0 |
| `daily_content_ideas` | 57 | no | 0 |
| `daily_growth_briefs` | 17 | no | 0 |
| `daily_targets` | 54 | no | 0 |
| `day_closes` | 0 | no | 0 |
| `edit_learning` | 1572 | no | 0 |
| `email_delivery_events` | 0 | no | 0 |
| `email_mailboxes` | 3 | no | 0 |
| `email_messages` | 0 | no | 0 |
| `email_oauth_challenges` | 0 | no | 0 |
| `email_send_attempts` | 0 | no | 0 |
| `email_sending_policies` | 3 | no | 0 |
| `email_suppressions` | 0 | no | 0 |
| `eval_runs` | 0 | no | 0 |
| `extraction_runs` | 776 | no | 0 |
| `facts` | 19 | no | 0 |
| `few_shot_wins` | 221 | no | 0 |
| `golden_set` | 0 | no | 0 |
| `help_requests` | 0 | no | 0 |
| `host_calls` | 139 | no | 0 |
| `identity_assignments` | 18 | no | 0 |
| `intelligence_sample_events` | 2618 | no | 0 |
| `intelligence_samples` | 824 | no | 0 |
| `leads` | 814 | no | 0 |
| `message_evaluations` | 2 | no | 0 |
| `messages` | 1212 | no | 0 |
| `monthly_accountability_reviews` | 0 | no | 0 |
| `notification_log` | 144 | no | 0 |
| `notifications` | 0 | no | 0 |
| `operational_jobs` | 141 | no | 0 |
| `operator_availability` | 0 | no | 0 |
| `organization_day` | 11 | no | 0 |
| `organization_email_policy` | 0 | no | 0 |
| `organization_operating_policy` | 11 | no | 0 |
| `organization_roles` | 12 | no | 0 |
| `organization_rulebooks` | 17 | no | 0 |
| `organizations` | 17 | no | 0 |
| `outcomes` | 72 | no | 0 |
| `outreach_artifacts` | 0 | no | 0 |
| `performance_config` | 0 | no | 0 |
| `plays` | 3 | no | 0 |
| `portfolio_projects` | 54 | no | 0 |
| `prepared_email_drafts` | 0 | no | 0 |
| `profile_assignments` | 7 | no | 0 |
| `profile_claims` | 186 | no | 0 |
| `profile_enrichment_runs` | 17 | no | 0 |
| `profile_experience` | 25 | no | 0 |
| `profile_import_batches` | 45 | no | 0 |
| `profile_merge_log` | 3 | no | 0 |
| `profile_opportunity_matches` | 0 | no | 0 |
| `profile_reviews` | 0 | no | 0 |
| `profile_sources` | 38 | no | 0 |
| `profiles` | 14 | no | 0 |
| `proof_cards` | 39 | no | 0 |
| `proof_items` | 0 | no | 0 |
| `push_subscriptions` | 0 | no | 0 |
| `relay_content_opportunities` | 58 | no | 0 |
| `relay_content_outcomes` | 0 | no | 0 |
| `relay_content_publications` | 8 | no | 0 |
| `relay_editorial_decisions` | 5 | no | 0 |
| `relay_events` | 7561 | no | 0 |
| `relay_growth_drafts` | 5 | no | 0 |
| `relay_growth_events` | 1 | no | 0 |
| `relay_growth_experiments` | 0 | no | 0 |
| `relay_growth_memory` | 8 | no | 0 |
| `relay_runs` | 968 | no | 0 |
| `rep_day` | 4 | no | 0 |
| `reps` | 26 | no | 0 |
| `revenue_identities` | 11 | no | 0 |
| `revenue_identity_contracts` | 0 | no | 0 |
| `reward_eligibility` | 0 | no | 0 |
| `reward_policies` | 0 | no | 0 |
| `routing_evaluations` | 1 | no | 0 |
| `sales_memory` | 1371 | no | 0 |
| `scoring_feedback` | 22 | no | 0 |
| `scoring_labels` | 0 | no | 0 |
| `scoring_pairwise_labels` | 0 | no | 0 |
| `scoring_shadow_decisions` | 7392 | no | 0 |
| `signal_events` | 0 | no | 0 |
| `style_cards` | 0 | no | 0 |
| `subscriptions` | 2 | no | 0 |
| `team_memberships` | 6 | no | 0 |
| `teams` | 6 | no | 0 |
| `thesis_evaluations` | 0 | no | 0 |
| `topic_clusters` | 40 | no | 0 |
| `trend_items` | 312 | no | 0 |
| `trend_sources` | 14 | no | 0 |
| `trending_angles` | 0 | no | 0 |
| `upwork_applications` | 0 | no | 0 |
| `upwork_jobs` | 97 | no | 0 |
| `upwork_messages` | 152 | no | 0 |
| `voice_profiles` | 15 | no | 0 |

**Total public rows:** 41755

## 4. Storage tables

| Table | Rows |
| --- | ---: |
| `buckets` | 2 |
| `buckets_analytics` | 0 |
| `buckets_vectors` | 0 |
| `migrations` | 75 |
| `objects` | 48 |
| `s3_multipart_uploads` | 0 |
| `s3_multipart_uploads_parts` | 0 |
| `vector_indexes` | 0 |

## 5. Functions

Public schema: 158 functions, of which **27 are SECURITY DEFINER**.

### SECURITY DEFINER functions

| Function | Args | Language |
| --- | --- | --- |
| `append_rescore_event` | p_lead_id uuid, p_canonical_score integer, p_score_version text, p_score_breakdown jsonb, p_rescore_event jsonb | plpgsql |
| `append_sample_event` | p_sample_id uuid, p_event_type text, p_payload jsonb, p_actor uuid, p_idempotency_key text | plpgsql |
| `approve_sample_for_training` | p_sample_id uuid, p_approver_id uuid | plpgsql |
| `archive_search` | query text, entity_filter text, status_filter text[], signal_filter integer[], play_filter uuid[], rep_filter uuid[], date_from timestamp with time zone, date_to timestamp with time zone, result_limit integer | sql |
| `check_followup_eligible` | () | plpgsql |
| `create_relay_run` | p_org_id uuid, p_run_type text, p_primary_entity_type text, p_primary_entity_id uuid, p_assigned_rep_id uuid, p_revenue_identity_id uuid, p_correlation_id uuid, p_context jsonb | plpgsql |
| `current_org_id` | () | sql |
| `current_rep_id` | () | sql |
| `emit_relay_event` | p_event_type text, p_entity_type text, p_entity_id text, p_actor_type text, p_actor_id text, p_revenue_identity_id text, p_source text, p_source_event_id text, p_correlation_id text, p_causation_id text, p_relay_run_id text, p_payload jsonb, p_metadata jsonb, p_occurred_at timestamp with time zone | plpgsql |
| `emit_relay_event` | p_org_id uuid, p_event_type text, p_entity_type text, p_entity_id uuid, p_actor_type text, p_actor_id uuid, p_revenue_identity_id uuid, p_source text, p_source_event_id text, p_correlation_id uuid, p_causation_id uuid, p_relay_run_id uuid, p_payload jsonb, p_metadata jsonb, p_occurred_at timestamp with time zone | plpgsql |
| `ensure_daily_accountability` | () | plpgsql |
| `ensure_day_close` | p_org_id uuid, p_person_id uuid, p_revenue_identity_id uuid, p_date date | plpgsql |
| `ensure_day_closes_for_person` | p_org_id uuid, p_person_id uuid, p_date date | plpgsql |
| `get_run_events` | p_run_id uuid, p_org_id uuid | plpgsql |
| `is_admin` | () | sql |
| `is_org_admin` | () | sql |
| `is_org_working_day` | p_org_id uuid, p_date date | sql |
| `match_proofs_by_embedding` | query_embedding vector, match_threshold double precision, match_count integer | sql |
| `next_sample_version` | p_lead_id uuid | plpgsql |
| `notify_on_reply` | () | plpgsql |
| `record_activity_event` | p_rep_id uuid, p_identity_id uuid, p_activity_type text, p_org_id uuid | plpgsql |
| `record_activity_event` | p_rep_id uuid, p_identity_id uuid, p_activity_type text, p_org_id uuid, p_source_event_id text, p_date date | plpgsql |
| `record_canonical_progress` | p_org_id uuid, p_person_id uuid, p_revenue_identity_id uuid, p_event_type text, p_metric_key text, p_source_event_id text, p_date date | plpgsql |
| `refresh_few_shot_wins` | () | plpgsql |
| `refresh_few_shot_wins` | p_org_id uuid | plpgsql |
| `set_intelligence_sample_event_org` | () | plpgsql |
| `transition_relay_run` | p_run_id uuid, p_org_id uuid, p_new_status text, p_new_step text, p_event_id uuid, p_metadata jsonb | plpgsql |

## 6. Triggers

| Table | Trigger | Timing | Event |
| --- | --- | --- | --- |
| `daily_targets` | trg_ensure_daily_accountability | AFTER | INSERT |
| `daily_targets` | trg_ensure_daily_accountability | AFTER | UPDATE |
| `intelligence_sample_events` | int_sample_events_set_org | BEFORE | INSERT |
| `outcomes` | notify_reply | AFTER | INSERT |
| `profile_merge_log` | profile_merge_log_no_update | BEFORE | UPDATE |
| `profile_merge_log` | profile_merge_log_no_update | BEFORE | DELETE |

## 7. Migration drift

Production migration history ends at **`20261003000000` (extend_ai_traces_intelligence)**.
The repository contains **140** migration files; **89** are recorded as applied and
**49** newer files are present in the repo but absent from production history. Production is
authoritative and the schema was captured from the live database, not replayed from migrations.

## 8. Dependency classification

| Class | Count | Neon target |
| --- | ---: | --- |
| STANDARD_POSTGRES (tables, columns, indexes, FKs, constraints, triggers) | 123 tables | Neon Postgres |
| RLS | 0 policies | Neon Postgres RLS |
| SUPABASE_RPC (SECURITY DEFINER functions) | 27 | Postgres functions + Neon Auth context |
| SUPABASE_AUTH | 32 users | Neon Auth (Managed Better Auth) |
| SUPABASE_STORAGE | 2 buckets / 48 objects | Neon Object Storage / external |
| SUPABASE_REALTIME | 1 publication | Neon Realtime / replacement |

