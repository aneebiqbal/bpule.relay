# Relay — Authentication & Connection Recovery (2026-11-16)

> Production: `https://relay.bpulse.dev` · VPS (PM2, Caddy, Cloudflare) ·
> Aiven PostgreSQL · `RELAY_DB_PROVIDER=postgres`.
>
> Two coupled defects: a connection-ownership bug that caused pool starvation
> and timeouts, and a status route that reported those timeouts as a false
> "no workspace mapping" (409).

---

## 1. Root cause (confirmed)

### RC1 — One shared client per request, used concurrently

The prior performance change made `PostgresExecutorImpl` hold **one** client per
executor and reuse it for every query. A single request issues many queries
concurrently (`Promise.all` in the layout, `getAuthContext`, `getQueue`), so
`pg` received overlapping `client.query()` calls on the same client:

```
pg: Calling client.query() when the client is already executing a query is deprecated
[auth/current] rep lookup failed: timeout exceeded when trying to connect
```

Because the client was held for the whole request, a pool of
`DATABASE_POOL_MAX=3` served at most three concurrent requests; the rest queued
for a connection and hit `connectionTimeoutMillis` (10 s). This is the
"timeout exceeded when trying to connect" and the 10–20 s `/api/me/status`.

The previously working implementation checked out a client **per operation** and
released it in `finally`. That is the correct ownership model.

### RC2 — Database failures were reported as a missing workspace (409)

`getCurrentUser()` wrapped every failure in a `try/catch` that returned `null`.
`/api/me/status` interpreted `null` as "signed in but no workspace mapping" and
returned **409**. A connection timeout therefore looked exactly like an
unprovisioned user — the reported `{"error":"Signed in, but no Relay workspace
mapping was found for this account."}`.

### RC3 — `loadCoverageFacts` discarded the caller's client

`loadCoverageFacts(orgId, { client })` used the passed client for its reads but
called `loadOperatingPolicy(orgId)` **without** it. After the policy cache TTL
(60 s) expired, that fell back to `createServerSupabase()`, which needs a
request scope and throws `headers() was called outside a request scope` in
scripts/tests and after long requests.

---

## 2. Exact code changes

| File | Change |
|---|---|
| `src/lib/db/postgres.ts` | **One client per operation**, released in `finally` with `ROLLBACK` on failure. `BEGIN` + transaction-local `set_config('app.current_user_id', …, true)` are sent as one round trip (the id is a validated UUID; non-UUID falls back to a parameterised `set_config`). No shared client, no `after()` holding, no concurrent `client.query()`. |
| `src/lib/auth/current.ts` | New `AuthDatabaseError`. A rep/org/voice read error **throws**; only a real absent row returns `null`. The broad `catch → null` is gone. |
| `src/app/api/me/status/route.ts` | Honest status codes: 401 no session, 409 real missing mapping, **500 database/auth failure**. No longer converts a timeout into 409. |
| `src/lib/coverage/load.ts` | `loadCoverageFacts` / `loadRecentReturningCoverage` forward `options.client` to `loadOperatingPolicy`, so a service/test caller never falls back to a request-scoped client. |
| `tests/postgres-executor-perf.test.ts` | Rewritten: per-operation checkout/release, concurrent queries never share a client, transaction-local identity, rollback+release on failure, write transaction. |
| `tests/auth-workspace-resolution.test.ts` | New: mapping present → user; no rep row → `null`; **rep-lookup timeout → `AuthDatabaseError`**; org failure → `AuthDatabaseError`. |

### RLS / tenant isolation

The identity is `SET LOCAL` inside the transaction, so it is scoped to exactly
that operation and reset by `COMMIT`/`ROLLBACK`. No session state is shared
between checkouts. No policy, grant, role, or migration changed. Better Auth
users and the `neon_auth` schema are untouched.

### Round trips

| Shape | Round trips |
|---|---|
| Original (BEGIN, set_config, query, COMMIT) | 4 |
| Corrected (BEGIN+set_config combined, query, COMMIT) | 3 |
| Unsafe shared client (previous change) | 1 but concurrent on one client — rejected |

The remaining latency floor is the Dallas/NJ→Singapore RTT (~210 ms). The fix
removes the starvation and the false 409; it does not pretend one round trip is
safe.

---

## 3. Pool audit

| Pool | Limit | Notes |
|---|---|---|
| App runtime | `DATABASE_POOL_MAX ?? 3` | One client per operation, released immediately. |
| Service | `SERVICE_DATABASE_POOL_MAX ?? 1` | Cron/signed paths, no RLS identity. |
| Better Auth | `AUTH_DATABASE_POOL_MAX ?? 2` | Own pool, TLS verified. |
| Neon (rollback only) | `DATABASE_POOL_MAX ?? 10` | Not used on the postgres provider. |

Per PM2 instance the steady state is bounded by the app pool (3) + service (1) +
auth (2) = 6, far below Aiven's 100-connection Developer-1 limit. The starvation
was ownership, not the limit. If checkout latency is still seen under load,
raise `DATABASE_POOL_MAX` with evidence — do not use it to mask the shared-client
bug (now fixed).

---

## 4. Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `pnpm lint` | 0 errors |
| `pnpm build` | PASS |
| Concurrency check (30 concurrent queries, pool max 3, real Postgres) | all returned, **0** `pg` "already executing" warnings |
| `tests/postgres-executor-perf.test.ts` | PASS |
| `tests/auth-workspace-resolution.test.ts` | PASS |
| `tests/pg-ssl-config.test.ts`, `tests/send-summary-perf.test.ts` | PASS |
| Full unit suite | see below |

Live-DB tests (`v611`, `v6-live-coverage-acceptance`, `profile-truth-parity`)
require the Aiven host; they pass when it is reachable and fail with
`ENOTFOUND` when it is not. `qa-relay-observability` and
`service-boundary-allowlist` fail identically on a clean `HEAD` worktree
(pre-existing, unrelated).

---

## 5. Deployment

```bash
# no migration, no data change
git fetch origin
git log --oneline -6
pnpm install --frozen-lockfile
pnpm build
pm2 restart relay
curl -s -o /dev/null -w '%{http_code}\n' https://relay.bpulse.dev/api/me/status
```

Expected: a signed-in user with a workspace gets **200**. A signed-in user with
no rep row gets **409**. A database failure gets **500** (never 409).

Verify no deprecation warning under load:

```bash
pm2 logs relay --lines 500 | grep -i "already executing" || echo "clean"
```

### Rollback

```bash
git revert <fix-sha>   # or git checkout <previous-sha> && pnpm build && pm2 restart relay
```

No data migration is involved, so rollback is a plain code revert.

---

## 6. Remaining work

1. `/api/me/status` still issues ~12 reads; the network floor dominates.
2. The app layout's `loadSidebarCounts` reads up to 1500 leads in memory for the
   badge — a SQL aggregate would remove it.
3. `DATABASE_POOL_MAX` is low (3); revisit with measured concurrency after this
   fix.
