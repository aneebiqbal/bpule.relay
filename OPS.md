# Production Operations

This is the single source of truth for running Relay in production.

**Architecture (actual).** InterServer Ubuntu VPS (`162.35.45.37`) · Next.js
**standalone** build under **PM2** on `127.0.0.1:3000` · **Caddy** reverse
proxy · **Cloudflare** in front · **Aiven PostgreSQL** · Better Auth in-app
(`neon_auth` schema) · GitHub Actions deploying from `main`.

Domain: `https://relay.bpulse.dev`.

> There is no Vercel deployment and no Supabase project. Any document or runbook
> that says otherwise is stale — this file replaces it.

---

## 1. CI / CD

**CI** (`.github/workflows/ci.yml`) runs on every push and PR:
`pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm build`. All three must pass.

**CD** (`.github/workflows/deploy.yml`) runs on every push to `main` and on
`workflow_dispatch`:

1. Check out, `pnpm install --frozen-lockfile`, `pnpm build`.
2. Verify `.next/standalone/server.js` exists.
3. Package standalone + `.next/static` + `public` into a tarball. Build-time
   `.env*` files are deleted so the build environment never ships.
4. `scp` the tarball to `/home/deploy/apps/relay-releases/<SHA>/release.tar.gz`.
5. On the VPS: extract, symlink `/home/deploy/apps/relay/.env.production` into
   the release, atomically move `relay-current` to the new release.
6. `pm2 delete relay` → `pm2 start server.js --name relay` with
   `HOSTNAME=127.0.0.1 PORT=3000 RELAY_GIT_SHA=<sha>`.
7. Health check `http://127.0.0.1:3000/login` for up to 40 s; `pm2 save` on
   success, fail the workflow otherwise.

**Deployed SHA**: `GET /api/version` reports `sha`, `shortSha`, `ref`,
`deploymentId`, `buildTime`, `appVersion`, and the live `databaseProvider` /
`authProvider` names. `RELAY_GIT_SHA` is stamped by the workflow; if `sha` is
`null` the deployment is unidentified and must not be certified.

**Releases are immutable.** Every release is a directory under
`relay-releases/<SHA>`; rollback is a symlink swap, not a rebuild.

---

## 2. Server layout

| Path | Purpose |
|---|---|
| `/home/deploy/apps/relay/.env.production` | The only environment file. Never copied into a release. |
| `/home/deploy/apps/relay-releases/<SHA>/` | One immutable extracted release |
| `/home/deploy/apps/relay-current` | Symlink to the active release |
| `/home/deploy/apps/relay-shared/` | Persistent uploads / storage if any |

Secrets live only in `.env.production` on the VPS and in GitHub Actions secrets
(`VPS_SSH_HOST`, `VPS_SSH_KEY`, and the build environment). No secret is in the
repo, the release tarball, or the browser.

---

## 3. Roles and access

| Principal | Access |
|---|---|
| `deploy` SSH user | Releases, PM2, Caddy reload. No database credentials. |
| App runtime | `DATABASE_URL` → the **restricted application role** (`relay_app`, `rolbypassrls = false`, member of `authenticated`). RLS enforced; `app.current_user_id` set transaction-locally per operation. |
| Service operations (cron, webhooks) | `SERVICE_DATABASE_URL` → elevated role, used only by explicitly allowlisted server paths (`src/lib/supabase/service-allowlist.ts`). Never reachable from a user request. |
| Better Auth | Own pool against Aiven (`neon_auth` schema). |

Verify the cutover with `scripts/qa/verify-production-rls-cutover.mjs`: fresh page
traffic must use `relay_app` with **0** owner-role page connections.

---

## 4. Database

Aiven PostgreSQL. Provider is selected by `RELAY_DB_PROVIDER` (`postgres` in
production, `neon` is the rollback path).

Migrations live in `supabase/migrations/` and are applied by the operator, not by
the app. `relay_app` and `relay_service` are DML-only on Aiven; DDL requires the
`avnadmin` connection string. Use the tracked runner (it records versions in
`supabase_migrations.schema_migrations` and rolls each migration back on failure):

```bash
SERVICE_DATABASE_URL='<Aiven avnadmin connection string>' \
  bash scripts/apply-pending-migrations.sh
```

Before any release that adds migrations:

1. Take a dump (§5).
2. Apply migrations in filename order.
3. Deploy.
4. Verify `/api/version` and a real login.

---

## 5. Backup and restore

```bash
# Manual dump before any risky migration
pg_dump --host "$DB_HOST" --port 5432 --username relay_app \
  --dbname postgres --schema public \
  --file relay-backup-$(date +%Y%m%d-%H%M%S).sql
```

Store dumps outside the VPS (encrypted object storage or a password manager).
Aiven also provides its own automatic backups.

**Restore**

1. Stop traffic or deploy a maintenance page.
2. Restore the dump into the target database.
3. Confirm migration state matches the code (§4).
4. Deploy the matching SHA.
5. Smoke test: login, open the Control Center, run an analysis.

---

## 6. Monitoring

| Signal | Source | Threshold |
|---|---|---|
| Uptime | External monitor pinging `/api/me/status` | 2 consecutive failures |
| Errors | `pm2 logs relay` / stdout | > 5% 5xx in 10 min |
| DB pool | `pm2 logs` + Aiven console | checkout latency rising |
| DB health | Aiven console | connections < 80% of limit |

Pools: app `DATABASE_POOL_MAX` (default 3), service (1), Better Auth (2) — one
client per operation, released immediately. Steady state is far below Aiven's
limit; starvation is an ownership bug, not a limit problem.

---

## 7. Rollback

Releases are immutable directories and `relay-current` is a symlink, so rollback
is a swap, not a rebuild:

```bash
cd /home/deploy/apps
ln -sfn /home/deploy/apps/relay-releases/<last-good-sha> relay-current
pm2 delete relay
cd /home/deploy/apps/relay-current
HOSTNAME=127.0.0.1 PORT=3000 RELAY_GIT_SHA=<last-good-sha> \
  pm2 start server.js --name relay
pm2 save
curl -fsS http://127.0.0.1:3000/login -o /dev/null && echo rollback-ok
```

If the bad release also applied migrations, restore the dump from before them
**before** swapping back. No data migration is involved in a code-only rollback.

---

## 8. Incident response

| Severity | Examples | Response |
|---|---|---|
| Critical | Cross-org leak, service-role key exposure | < 1 h |
| High | Auth bypass, unauthorised admin access, provider key leak | < 4 h |
| Medium | Rate-limit failure, degraded AI provider | < 24 h |
| Low | UI bug, non-sensitive log leakage | next sprint |

1. **Contain** — rotate exposed keys; if a database vulnerability is suspected,
   rotate the service role and revoke sessions.
2. **Assess** — scope by organization; inspect Postgres logs and PM2 logs.
3. **Notify** — affected organizations within 72 h if personal data is involved.
4. **Remediate** — apply the fix and verify with the adversarial RLS tests
   (`supabase/tests/rls-adversarial.ts`, `supabase/tests/rpc-isolation-adversarial.ts`).
5. **Post-incident** — document within 48 h and update this runbook.

**Key rotation** — rotate the AI provider keys in `.env.production` on the VPS
and restart PM2. Rotate the database role password in Aiven, then update both
`DATABASE_URL` and `SERVICE_DATABASE_URL` and restart. No key is stored in the
repo.

**Data deletion** — self-service `/api/account/delete`, or an admin
`/api/organization/delete`. Backups retain data until they rotate.

---

## 9. Environment variables

Set in `/home/deploy/apps/relay/.env.production` (production) or `.env.local`
(development). Never commit either.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Restricted application role (`relay_app`) |
| `SERVICE_DATABASE_URL` | yes | Elevated role, cron/webhooks only |
| `RELAY_DB_PROVIDER` | yes | `postgres` (production) |
| `RELAY_AUTH_PROVIDER` | yes | `aiven` (production) |
| `NEXT_PUBLIC_APP_URL` | yes | Public origin, used for auth callbacks |
| `BETTER_AUTH_TRUSTED_ORIGINS` | yes | Comma-separated allowed origins |
| `BETTER_AUTH_SECRET` | yes | Session signing |
| `GROQ_API_KEY` / `LONGCAT_API_KEY` / `OPENAI_API_KEY` | live models | AI providers |
| `EMBEDDING_API_KEY` | semantic search | Embeddings |
| `CRON_SECRET` | yes (job discovery) | Bearer secret for `/api/cron/job-discovery` |
| `RELAY_GIT_SHA` | stamped by CD | Deployed commit identity |
| `SCOUT_DAILY_SEND_LIMIT` | no | Per-rep send ceiling (default 15) |
| `DATABASE_POOL_MAX` / `SERVICE_DATABASE_POOL_MAX` / `AUTH_DATABASE_POOL_MAX` | no | Pool sizing |

---

## 9b. Job discovery worker

A systemd timer calls `GET /api/cron/job-discovery` with `CRON_SECRET`. It is a
bounded, lock-protected ingestion tick (default 4 sources, 8 s HTTP timeout,
120 s route ceiling, 220 MB / 30% CPU systemd ceiling). It never runs a second
always-on service and never marks jobs closed because a source failed.

Install: `bash deploy/install-job-discovery.sh`
Units: `deploy/job-discovery.timer`, `deploy/job-discovery.service`
Migrations: `20261119120000_job_intelligence_v2.sql`, `20261119130000_job_intelligence_v3_sources.sql`, `20261119140000_job_intelligence_v3_filters.sql`, `20261119150000_fix_reps_auth_fk.sql`
Enabled sources: RemoteOK, Remotive, Greenhouse · Airbnb, Greenhouse · Stripe, Ashby · Ramp, Ashby · Linear
Admin health: `/jobs?view=sources`
Full record: `docs/RELAY_JOB_INTELLIGENCE_V3.md` (activation) and `docs/RELAY_JOB_INTELLIGENCE_V2.md` (design)

**Staging:** `relay_staging` on the same Aiven project is an isolated schema-clone database used for browser acceptance. Never point the production app at it.

```bash
sudo systemctl start job-discovery.service   # manual tick
journalctl -u job-discovery.service -e
```

Removal:

```bash
sudo systemctl disable --now job-discovery.timer
sudo rm /etc/systemd/system/job-discovery.{service,timer}
sudo systemctl daemon-reload
```

---

## 10. Verification

After every deploy:

```bash
curl -s https://relay.bpulse.dev/api/version      # sha must equal the deployed SHA
curl -s -o /dev/null -w '%{http_code}\n' https://relay.bpulse.dev/api/me/status
pm2 logs relay --lines 200 | grep -i 'already executing' || echo clean
```
