# Relay — Repository Inventory

**HEAD:** `433489da187fb0d87e218a11868fa796210c976b`
**Package:** `scout@0.1.0` (private)
**Package manager:** pnpm 9.12.0

## 1. Counts (static, from source)

| Item | Count |
|---|---|
| Page routes (`page.tsx`) | 112 — (app) 78, (public) 29, (landing) 1, standalone 4 |
| API route handlers (`src/app/api/**/route.ts`) | 261 |
| Non-API route handlers | 2 (`auth/callback`, `og`) |
| Layouts / loading / error / not-found | 6 / 7 / 1 / 1 |
| Files with `"use server"` | 0 (all mutations are API routes) |
| Migrations (`supabase/migrations/*.sql`) | 201 |
| `CREATE TABLE` unique names | 171 |
| `ENABLE ROW LEVEL SECURITY` statements | 173 (unique tables 159) |
| Literal `CREATE POLICY` statements | 603 (unique names 476) |
| Dynamic policy templates | 14 in 3 files |

## 2. Runtime schema (production, read-only probe 2026-11-23)

| Item | Count |
|---|---|
| Tables in `public` | 192 |
| Tables with RLS | 160 |
| Policies | 494 |
| `SECURITY DEFINER` functions | 38 |
| `tailored_cvs` | present |
| `current_org_id()` | present |

## 3. Technology stack

- **Next.js 16.3.4** (App Router, React 19.2.8, TypeScript 5).
- **Auth:** Better Auth 1.7.15 on Aiven PostgreSQL (`neon_auth` schema); provider
  abstraction supports `supabase`, `neon`, `aiven` (`src/lib/auth/contract.ts`).
- **Database:** Aiven PostgreSQL (`pg-393a7079…`), `RELAY_DB_PROVIDER=postgres`.
- **DB contract:** `src/lib/db/types.ts` with three adapters: Supabase (PostgREST),
  Neon serverless, standard Postgres (`pg`). RLS identity travels in
  `app.current_user_id`, set transaction-locally.
- **AI:** OpenAI-compatible clients; canonical router `src/lib/ai/runtime/*`;
  legacy `src/lib/ai/routing.ts` still imported by 4 modules (R-07).
- **Jobs:** `src/lib/job-discovery/*` (discovery, verification, inventory,
  preparation, service), 5 systemd timers.
- **Deployment:** GitHub Actions → VPS, PM2, systemd timers, Caddy/Cloudflare.

## 4. Major product areas (discovered)

Authentication/sessions; organizations; admin/permissions; team management;
people/reps; Work Setup; profile intelligence; LinkedIn; Upwork; prospect
analyzer; conversation intelligence; lead intelligence; assignments/coverage;
daily targets; Today/accountability; tasks; attendance; notifications;
follow-ups/escalations; Content Studio; Growth; Job Intelligence (V2–V8);
ATS Resume Studio; application preparation; reports/performance; background
workers; database/migrations/RLS; deployment/observability.

## 5. Key canonical modules

| Module | Responsibility |
|---|---|
| `src/lib/execution/accountability.ts` | The ONE daily accountability projection |
| `src/lib/operations/work-setup.ts` | Work Setup read model |
| `src/lib/operations/work-setup-write.ts` | The ONE Work Setup write path |
| `src/lib/profiles/assignment.ts` | Responsibility chain writes + `assertSeatsInOrg` |
| `src/lib/coverage/actions.ts` | Coverage/availability writes; `configureCoverage` dispatch |
| `src/lib/coverage/configure.ts` | Chain reconcile as one SQL statement |
| `src/lib/org-clock/index.ts` | Organization-local time authority |
| `src/lib/request-scope.ts` | Per-request memoization of auth/session/identity |
| `src/lib/supabase/service-allowlist.ts` | Service-role boundary |
| `src/lib/navigation/relay-shell-nav.ts` | Role-aware information architecture |

## 6. Documentation inventory (status)

| Status | Documents |
|---|---|
| Current | `docs/RELAY_FINAL_ROOT_CAUSE.md`, `RELAY_FINAL_RELEASE_CERTIFICATION.md`, `RELAY_PRODUCTION_RELEASE.md`, `RELAY_FINAL_BROWSER_ACCEPTANCE.md`, `docs/stabilization/*` |
| Historical | `audit-reports/archive/01..08` (2026-09-29 ledger, superseded), `docs/RELAY_SPRINT3..8`, `docs/RELAY_V3..V8` |
| Contradictory | `docs/RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md` §7 lists unguarded admin routes that are now guarded; its dead-route list predates the V2–V8 job work |
| Unverified | `docs/RELAY_PERFORMANCE_2026-11.md` (measured on a different host/session) |
| Obsolete | `docs/RELAY_NEON_*` cutover notes, `docs/RELAY_SUPABASE_APPLICATION_DEPENDENCY_MAP.md` |
