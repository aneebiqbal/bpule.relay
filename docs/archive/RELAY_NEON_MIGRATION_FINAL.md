# RELAY — SUPABASE → NEON MIGRATION (FINAL)

> **Verdict:** migration infrastructure complete and verified on an isolated Neon
> branch. **Production cutover is NOT performed** — the Relay application still
> talks to Supabase through PostgREST, which Neon does not provide. See §9.
>
> **SUPABASE PRESERVED: YES** — nothing was deleted, altered, paused, or
> rotated. Supabase remains the source of truth and the rollback database.
>
> **Date:** 2026-11-01
> **Branch:** `release-merge` @ `5ae9099def2b4b07a911584cb6b298e6634ddd63`
> **`origin/main`:** `b7d8feb08ec5b0a585f138088ff0e08b50c1e7be`

---

## 1. Source and target

| | |
|---|---|
| **SUPABASE SOURCE PROJECT** | `fhnkanwvgamitrcuzpem` (scout) · org `hrdmtwhuopdrrppbfkcg` |
| **SUPABASE PG VERSION** | 17.6 |
| **SUPABASE DATABASE SIZE** | 185 MB |
| **NEON TARGET PROJECT** | `lingering-cell-60275711` (`relay-production`) |
| **NEON REGION** | `aws-ap-southeast-1` (Singapore — closest to Supabase Seoul; Neon has no `ap-northeast-2`) |
| **NEON PG VERSION** | 17.11 |
| **NEON DEFAULT BRANCH** | `main` · `br-wild-glade-aor6j5jj` |
| **NEON MIGRATION BRANCH** | `migration-validation` · `br-quiet-salad-aogboo1k` |
| **NEON DATABASE** | `neondb` · owner role `neondb_owner` |

All first imports went to `migration-validation`. Nothing was imported into the
production branch.

---

## 2. Migration method

Supabase is **egress-quota blocked**: every gateway (PostgREST, Auth admin,
Storage, Realtime) returns HTTP 402 `exceed_egress_quota`. Direct Postgres
(5432 / pooler) and `POST /v1/projects/{ref}/database/query/read-only` remain
reachable. There is no Supabase MCP server connected, so:

1. **Schema** was generated from the live catalogs (`format_type`,
   `pg_get_expr`, `pg_get_constraintdef`, `pg_get_indexdef`,
   `pg_get_functiondef`, `pg_get_triggerdef`, `pg_policies`) → `schema.sql`,
   applied with `psql -f`. `pg_dump` was impossible (no database password is
   exposed by the Management API).
2. **Data** was exported as multi-row `INSERT` statements read through the
   read-only Management API → `data.sql`.
3. **Production is authoritative.** The repo migration history was not replayed;
   the live schema was.

### Reproduction

The tooling lives in a scratch directory (it is not part of the repo, and holds
no credentials). The shape of the process:

```bash
# 1. DDL from the live catalogs  (reads pg_catalog through the read-only API)
node gen_schema.mjs          # -> schema.sql
psql "$NEON" -f schema.sql   # apply to the migration branch

# 2. Data from the live rows    (multi-row INSERTs, FK-topological order)
node gen_data.mjs            # -> data.sql
psql "$NEON" -f data.sql     # ~100 s for 41,662 rows

# 3. Parity                    (counts + md5 per critical table)
node verify.mjs              # -> parity.json

# 4. RLS                       (isolated database, real authenticated sessions)
psql "$RLS" -f operations_workspace_rls_fixture.sql
psql "$RLS" -f rls_setup.sql
psql "$TESTER" -v after=false -f rls_checks.sql   # 8 pass / 3 fail
psql "$RLS" -f 20261101120000_operations_workspace.sql
psql "$TESTER" -v after=true  -f rls_checks.sql   # 32 pass / 0 fail
```

`rls_tester` is a throwaway login role granted `authenticated`; Neon sets
`set_option = false` on the API roles, so `SET ROLE authenticated` is refused
for `neondb_owner` and the harness must connect as a member role instead.

### Compatibility items

| Source | Problem | Target implementation |
|---|---|---|
| `pg_net` | not available on Neon | dropped; the one `pg_cron` job (10-min ping to `/api/cron/operational-scheduler`) is not reproduced — `vercel.json` already defines a Vercel Cron for that route |
| `supabase_vault` | not available on Neon | dropped (no secrets were read from it) |
| `pg_cron` | `permission denied to create extension` | dropped, as above |
| `auth.uid()` / `auth.jwt()` / `auth.role()` | Supabase-specific | compatibility schema `auth` reads `app.current_user_id` GUC, then falls back to `request.jwt.claims->>'sub'`. Nothing is trusted from the browser |
| `anon` / `authenticated` / `service_role` | not present on Neon | recreated; table + sequence privileges granted explicitly (Supabase grants these at the platform level) |
| PostgREST | not provided by Neon | **outstanding** — see §9 |

---

## 3. Schema parity

Compared live, source vs `migration-validation`:

| Object | Source | Target | Match |
|---|---|---|---|
| tables | 123 | 123 | ✅ |
| columns | 1861 | 1861 | ✅ |
| indexes | 507 | 507 | ✅ |
| functions | 40 | 40 | ✅ |
| SECURITY DEFINER functions | 27 | 27 | ✅ |
| triggers | 4 | 4 | ✅ |
| RLS policies | 374 | 374 | ✅ |
| tables with RLS | 115 | 115 | ✅ |
| foreign keys | 312 | 312 | ✅ |
| constraints (p/u/c/x) | 388 | 388 | ✅ |

All 700 source constraints were compared by name, type, and definition: **zero
differences.** One source quirk is worth recording: `daily_accountability`
carries two identical `UNIQUE (rep_id, revenue_identity_id, activity_type,
target_date)` constraints. PostgreSQL silently drops a duplicate UNIQUE declared
inline in `CREATE TABLE` but keeps it when added with `ALTER TABLE`, so the
generator now emits duplicates as `ALTER TABLE ADD CONSTRAINT` (verified: the
target holds both).

`public.auth_user_mapping` (4 columns, 32 rows) is the one intentional addition
to the target — it holds the Supabase → Neon Auth identity mapping.

After the Phase 8 operations migration the target carries 380 policies and the
`internal_notes` / `internal_note_events` / `saved_views` tables (see §7).

---

## 4. Data parity

| | |
|---|---|
| **Public rows (source)** | 41,630 |
| **Public rows (target)** | 41,630 (+ 32 mapping rows) |
| **Row-count mismatches across 123 tables** | **0** |
| **Hash mismatches across 13 critical tables** | **0** |
| **`auth.users`** | 32 → 32 |

Critical tables hashed with `md5(string_agg(md5(x::text)))` over every column:
`organizations`, `reps`, `revenue_identities`, `leads`, `captured_prospects`,
`messages`, `conversation_states`, `outcomes`, `action_events`, `profiles`,
`scoring_labels`, `scoring_pairwise_labels`, `relay_events` — **all identical**.

No rows were excluded, manufactured, or mutated on Supabase.

**Orphan check (Phase 9):** 0 orphans on every critical FK —
`messages→leads`, `action_events→reps`, `profiles→reps`,
`revenue_identities→profiles`, `reps→organizations`, `leads→organizations`,
`conversation_states→leads`, `outcomes→leads`, `reps→auth.users`.

### Export correctness details

The exporter had to be written against the live catalogs rather than `pg_dump`.
Four traps were found and fixed, and are documented because they would bite any
repeat of this process:

1. **The Management API returns type OIDs, not names** — `atttypid::regclass::text`
   yields `1007`, so `'x'::1007` is invalid SQL. Element types are derived from
   `format_type` instead.
2. **`standard_conforming_strings = on`** — doubling backslashes corrupts JSON.
   Only single quotes are doubled.
3. **Generated columns** (`leads.company_key`, `leads.search_vector`,
   `contact_points.value_key`, `email_suppressions.email_key`,
   `proof_items.search_vector`, `upwork_jobs.search_vector`) cannot be inserted
   and are excluded.
4. **FK cycles and self-FKs** (`content_personas ↔ content_profiles`,
   `profiles.merged_into_profile_id`, `topic_clusters.merged_into_id`) are dropped
   for the load and re-added afterwards, which re-validates every row.
5. **User triggers fire on INSERT** — `outcomes → notify_reply → notification_log`
   duplicated 72 rows. All user triggers are dropped for the load and re-added.
6. **Per-row INSERTs are round-trip bound** — the branch link is ~100 ms RTT, so
   41,662 single-row inserts would take over an hour. Multi-row batches (capped by
   row count *and* rendered size) load the whole database in **100 seconds**.

---

## 5. Auth

| | |
|---|---|
| **Supabase `auth.users`** | 32 |
| **`auth.identities`** | 31 (1 provider) |
| **`auth.users` → Neon Auth** | 32 / 32 |
| **`public.auth_user_mapping`** | 32 rows |
| **`neon_auth.user` / `neon_auth.account`** | 32 / 32 |

**Method used: identity + email import, forced password reset on first login.**
Supabase password hashes cannot be preserved — Neon Auth (Managed Better Auth
1.7.12) uses a different hashing scheme. No hash was read, logged, or exported
(`encrypted_password` is excluded from the export by name).

Neon Auth was provisioned on `migration-validation` with `auth_provider:
better_auth`. Trusted domains: `https://relay.bpulse.dev` (production),
`http://localhost:3000` (dev), `https://*.vercel.app` and
`https://bpule-relay.vercel.app` (preview). Email/password is the only provider —
Google OAuth credentials are Supabase's and cannot be ported; the deployment does
not set `RELAY_GOOGLE_AUTH_ENABLED` either.

Every one of the 26 `reps.auth_user_id` values is covered by the mapping, with 0
orphan reps. The 6 `auth.users` without a `reps` row are invited-but-not-onboarded
accounts and are preserved as-is.

**`reps.auth_user_id` still holds the legacy Supabase ids on the migration
branch.** Rewriting it to the Neon Auth ids is a cutover step (see §9).

---

## 6. RLS and tenant isolation

### 6.1 Isolated harness (`rls_test` database)

The Phase 8 operations migration was exercised as real `authenticated` sessions
(JWT claims) on a throwaway database:

| Phase | Pass | Fail |
|---|---|---|
| before | 8 | 3 — reproduces the documented bugs (manager scope collapsed to self, manager cannot read team `action_events`, second-org legacy admin reads all of org A) |
| **after** | **32** | **0** |

Covers manager/rep/admin/owner/second-org scope, admin authority from
`organization_roles`, task scope + reassignment guard, notes scope/immutability/
author-only edit, and private saved views.

### 6.2 Real-data tenant matrix (`neondb`, 814 leads in org A)

| Check | Expected | Actual |
|---|---|---|
| REP A sees org A leads | 814 | 814 ✅ |
| REP A sees other-org leads | 0 | 0 ✅ |
| REP A sees own-org messages | 1212 | 1212 ✅ |
| REP A sees other-org messages | 0 | 0 ✅ |
| REP A `is_admin()` | 0 | 0 ✅ |
| REP A `current_org_id()` = org A | 1 | 1 ✅ |
| ADMIN A sees org A leads | 814 | 814 ✅ |
| ADMIN A `is_admin()` | 1 | 1 ✅ |
| ADMIN A sees org B leads | 0 | 0 ✅ |
| REP B sees org A leads | 0 | 0 ✅ |
| REP B sees org A messages | 0 | 0 ✅ |
| REP B cross-tenant UPDATE on org A | 0 rows | 0 rows ✅ |

---

## 7. SECURITY DEFINER audit

27 SECURITY DEFINER functions on both sides — exact parity, none missing, none
extra. Three shipped from Supabase without a pinned `search_path` (a privilege
escalation trap):

- `ensure_day_close(uuid, uuid, uuid, date)`
- `ensure_day_closes_for_person(uuid, uuid, date)`
- `record_canonical_progress(uuid, uuid, uuid, text, text, text, date)`

These are **fixed** by `supabase/migrations/20261101150000_pin_security_definer_search_path.sql`
(applied to the migration branch). No mutator was found that lacks an
organisation/identity check.

---

## 8. Tests

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `pnpm qa:contracts` | **PASS** — 64/64 |
| `pnpm test` | **PASS** — 312 files / 4568 tests |
| `pnpm build` | **PASS** — all `/team/*`, `/accounts`, `/accounts/[company]` compiled |
| `pnpm qa:release` → `AUTOMATED_CODE_GATE` | **PASS** |
| `BROWSER_GATE` | NOT_RUN — no reachable app (see §9) |
| `AUTH_ONBOARDING_GATE` | NOT_RUN — needs a live auth flow |
| `SHA_GATE` | NOT_VERIFIED — no `/api/version` reachable |
| `PRODUCTION_GATE` | BLOCKED |

---

## 9. Why production cutover was NOT performed

The database is migrated, verified, and secure. The **application is not**. Relay
uses Supabase's PostgREST API directly:

| Dependency | Count |
|---|---|
| files importing `@supabase` | 64 |
| `.from(...)` query sites | **1204** |
| `.rpc(...)` calls | 29 |
| `.storage` usages | 11 |
| realtime subscriptions | 1 |

Neon does not provide PostgREST, so `supabase.from(...)` cannot be pointed at a
Neon URL. Migrating the data-access layer (Phases 18–20 of the plan) is a
multi-day refactor of ~1200 query sites, plus an auth-client swap, plus browser
and tenant QA against a live deployment. It is not a change to make
autonomously, and doing it partially would leave the app broken.

**This is the genuine external blocker.** Everything up to it is done.

### What is needed to finish

1. Decide the data-access target: a server-side SQL/Drizzle adapter
   (`src/lib/db/`) behind the existing loaders, or a PostgREST-compatible proxy
   in front of Neon. The adapter is the recommended option.
2. Replace the 1204 `.from(...)` / 29 `.rpc(...)` call sites; keep the Supabase
   client only for auth, behind a `DB_PROVIDER` switch during transition.
3. Rewrite `src/app/auth/callback/route.ts` for Neon Auth (it reads
   `user.app_metadata` and uses `exchangeCodeForSession`, both Supabase-specific).
4. Rewrite `reps.auth_user_id` to the Neon Auth ids using `public.auth_user_mapping`
   (the mapping is already loaded and verified).
5. Deploy a preview against `migration-validation`, then run the browser matrix,
   auth E2E, tenant attack matrix, and performance benchmarks.
6. Only then: final delta sync, write freeze, cutover, production smoke.

---

## 9a. Backups / snapshots (Phase 41) — blocked by branch topology

Neon refuses `create_snapshot` on a non-root branch (`not allowed to snapshot
non-root branch`), and no snapshot schedule is configured on
`migration-validation`. Because the migration deliberately keeps its data off the
production branch, **the migrated state has no Neon snapshot**. The verified
artifacts are the generator outputs (`schema.sql`, `data.sql`) plus the parity
report, which is sufficient to rebuild the branch deterministically:

```bash
node gen_schema.mjs && psql "$NEON" -f schema.sql
node gen_data.mjs  && psql "$NEON" -f data.sql
```

If a snapshot is required before cutover, either promote the migration branch to
the project root or copy the data into the root branch first — both are owner
decisions.

---

## 9b. Cost / usage (Phase 43)

The migration itself is cheap — the branch was idle except during the load and
the verification queries:

| Branch | Logical size | Compute time | Active time | Data transfer |
|---|---|---|---|---|
| `migration-validation` | 211 MB | 3,398 s | 13,584 s | 21.1 MB |
| `main` (untouched) | 30 MB | 268 s | 1,060 s | 69 KB |

`cpu_used_sec` is 0 on both branches (the compute is serverless and billed per
active second). The 21 MB of transfer is almost entirely the 201 MB `data.sql`
upload plus the parity queries — a one-off cost, not a recurring one. The
recurring cost after cutover is what matters, and it cannot be measured until
the app runs against Neon (see §9).

---

## 10. Rollback plan

Supabase was never modified, so rollback is a configuration change:

```
Neon problem
  → set DATABASE_URL / auth config back to Supabase
  → redeploy the last known-good SHA + config
```

Supabase still holds every row, user, and policy. `migration-validation` is
disposable and can be deleted without affecting anything.

---

## 11. Drift found on the source (pre-existing, not caused by this migration)

Production's recorded migration history ends at `20261030000000`. **Eight newer
repo migrations were never applied to production**, so the production schema has
no `assigned_tasks`, `task_events`, `internal_notes`, or `saved_views`:

```
20261030120000_organization_operating_clock.sql
20261030120100_rep_day.sql
20261030120200_operational_scheduler.sql
20261030120300_email_engine.sql
20261031120000_assigned_tasks.sql
20261101120000_operations_workspace.sql
20261101130000_meeting_booked_event.sql
20261101135000_notifications_canonical_shape.sql
20261101140000_notification_dedupe.sql
20261101150000_lead_message_previews.sql
```

This is why the Phase 8 operations migration was made tolerant of absent tables
(`to_regclass` guards) — it now applies cleanly to a schema that predates the
task tables, and the task tables pick the policies up when they are created. It is
also why the app's task features cannot be live in production today.

---

## 12. Zero-destructive guarantee

```
SUPABASE
  preserved — no data, schema, user, policy, function, or secret was deleted,
              altered, paused, or rotated
  still the source of truth and the rollback database

NEON
  complete schema (123/123 objects, 0 diffs)
  complete data (41,630 rows, 0 row diffs, 0 hash diffs)
  complete users (32/32, mapping loaded)
  secure RLS (harness 32/32, real-data tenant matrix clean)
  NOT serving production traffic

RELAY
  still running on Supabase — the app has not been repointed
```

**SUPABASE PRESERVED: YES**
