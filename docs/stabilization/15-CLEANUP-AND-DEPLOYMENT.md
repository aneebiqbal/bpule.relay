# Relay — Safe Cleanup Proposals and Deployment / Rollback

## 1. Safe cleanup proposals (none executed)

Deletion requires owner sign-off. Each item preserves unique capability first.

| Proposal | Evidence | Risk |
|---|---|---|
| Retire legacy AI router `src/lib/ai/routing.ts` and repoint its 4 importers to `src/lib/ai/runtime` | R-07 | medium — provider selection must be diffed |
| Remove dead pages `/admin/growth`, `/admin/activity`, `/conversations`, `/usage`, `/content/growth` | route inventory | low — all redirect or are unreferenced |
| Remove superseded APIs `/api/growth/{decision,draft,memory,publications,today}`, `/api/content/intelligence/{discover,forge,interview,org-themes}`, `/api/profile-intelligence/legacy/classify` | 0 references | low |
| Delete `backfillProfileCoverage` | R-14, no callers | low |
| Remove `_userId` params | R-12 | trivial |
| Guard the live-test config against production URLs | R-03 | low, high value |

Do **not** delete: legacy tables `daily_targets`, `day_closes`,
`revenue_identity_contracts`, `profile_assignments` (history), or the production
`V6 fixture` profile without authorization.

## 2. Deployment (from `OPS.md` §4–§7)

```bash
# 1. Apply migrations with the admin URL first if the release adds any
node scripts/apply-migrations.mjs          # uses SERVICE_DATABASE_URL

# 2. Merge the feature branch to main and push
git checkout main && git merge feat/relay-job-intelligence-v2 && git push

# 3. GitHub Actions builds .next/standalone, strips .env*, uploads to
#    /home/deploy/apps/relay-releases/<SHA>, repoints relay-current, restarts PM2

# 4. Verify
curl -s https://relay.bpulse.dev/api/version          # sha must equal the new SHA
curl -o /dev/null -w '%{http_code}\n' https://relay.bpulse.dev/login   # 200
node scripts/qa/reconcile-operations.mjs 11111111-1111-1111-1111-111111111111
```

Required env on the VPS: `DATABASE_URL`/`SERVICE_DATABASE_URL` (Aiven),
`RELAY_DB_PROVIDER=postgres`, `CRON_SECRET`, `DATABASE_SSL_CA` or
`DATABASE_SSL_VERIFY=false`, AI provider keys (optional). Never set
`RELAY_TEST_CLOCK` / `RELAY_TEST_CLOCK_IN_PRODUCTION`.

## 3. Rollback

```bash
# Application: atomic symlink swap + PM2 restart
ln -sfn /home/deploy/apps/relay-releases/<previous-sha> /home/deploy/apps/relay-current
pm2 restart relay

# Database: restore the prior snapshot first if the release added a migration
# (no destructive migrations exist in this branch)
```

## 4. Worker timers

```bash
for u in job-discovery job-verification job-inventory job-preparation job-notifications; do
  systemctl list-timers "$u.timer" --no-pager
  journalctl -u "$u.service" -n 50 --no-pager
done
```

## 5. Production data cleanup (authorized only)

The `V6 fixture` profile `10d83285-318c-485c-99be-9487ab899730` and its
references are documented with a transactional delete order in
`docs/RELAY_PRODUCTION_RELEASE.md` §9. Not executed.
