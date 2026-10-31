# RELAY — SUPERBASE → NEON MIGRATION

Status: **BLOCKED** — the Supabase source is quota-restricted and cannot be read.

---

## PHASE 0 — BASELINE (recorded)

| Item | Value |
|---|---|
| git branch | `release-merge` |
| git HEAD | `ef94764c131fc065e26a86f4850fa271cc938be8` |
| origin/main | `b7d8feb08ec5b0a585f138088ff0e08b50c1e7be` |
| working tree | **32 dirty files** (concurrent "rep home v2" workstream, uncommitted) |
| Supabase project | `fhnkanwvgamitrcuzpem` (`https://fhnkanwvgamitrcuzpem.supabase.co`) |
| Supabase Postgres | not exposed — REST returns 402 |
| Neon org | `org-shy-butterfly-06982133` ("Aneeb"), **plan: free** |
| Neon account MFA | not required |

### Automated baseline

```
pnpm qa:release  → BUILD PASS · TYPECHECK PASS · LINT PASS
                   contracts PASS (8/8) · UNIT 4423/4429
```

The 6 unit failures are **not** from the migration work — they read the
concurrent writer's uncommitted files (`rep-dashboard.tsx`,
`dashboard/page.tsx`, `lib/team/load-admin-command-center.ts`).

---

## BLOCKER — READ THIS FIRST

### B1. The Supabase source is restricted (402)

```
GET /rest/v1/         → 402 {"message":"Service for this project is restricted
                                due to the following violations:
                                exceed_egress_quota. The project owner must
                                upgrade their plan or remove spend caps to
                                restore service."}
GET /auth/v1/health   → 402 (same)
```

**Every** Supabase endpoint is unavailable. This blocks, in order:

- Phase 1 — the authoritative production schema cannot be read
- Phase 8 — the production data cannot be copied
- Phase 10/35 — no source hashes to compare
- Phase 11/13 — `auth.users` / `auth.identities` cannot be read

The repo migrations are **not** a substitute: Phase 7 requires the production
schema to be authoritative, and the repo is known to have drifted from it
(48 local-only migrations, out-of-order).

### B2. The Neon org is on the free plan with an exhausted project

```
project "kept" (bitter-river-63796486) branch "production"
  current_state: archived        (2026-10-31T13:08:56Z)
  data_transfer_bytes: 220,517,820   ← exceed_egress_quota
```

`kept` is an unrelated application (projects / clients / qa_tasks), **not**
Relay. It does not block new project creation — see Phase 3 — but it confirms
the org is at its free-plan egress ceiling, so the data copy in Phase 8 will
need headroom.

### Owner action required

1. **Supabase**: upgrade the plan or remove spend caps to restore
   `fhnkanwvgamitrcuzpem`. Until then nothing can be read from the source.
2. **Neon**: confirm the free plan has enough egress headroom for a full
   production copy, or upgrade.

---

## PHASE 1 — SUPERBASE INVENTORY

Supabase API is 402, so the inventory below is built from the **repository
migrations** (`supabase/migrations`, 140 files) plus static code analysis. Treat
row counts as **unknown** until the source is readable.

### Tables

**141 tables** are created by the migrations, including:

```
organizations, reps, profiles, revenue_identities, profile_assignments,
identity_assignments, teams, team_memberships, organization_roles,

leads, captured_prospects, messages, conversation_states, conversation_facts,
outcomes, action_events, activity_log, signal_events, relay_events,

assigned_tasks, task_events, qa_tasks, daily_targets, day_closes,
daily_accountability, monthly_accountability_reviews, accountability_audit_log,
accountability_templates, rep_day,

scoring_labels, scoring_pairwise_labels, scoring_shadow_decisions,
scoring_feedback, routing_evaluations, message_evaluations, thesis_evaluations,
intelligence_samples, intelligence_sample_events, eval_runs, golden_set,
few_shot_wins,

proof_cards, proof_items, profile_intelligence (profile_* family),
upwork_jobs, upwork_applications, upwork_messages,
email_messages, email_mailboxes, email_sending_policies, email_suppressions,
email_delivery_events, email_send_attempts, email_oauth_challenges,
prepared_email_drafts,

content_personas, content_briefs, content_ideas, content_drafts, …
ai_traces, notifications, notification_log, push_subscriptions,
subscriptions, billing_events, organization_billing,
client_contracts, contract_allocations, revenue_identity_contracts,
trend_items, trend_sources, trending_angles, topic_clusters, …
```

### Extensions

```
pgcrypto   (required — gen_random_uuid, crypto)
vector     (required — embeddings)
```

Both install successfully on Neon (verified).

### RLS

- **477 policies** across the migrations.
- **81 `auth.uid()` usages** — none of which exist on Neon.
- **62 migration files** touch Supabase-specific primitives
  (`auth.uid()`, `auth.role()`, `current_org_id`, `is_org_admin`, `storage.`,
  `realtime`).

### Auth model

GoTrue: `auth.users` + `auth.identities` (one identity row per user for
email/password). `reps.auth_user_id → auth.users(id)`.

### Storage / Realtime

Not yet determinable from the source (402). The repository must be audited for
`storage.from(...)` and realtime subscriptions.

---

## PHASE 2 — DEPENDENCY CLASSIFICATION

| Dependency | Class | Neon target |
|---|---|---|
| 141 tables, FKs, indexes | STANDARD_POSTGRES | Neon Postgres |
| `pgcrypto`, `vector` | STANDARD_POSTGRES | Neon extensions (verified) |
| 477 RLS policies | STANDARD_POSTGRES | Neon RLS — **needs `auth.uid()` shim** |
| `auth.uid()` / `auth.role()` / `auth.jwt()` | SUPABASE_AUTH | Neon Auth + a DB context function |
| `auth.users` / `auth.identities` | SUPABASE_AUTH | Neon Auth user directory |
| PostgREST (`.from`, `.rpc`) | SUPABASE_POSTREST | server SQL / Neon Data API |
| `storage.*` | SUPABASE_STORAGE | only if actually used — unconfirmed |
| Realtime | SUPABASE_REALTIME | only if actually used — unconfirmed |

---

## PHASE 3 — NEON PROJECT (done)

```
project_id : shy-lake-93156992
name       : relay-production
region_id  : aws-us-east-2
pg_version : 18
default br : br-ancient-butterfly-b4vxt513 ("main") — ready, PostgreSQL 18.6
```

No Relay project existed before this (`list_projects` returned only `treewallet`
and `kept`; `search "relay"` and `"scout"` returned nothing).

## PHASE 4 — MIGRATION BRANCH (done)

```
branch_id : br-crimson-cell-b47kucgl
name      : migration-validation
parent    : br-ancient-butterfly-b4vxt513
```

## PHASE 5 — PRE-MIGRATION SNAPSHOT (done)

```
snapshot_id : snap-twilight-recipe-b4r0mirq
name        : pre-migration-baseline
branch      : br-ancient-butterfly-b4vxt513
```

## PHASE 6 — SCHEMA COMPATIBILITY

Verified on the `migration-validation` branch:

| Item | Result |
|---|---|
| `pgcrypto` | installs (1.4) |
| `vector` | installs (0.8.6) |
| `auth` schema | created (shim) |
| `auth.uid()` | **absent** — must be provided |
| `auth.role()` | **absent** |
| `auth.jwt()` | **absent** |
| `public` tables | 0 (empty, as expected) |

### Required work before Phase 7

1. Provide `auth.uid()` / `auth.jwt()` equivalents backed by Neon Auth context.
2. Rewrite **477 RLS policies** off `auth.uid()`.
3. Replace `reps.auth_user_id → auth.users(id)` with the Neon Auth user id.
4. Replay the schema from the **authoritative production dump**, not the repo
   migrations (drift).

---

## WHAT IS BLOCKED

```
PHASE 1  authoritative schema inventory      BLOCKED (Supabase 402)
PHASE 8  data copy                            BLOCKED (Supabase 402)
PHASE 10 source hashes                        BLOCKED (Supabase 402)
PHASE 11 auth user inventory                 BLOCKED (Supabase 402)
PHASE 13 auth user import                    BLOCKED (Supabase 402)
PHASE 26 pre-cutover delta sync              BLOCKED (Supabase 402)
PHASE 35 final parity                         BLOCKED (Supabase 402)
```

Everything downstream (RLS verification, preview, browser matrix, cutover,
production smoke) depends on the source being readable.

---

## ZERO-DESTRUCTIVE GUARANTEE — HELD

- Supabase was **never** written to, truncated, dropped, paused or rotated.
- The 402 is a pre-existing platform restriction, not an action taken here.
- No Supabase credential was printed or logged.
- The only Neon writes were: one project, one branch, one snapshot, two
  extensions, one schema, and read-only probes — all on the new project.
