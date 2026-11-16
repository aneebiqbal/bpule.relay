# Relay — Authentication & Performance Recovery (2026-11-16)

> Production: `https://relay.bpulse.dev` · VPS Ubuntu 24.04 (2 vCPU / 4 GB, PM2, Caddy, Cloudflare) ·
> Aiven PostgreSQL Developer-1 (Singapore) · `RELAY_DB_PROVIDER=postgres`.
>
> Scope: diagnose and fix the authenticated latency end to end, without weakening
> RLS, tenant isolation, or TLS.

---

## 1. Confirmed root causes (with evidence)

### RC1 — Every read cost four round trips (dominant)

`PostgresExecutorImpl.query()` wrapped **every** read in:

```
BEGIN → SELECT set_config('app.current_user_id', …, true) → <query> → COMMIT
```

The Neon executor documents the same shape. On a Dallas→Singapore path
(~210 ms RTT, measured 210–218 ms reused), one read cost ~840 ms before the
statement itself ran.

`/api/me/status` executes roughly 14–15 reads (auth session, rep, org, voice,
org role, memberships, capabilities, send counts, operating policy). At ~840 ms
each on the critical path this is **~12–15 s**, matching the confirmed 14.67 s
TTFB. Authentication/navigation took 60–120 s because the app layout runs the
same executor for ~20+ reads, plus `getQueue()` loaded every owned lead row.

### RC2 — `createServerSupabase()` initialized Supabase on the Postgres provider

`src/lib/supabase/server.ts` built the Supabase client before checking
`RELAY_DB_PROVIDER`. With Supabase env vars removed for Aiven, every
`createServerSupabase()` call threw `Supabase env vars are not configured`.
Fixed earlier this session; regression-covered by the app boot check.

### RC3 — `/api/me/status` and the app layout loaded a payload they never rendered

Both called `store.getQueue()`, which reads **all** owned leads, then discards
them (`queue` / `replies` are unused by the rail and the shell). The rail only
needs `todaySends` and `dailyLimit`.

### RC4 — Duplicate org-settings read

`getCurrentUser()` already reads the `organizations` row; `getOrgSettings()`
read it again for `settings`.

### RC5 — Duplicate client-side `/api/me/status`

`CommandPaletteProvider` fetched `/api/me/status` on every page load even though
the server layout had already resolved the canonical role.

### RC6 — TLS verification was off unless a flag was set, and Better Auth used a different config

`postgres.ts` used `DATABASE_SSL_VERIFY`; `better-auth.ts` hard-coded
`rejectUnauthorized: false`. There was no way to supply the Aiven CA.

---

## 2. Exact code changes

| File | Change |
|---|---|
| `src/lib/db/postgres.ts` | Executor holds **one connection per request**, sets `app.current_user_id` **once** with `set_config(..., false)` (session-level), then runs reads directly. Writes keep `BEGIN`/`COMMIT`. Release is registered with Next `after()`; the GUC is `RESET` before the connection returns to the pool. Falls back to per-statement release when `after()` is unavailable (scripts/tests). |
| `src/lib/db/ssl.ts` (new) | One `resolvePgSslConfig()` for every client. `DATABASE_SSL_CA` (inline PEM or file path) turns on `rejectUnauthorized: true`; `DATABASE_SSL_VERIFY=false` forces insecure; `DATABASE_SSL=false` disables TLS. |
| `src/lib/auth/better-auth.ts` | Uses `resolvePgSslConfig()` instead of hard-coded `rejectUnauthorized: false`. |
| `src/lib/store/supabase-store.ts` | New `getSendSummary()` (count + effective ceiling, **no** lead rows). `getOrgSettings()` reuses `organization.settings` when present. |
| `src/lib/store/types.ts`, `mock-store.ts` | `getSendSummary()` added to the store contract and demo store. |
| `src/lib/domain/types.ts`, `src/lib/auth/current.ts` | `Organization.settings` carried on the org row; `perfTrace` spans around session/rep/org reads. |
| `src/lib/auth/organization.ts` | `perfTrace` spans around role/membership/team/capability reads. |
| `src/app/api/me/status/route.ts` | Uses `getSendSummary()`; total-handler timing with a slow-request warning. |
| `src/app/(app)/layout.tsx` | Uses `getSendSummary()`; injects `window.__RELAY_AUTH_CONTEXT__` so the palette reuses the role. |
| `src/components/command-palette-provider.tsx` | Reads the bootstrap role first; only falls back to `/api/me/status`. |
| `src/lib/perf-trace.ts` | `perfTrace` accepts thenables; `perfLog`/`perfSlow`; slow threshold `RELAY_PERF_SLOW_MS` (default 1500 ms). |
| `src/lib/supabase/server.ts` | Supabase client only for the `supabase` provider (RC2). |
| `.env.local.example` | Documents `postgres`/`aiven`, `SERVICE_DATABASE_URL`, `DATABASE_SSL_CA`, `BETTER_AUTH_TRUSTED_ORIGINS`. |

### Why the executor change is RLS-safe

`set_config('app.current_user_id', $2, false)` is a **session-level** GUC set
before any statement on that connection, so every policy sees the same identity
the old `SET LOCAL` transaction provided. The identity is:

- set on **every** acquire (overwriting any previous value), and
- `RESET` before the connection is returned to the pool.

A connection can therefore never carry user A's identity into user B's request.
Writes still run in a transaction. No policy, grant, or migration changed.

---

## 3. Before / after

Measured baseline (production, from the incident):

| Metric | Before |
|---|---|
| New connection | 1300–1500 ms |
| Reused query | 210–218 ms |
| `/api/me/status` TTFB | **14.67 s** |
| Login / navigation | 60–120 s |

Local benchmark (`scripts/perf-executor-bench.mjs`, 20 queries, local Postgres):

| Shape | Local per query | Round trips |
|---|---|---|
| Old (BEGIN + set_config + SELECT + COMMIT) | 0.69 ms | 4 |
| New (set_config once + N SELECTs) | 0.10 ms | 1 |
| **Speedup** | **6.7×** | **4×** |

Extrapolated to the production RTT for a 15-read request:

| | Extrapolated |
|---|---|
| Old | ~12.6 s |
| New | ~3.1 s |
| With the reduced read set (no lead payload, no duplicate org read, no duplicate client call) | lower; the network floor is ~210 ms × critical-path reads |

**Remaining floor:** Dallas→Singapore is ~210 ms RTT. A request with ~8 reads on
its critical path cannot go below ~1.7 s no matter how optimized. The target
"under 2 s where feasible" is realistic for `/api/me/status` after the read-set
reduction; warm navigation depends on how many layout reads remain.

---

## 4. Test results

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `pnpm lint` | PASS (0 errors; 764 pre-existing warnings) |
| `pnpm build` | PASS |
| Production boot `/api/version` | PASS — `databaseProvider: postgres`, `authProvider: aiven` |
| New `tests/postgres-executor-perf.test.ts` | PASS — 1 connect + 1 identity set for 5 reads; write still transacts; service identity reset; fallback release |
| New `tests/pg-ssl-config.test.ts` | PASS — TLS off / insecure default / inline CA / CA file / system store |
| New `tests/send-summary-perf.test.ts` | PASS — summary never reads `leads`; `getQueue` still does |
| Full unit suite | 5836 passed, 11 failed, 12 skipped |

The 11 failures are all **live-DB** tests that require the Aiven host
(`getaddrinfo ENOTFOUND` from this sandbox) or compare against mutable
production rows (e.g. `v632-health-parity` `last_success_at`). They are
environmental, not regressions. CI with database access must re-run them.

Security/tenant checks: no RLS policy, grant, or migration was changed. The
identity GUC contract (`app.current_user_id`) is unchanged; only its scope
changed from transaction-local to session-local with an explicit reset.

---

## 5. Remaining bottlenecks

1. **Network distance.** ~210 ms RTT dominates. A read is now one round trip;
   further gains require fewer reads, not faster reads.
2. **App layout read set.** `identityDataPromise` + `loadSidebarCounts` +
   `getAuthContext` still issue ~12 reads on every authenticated navigation.
   `loadChatQueue({ countOnly: true })` still reads up to 1500 leads and derives
   rows in memory for the badge. Next step: a SQL `count(*)` aggregate for the
   badge, and caching the identity list per request.
3. **Better Auth session read.** `auth.api.getSession` goes through Better
   Auth's own pool (now TLS-verified) and is 1–2 round trips.
4. **Notification poll.** `NotificationCenter` fetches on mount and every 60 s;
   non-blocking but an extra authenticated request per page load.
5. **Aborted requests.** If a client disconnects before `after()` runs, the
   executor's connection is returned on pool shutdown rather than immediately.
   Bounded by traffic; a future guard could add a max-hold timer.

---

## 6. Deployment

### Pre-requisites on the VPS

```bash
# 1. Aiven CA (one-time). Download from the Aiven console, then:
export DATABASE_SSL_CA=/home/deploy/aiven-ca.pem

# 2. Env (the app runs `next start`; if it still runs `next dev`, put these in
#    .env.local — Next loads .env.production only for `next start`).
#    RELAY_DB_PROVIDER=postgres
#    NEXT_PUBLIC_RELAY_DB_PROVIDER=postgres
#    RELAY_AUTH_PROVIDER=aiven
#    NEXT_PUBLIC_RELAY_AUTH_PROVIDER=aiven
#    DATABASE_URL=postgres://relay_app:…@…/relay_prod_final
#    SERVICE_DATABASE_URL=postgres://relay_service:…@…/relay_prod_final
#    DATABASE_POOL_MAX=12
#    SERVICE_DATABASE_POOL_MAX=1
#    DATABASE_SSL_CA=/home/deploy/aiven-ca.pem
#    BETTER_AUTH_TRUSTED_ORIGINS=https://relay.bpulse.dev
#    NEXT_PUBLIC_APP_URL=https://relay.bpulse.dev
```

### Deploy (small, reversible commits)

```bash
git fetch origin
git log --oneline -5          # review the recovery commits
git merge origin/main         # or deploy the tagged SHA
pnpm install --frozen-lockfile
pnpm build
pm2 restart relay             # or: pm2 reload relay
curl -s https://relay.bpulse.dev/api/version
# → databaseProvider: "postgres", authProvider: "aiven"
```

### Verify after deploy

```bash
# Slow-request warnings appear above 1500ms; full spans with:
RELAY_PERF_TRACE=1 pm2 restart relay
pm2 logs relay --lines 200 | grep '\[perf\]'
```

Expect `[perf] me/status.total` well under the 14.67 s baseline.

### Rollback

All changes are code-only; no migration and no data change.

```bash
# Roll back the deploy to the previous SHA:
pm2 deploy <previous-sha>        # or: git checkout <previous-sha> && pnpm build && pm2 restart relay
```

If the new TLS verification breaks the connection (CA not installed yet), set
`DATABASE_SSL_VERIFY=false` and restart — the app then uses the previous
insecure TLS mode while the CA is installed. Do **not** roll back the executor
change alone; it is the fix.

---

## 7. Commit groups (recommended)

1. `fix(db): reuse one connection per request and set the RLS identity once`
   (`db/postgres.ts`, `db/ssl.ts`, `auth/better-auth.ts`, tests)
2. `perf(me/status): cheap send summary + tracing`
   (`store/*`, `api/me/status`, `perf-trace.ts`, `send-summary-perf` test)
3. `perf(shell): drop the lead payload from the layout and reuse the role`
   (`(app)/layout.tsx`, `command-palette-provider.tsx`)
4. `docs: performance recovery runbook`
