# RELAY — SUPABASE → NEON MIGRATION

Autonomous migration runbook. This document is the living record of the migration:
what was provisioned, how the schema and data were captured, what is verified, and
what is still blocked.

**Status: IN PROGRESS — schema capture + Neon staging. No production cutover performed.**

---

## 0. Phase 0 — Freeze + Baseline

Captured before any Neon provisioning.

| Field | Value |
| --- | --- |
| git branch | `release-merge` |
| git HEAD | `8d68cd66635647d47da3dc0ae0eeb54845800809` |
| `origin/main` | `b7d8feb08ec5b0a585f138088ff0e08b50c1e7be` |
| Working tree | 32 changed paths (uncommitted feature work) |
| Recorded deployed SHA (manifest) | `7e2dc40d285422ef323e39874e261290f00560ce` |
| Manifest SHA gate | `NOT_VERIFIED` |
| Manifest production gate | `BLOCKED` |
| Supabase project ref | `fhnkanwvgamitrcuzpem` (name `scout`) |
| Supabase org | `hrdmtwhuopdrrppbfkcg` |
| Supabase region | Northeast Asia (Seoul) |
| Supabase Postgres | **17.6** (x86_64, gcc 15.2.0) |
| Supabase DB size | **185 MB** |
| Database name | `postgres` |

### Baseline QA (run on the working tree)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `pnpm qa:contracts` | **PASS** (64/64) |
| `pnpm qa:release` | **AUTOMATED_CODE_GATE PASS** (4437/4437) |
| `pnpm test` (vitest) | **PASS** (4437/4437) |
| `pnpm build` | **PASS** |
| `qa:release` browser gate | NOT_RUN (`E2E_BASE_URL` unset) |
| `qa:release` SHA gate | NOT_VERIFIED (no `/api/version` reachable) |
| `qa:release` production gate | BLOCKED |

> The first baseline run reported one failing test
> (`tests/relay-p0-fixes-2026-10-24.test.ts`). Re-running the same file and the
> full suite on an unchanged tree passed 7/7 and 4437/4437, so the first failure
> was transient (the tree was being written by concurrent work), not a real
> baseline. Confirm with the recorded re-run before treating the tree as green.

---

## 1. Phase 1 — Source Access

### 1.1 MCP availability

| Tool | Available | Notes |
| --- | --- | --- |
| Neon MCP | **Yes** | ADMIN on org `org-shy-butterfly-06982133` |
| Supabase MCP | **No** | Not connected in this session |
| Supabase CLI | Yes (2.75.0) | Linked to project `scout` |
| `psql` / `pg_dump` | Yes (PostgreSQL 17.9) | Local Homebrew install |

### 1.2 Supabase project state — IMPORTANT

Every gateway service on the Supabase project returns **HTTP 402**:

```
{"message":"Service for this project is restricted due to the following
 violations: exceed_egress_quota. The project owner must upgrade their plan or
 remove spend caps to restore service."}
```

Confirmed for: PostgREST (`/rest/v1/`), Auth admin (`/auth/v1/admin/users`),
Storage (`/storage/v1/bucket`), Realtime. This is the direct cause of the
migration.

Direct Postgres (port 5432/6543 and the pooler) and the **Management API SQL
endpoints remain reachable**. All source inspection was done read-only through:

```
POST https://api.supabase.com/v1/projects/{ref}/database/query/read-only
```

No `INSERT`/`UPDATE`/`DELETE`/`DDL` was issued to Supabase.

### 1.3 Source inventory

Full detail in [`docs/RELAY_SUPABASE_DEPENDENCY_MAP.md`](./RELAY_SUPABASE_DEPENDENCY_MAP.md).

| Item | Count |
| --- | ---: |
| Schemas | 12 |
| Tables (public) | 123 |
| Columns (public) | 1861 |
| Indexes (public) | 507 |
| Functions (public) | 154 |
| SECURITY DEFINER functions (public) | 30 |
| Triggers (public) | 4 |
| RLS policies (public) | 374 |
| Foreign keys (public) | 312 |
| Constraints (public) | 700 |
| Extensions | 8 |
| auth.users | 32 |
| auth.identities | 31 (1 provider) |
| Storage buckets | 2 (`profile-sources`, `proof-cvs`) |
| Storage objects | 48 |
| Realtime publication | 1 (`supabase_realtime`) |
| **Total public rows** | **≈ 44,000** |

### 1.4 Migration drift — production is authoritative

Production's applied-migration history ends at **`20261003000000`
(`extend_ai_traces_intelligence`)**. The repository holds **140** migration
files; only **89** are recorded as applied and **49 newer files are absent from
production history**. The schema was therefore captured **from the live
database catalogs**, not replayed from migration files.

---

## 2. Phase 3–4 — Neon Provisioning

| Field | Value |
| --- | --- |
| Neon project | **`lingering-cell-60275711`** (`relay-production`) |
| Org | `org-shy-butterfly-06982133` |
| Region | `aws-ap-southeast-1` (Singapore) — closest available to Seoul |
| Postgres | 17 |
| Logical replication | enabled |
| Default branch | `main` = `br-wild-glade-aor6j5jj` |
| Migration branch | **`migration-validation`** = `br-quiet-salad-aogboo1k` |
| Database | `neondb` |

Region note: Neon has no `ap-northeast-2` (Seoul). Singapore is the closest
available region to the Supabase deployment.

Pre-migration snapshot: `create_snapshot` is rejected on non-root branches
(`not allowed to snapshot non-root branch`). Snapshot capability will be
revisited on the production branch after cutover (Phase 41).

---

## 3. Compatibility findings (Phase 6)

| Source item | Neon status | Resolution |
| --- | --- | --- |
| `pgcrypto` | available | migrated |
| `uuid-ossp` | available | migrated |
| `vector` | available | migrated |
| `pg_stat_statements` | available | migrated |
| `pg_cron` | available | extension migrated; **job not reproduced** (see below) |
| `pg_graphql` | available | not used by Relay |
| **`pg_net`** | **NOT available** | cron job dropped |
| **`supabase_vault`** | **NOT available** | cron job dropped |
| `auth.uid()` / Supabase session GUCs | N/A | replaced by Neon Auth + server identity model |
| Supabase Storage | N/A | metadata migrated; object blobs require separate handling |
| Supabase Realtime publication | N/A | needs replacement decision |

### 3.1 The `pg_cron` → `pg_net` → `vault` chain

Production has one `pg_cron` job (`jobid 1`, every 10 minutes) that calls
`net.http_get()` against `https://bpule-relay.vercel.app/api/cron/operational-scheduler`
with a bearer token read from `vault.decrypted_secrets` (`relay_cron_secret`).

Neon does not provide `pg_net` or `supabase_vault`, so this job cannot be
reproduced. It is **not required**: `vercel.json` already defines a Vercel Cron
for `/api/cron/operational-scheduler` (`0 4 * * *`), and the secret is already
in the application environment (`CRON_SECRET`). The 10-minute keep-alive
cadence is the only behaviour not directly covered and should be confirmed with
the owner.

### 3.2 Auth

Neon Auth is **Managed Better Auth**, which is Supabase-API compatible but uses
a different password hashing algorithm. **Existing Supabase password users
cannot be migrated with their passwords** — Neon documents this explicitly.
Strategy: import identity/email records and force a secure password reset on
first login. See Phase 11–14.

---

## 4. Migration method (Phase 7–10)

Supabase direct Postgres credentials (the dashboard DB password) are not exposed
by the Management API and were not available in this environment, so `pg_dump`
could not be used. The schema was instead generated from live PostgreSQL
catalogs through the read-only Management API, using:

- `format_type`, `pg_get_expr`, `pg_attrdef` — columns, defaults, generated columns
- `pg_get_constraintdef` — primary/unique/check/FK constraints
- `pg_get_indexdef` — indexes
- `pg_get_functiondef` — functions
- `pg_get_triggerdef` — triggers
- `pg_policies` — RLS policies
- `pg_class` / `pg_namespace` — tables, RLS flags

Data is exported as ordered `INSERT` statements and loaded with `psql`.

This approach is faithful for DDL but is **not** a `pg_dump` substitute: it does
not carry grants, comments, or `pg_dump`'s exact object ordering. Any object
that fails to apply is reported rather than silently skipped.

---

## 5. Gates

| Gate | Status |
| --- | --- |
| `NEON_PROJECT_CREATED` | **PASS** — `lingering-cell-60275711`, `aws-ap-southeast-1` |
| `SCHEMA_PARITY` | **PASS** — 10/10 object classes identical (123 tables, 1861 columns, 507 indexes, 40 functions, 27 SECURITY DEFINER, 4 triggers, 374 policies, 115 RLS tables, 312 FKs, 388 constraints) |
| `DATA_ROW_PARITY` | **PASS** — 0 mismatches across 123 tables |
| `DATA_HASH_PARITY` | **PASS** — 0 mismatches across 13 critical tables |
| `AUTH_MIGRATION` | **PASS** — 32/32 users, mapping loaded, JWKS live |
| `AUTH_ONBOARDING` | NOT_RUN — needs the app repointed (see §9 of the final report) |
| `RLS_TENANT_MATRIX` | **PASS** — isolated harness 32/32; real-data tenant matrix clean |
| `SECURITY_DEFINER_AUDIT` | **PASS** — 27/27 parity; 3 unpinned `search_path` fixed |
| `READ_PATH_PARITY` | NOT_RUN — app still on PostgREST |
| `WRITE_PATH_PARITY` | NOT_RUN — app still on PostgREST |
| `AUTOMATED_CODE_GATE` | **PASS** — tsc, 64/64 contracts, 4568/4568 tests, build |
| `BROWSER_GATE` | NOT_RUN — no reachable app |
| `PERFORMANCE_SANITY` | NOT_RUN — no reachable app |
| `FINAL_DELTA_SYNC` | NOT_RUN — cutover not performed |
| `SHA_GATE` | NOT_VERIFIED — no `/api/version` reachable |

Full detail: `docs/RELAY_NEON_MIGRATION_FINAL.md`.

---

## 6. Safety

- **Supabase was treated as read-only.** No destructive or mutating SQL was
  issued. Supabase remains the rollback database.
- All writes went to the isolated `migration-validation` branch.
- No credentials are recorded in this document.
