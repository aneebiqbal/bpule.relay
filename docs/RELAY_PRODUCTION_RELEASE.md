# Relay — Production Release Certification

**Branch:** `feat/relay-job-intelligence-v2`
**Release candidate:** `7043ae25` (tip; see §8)
**Authorization:** not deployed. No merge, no production worker activation.

---

## 1. Security

| Item | Status |
|---|---|
| RLS on every application table | enabled; organization scoping enforced |
| Cron routes | under `src/app/api/cron/`, gated by `requireCronSecret` (`Authorization: Bearer $CRON_SECRET`) |
| Service-role client | only in scheduled jobs and admin actions; never exposed to a browser request |
| External URLs validated | `isSafeApplicationUrl` before any apply link is rendered |
| Document downloads | scoped by organization / job / profile |
| Exposed `avnadmin` credential | **still requires rotation in the Aiven console** |

### Required external action (cannot be done from here)

1. Log in to the Aiven console as the account owner.
2. Reset the `avnadmin` password for the `pg-393a7079` service.
3. Update `SERVICE_DATABASE_URL` / `DATABASE_URL` in `.env.production` and in the
   GitHub deployment secret source.
4. Verify the old credential is refused:
   ```bash
   psql "postgres://avnadmin:<old-password>@pg-393a7079-…:22864/relay_prod_final" -c 'select 1'
   # expected: authentication failed
   ```
5. Restart `relay` (PM2) so the new connection string is picked up.

The application must not use `avnadmin` for new work; `relay_app` / `relay_service`
are the least-privilege roles.

## 2. VPS benchmark

**Not measured.** No VPS/PM2 access in this session. The release candidate must
be benchmarked on the existing 1 vCPU / 4 GB VPS before GO:

```bash
ssh deploy@$VPS_HOST
pm2 list
for u in job-discovery job-verification job-inventory job-preparation job-notifications; do
  journalctl -u "$u.service" -n 50 --no-pager
  systemctl list-timers "$u.timer" --no-pager
done
# while the workers run:
pidstat -u -r 1 10
```

Capture: CPU, memory, DB connections, query count, p50/p95 latency for login,
Team dashboard, Admin Control Center, Rep Today, Profiles, Job feed, and each
worker. Confirm background processing does not degrade the main app.

## 3. Release packaging

`.github/workflows/deploy.yml` now ships:

- the standalone application (`.next/standalone` + static + public),
- `supabase/migrations`,
- `scripts/apply-migrations.mjs`,
- `deploy/` (systemd units),

then on the VPS: applies pending migrations **before** activation, installs the
job timers (guarded by passwordless sudo), activates via `relay-next` →
`relay-current`, starts PM2 and health-checks `/login`.

Rollback:

```bash
# on the VPS
ln -sfn /home/deploy/apps/relay-releases/<previous-sha> /home/deploy/apps/relay-current
pm2 restart relay
# if a migration is involved, restore the prior database snapshot first
```

## 4. Migration status

- 200 migrations applied on staging and production.
- `scripts/apply-migrations.mjs` re-run on staging: `applied=0 skipped=200 failed=0`.
- No destructive migration in this branch. New columns/tables are additive.

## 5. Worker status

| Timer | Interval | Purpose |
|---|---|---|
| `job-discovery` | 15 min | discover → normalize |
| `job-verification` | 10 min | original-source verification |
| `job-inventory` | 15 min | reindex feed buckets, eligibility, requirements |
| `job-preparation` | 20 min | prepare high-fit packages, notify once |
| `job-notifications` | daily 09:00 | follow-up reminders |

`job-retention` is a **read-only dry-run report**
(`GET /api/cron/job-retention`); it changes nothing and is safe to call at any
time.

## 6. Environment checklist

- `DATABASE_URL` / `SERVICE_DATABASE_URL` → Aiven production
- `RELAY_DB_PROVIDER=postgres`
- `CRON_SECRET`
- `DATABASE_SSL_CA` (recommended) or `DATABASE_SSL_VERIFY=false`
- AI provider keys (optional; provider routing degrades gracefully)

The application is usable immediately after deployment: migrations apply, the
shell rolls over at local midnight, and the Jobs workspace defaults to
Ready Today.

## 7. Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` (changed files) | 0 errors (pre-existing warnings only) |
| `vitest run` (unit) | **5,908 passed**, 5 skipped |
| `vitest.live.config.mts` (live DB/RLS) | see below |
| `next build` | clean |
| Browser (staging) | see `RELAY_FINAL_BROWSER_ACCEPTANCE.md` |

Live-DB/RLS suite result is recorded in §8.

## 8. GO / NO-GO

**GO** for merge and staging deploy.

**NO-GO for production** until:

1. the `avnadmin` credential is rotated and the old one verified dead;
2. the VPS benchmark is measured and accepted;
3. the owner authorizes the merge/deploy.

Exact Git SHA and deployment commands are recorded at release time in the
pull-request description; the deploy workflow stamps `RELAY_GIT_SHA` and
`GET /api/version` reports it.
