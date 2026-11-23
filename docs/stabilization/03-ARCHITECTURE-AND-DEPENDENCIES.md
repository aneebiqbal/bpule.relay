# Relay — Architecture and Dependencies

**HEAD:** `433489da` · **Provider:** `RELAY_DB_PROVIDER=postgres` (Aiven)

## 1. Layered architecture

```
src/app/(app)/*          authed UI (server components + client islands)
src/app/api/*            261 route handlers (the only mutation surface)
src/lib/operations/*     canonical read/write models (Work Setup, people, team)
src/lib/execution/*      the ONE accountability projection
src/lib/profiles/*       assignment + coverage write paths
src/lib/coverage/*       temporary coverage engine + reconcile
src/lib/org-clock/*      organization-local time authority
src/lib/auth/*           provider abstraction, roles, capabilities
src/lib/db/*             DbClient contract + Supabase/Neon/Postgres adapters
src/lib/request-scope.ts per-request memoization of auth/session/identity
src/lib/job-discovery/*  discovery → verification → inventory → preparation
```

## 2. Database contract

`DbClient` (`src/lib/db/types.ts`) exposes `from`, `rpc`, optional `raw`, and a
`provider` tag. Three adapters:

| Adapter | Transport | Transactions |
|---|---|---|
| `supabase` | PostgREST (`@supabase/supabase-js`) | per-query only; `raw` unsupported |
| `neon` | `@neondatabase/serverless` | per-query `BEGIN`/`COMMIT` |
| `postgres` | `pg` Pool | per-query `BEGIN`/`COMMIT`; `SET LOCAL app.current_user_id` |

**There is no multi-statement transaction primitive.** Each `.from()` write and
each `.raw()` is its own short transaction. This is the root cause of R-02/R-13.

## 3. RLS model

- Identity: `app.current_user_id` set with `set_config(..., true)` inside each
  transaction; reset by `COMMIT`/`ROLLBACK`.
- Helpers: `current_org_id()`, `current_rep_id()`, `is_org_admin()`.
- 160 production tables RLS-enabled; 494 policies; 38 `SECURITY DEFINER`
  functions (search_path pinned in `20261101150000_pin_security_definer_search_path.sql`).
- Service boundary: `src/lib/supabase/service-allowlist.ts`; service client only
  in cron + two admin paths.

## 4. Request performance

`src/lib/request-scope.ts` memoizes `getCurrentUser`, `getAuthContext`, Better
Auth `getSession` and executable-identity resolution per request (React `cache()`
does not cover route handlers). Prior measurement: `auth.session` reads 14 → 1,
`db.read` 47 → 16 per sender-list request (`docs/RELAY_PERFORMANCE_2026-11.md`).
Not re-measured in this pass.

## 5. AI provider routing

- Canonical: `src/lib/ai/runtime/{index,model-router,providers,schemas,telemetry}.ts`.
- Legacy: `src/lib/ai/routing.ts` (2026-10-09) still imported by
  `src/lib/ai/draft.ts`, `draft-stream.ts`, `provider.ts`,
  `src/lib/content/intelligence/forge.ts` (R-07).
- Provider fallback/timeout/schema validation live in the runtime; not exercised
  against a live provider in this pass.

## 6. Job Intelligence pipeline

`job-discovery/`:
- `ingest.ts` — source adapters; `isSafeApplicationUrl` strips unsafe apply/source URLs.
- `verification.ts` — original-source verification.
- `inventory.ts` — feed buckets, eligibility, requirements.
- `preparation.ts` — `prepared_jobs` with `idempotency_key`; `notifyOnce` with
  `dedupeKey: job-prepared:${key}`; `preparation_logs` audit.
- `service.ts` — `listJobs`, `ensureJobMatches`, views.
- Default Jobs view: **`shortlist`**, `ensureJobMatches` bounded to the 200 most
  recent live jobs (`src/app/(app)/jobs/page.tsx:54-58`).

## 7. Background workers (systemd timers)

| Timer | Interval | Purpose |
|---|---|---|
| `job-discovery` | 15 min | discover → normalize |
| `job-verification` | 10 min | original-source verification |
| `job-inventory` | 15 min | reindex buckets, eligibility, requirements |
| `job-preparation` | 20 min | prepare high-fit packages, notify once |
| `job-notifications` | daily 09:00 | follow-up reminders |

`job-retention` is a read-only dry-run report. Not benchmarked in this pass
(N-02).

## 8. Deployment

GitHub Actions builds `.next/standalone`, strips `.env*`, uploads to
`/home/deploy/apps/relay-releases/<SHA>`, repoints `relay-current`, restarts
PM2, health-checks `/login`. Migrations applied before activation via
`scripts/apply-migrations.mjs`. Rollback = symlink swap + PM2 restart (see
`OPS.md §7`).
