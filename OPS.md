# Production Operations

This document is the single source of truth for running Relay in production.
It assumes the app is deployed to Vercel and the database is Supabase.

---

## CI / CD

Every pull request runs:
1. `pnpm lint` — ESLint
2. `pnpm exec tsc --noEmit` — TypeScript type check
3. `pnpm build` — Next.js production build

All three must pass before merge. The workflow is in `.github/workflows/ci.yml`.

**Preview deployments**: Vercel generates a preview URL for every branch
automatically. Stakeholders review there before merging to `main`.

---

## Backup and Restore

### Automated nightly backups

Supabase projects include daily backups managed by Supabase. Verify the
backup schedule in the Supabase dashboard (Project Settings → Database →
Backups).

### Manual backup (before risky migrations)

```bash
# Dump the public schema and data
pg_dump \
  --host $SUPABASE_DB_HOST \
  --port 5432 \
  --username postgres \
  --dbname postgres \
  --schema public \
  --file relay-backup-$(date +%Y%m%d-%H%M%S).sql
```

Store the dump in a secure location (S3 bucket or password manager attachment).

### Restore procedure (tested)

1. Pause traffic: set the Vercel deployment to maintenance mode or disable
the production domain.
2. Create a fresh Supabase project if the existing database is corrupted.
3. Run the restore:

```bash
psql \
  --host $NEW_SUPABASE_DB_HOST \
  --port 5432 \
  --username postgres \
  --dbname postgres \
  --file relay-backup-YYYYMMDD-HHMMSS.sql
```

4. Update `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in
Vercel environment variables if the project changed.
5. Redeploy the latest successful build from Vercel.
6. Smoke test: log in, create a test lead, run a draft, check the queue.

**Last tested**: document the date here each time you run a restore drill.

---

## Monitoring

### Uptime

Use Vercel Analytics (included on Pro plans) or an external monitor like
UptimeRobot pinging `/api/me/status` every 5 minutes.

**Alert threshold**: 2 consecutive failures (10 minutes down).

### Error rate

Vercel logs errors automatically. Set up a Log Drain to Datadog or a similar
service, or check the Vercel dashboard Functions tab daily.

**Alert threshold**: > 5% of requests returning 5xx in a 10-minute window.

### Database health

Check Supabase Dashboard → Database → Health weekly:
- Connection pool usage < 80%
- No long-running queries > 30s
- Storage usage < 80%

---

## Rollback Procedure

If a deploy breaks production:

1. **Immediate**: in Vercel, go to the project → Deployments, find the last
known-good deployment, click the three dots, and select "Promote to Production".
This takes < 30 seconds.

2. **If the bad deploy mutated the database schema**: restore from the nightly
backup (see Restore procedure above) **before** promoting the old deployment.

3. **Verify**: after rollback, check `/api/me/status` returns 200, log in as a
test user, and confirm the queue loads.

4. **Fix forward**: open a new branch from the last good commit, fix the issue,
open a PR, and have it reviewed in the preview deployment before merging again.

---

## Incident Response

### Classification

| Severity | Examples | Response time |
|----------|----------|---------------|
| **Critical** | Active data breach, cross-org data leak, service role key exposure | Immediate (< 1 hour) |
| **High** | Auth bypass, unauthorized admin access, credential leak to AI provider | < 4 hours |
| **Medium** | Rate limit failure, degraded AI provider, analytics misconfiguration | < 24 hours |
| **Low** | UI bug, non-sensitive log leakage, documentation inaccuracy | Next sprint |

### Breach response procedure

1. **Contain**: If a key or credential is exposed, rotate it immediately in Supabase dashboard and Vercel environment variables. If a database vulnerability is suspected, revoke the service role key and rotate the anon key.

2. **Assess**: Determine scope — which organizations, users, or data types are affected. Check Supabase logs (Dashboard → Logs → Postgres) for unauthorized queries. Check Vercel function logs for suspicious API calls.

3. **Notify**: Contact affected organizations within 72 hours if personal data may be compromised. Email template:

   > We recently identified a security incident that may have affected your Relay organization's data. [Describe scope.] We have [taken these steps] to contain it. We recommend [specific action]. Contact security@relay.bpulse.dev with questions.

4. **Remediate**: Apply the fix, verify with the adversarial RLS test (`supabase/tests/rls-adversarial.ts` and `supabase/tests/rpc-isolation-adversarial.ts`), deploy.

5. **Post-incident**: Document the incident, root cause, and remediation within 48 hours. Update this runbook if gaps were found.

### Key rotation

```bash
# Rotate service role key:
# 1. Generate new key in Supabase → Settings → API
# 2. Update SUPABASE_SERVICE_ROLE_KEY in Vercel environment
# 3. Redeploy
# 4. Old key is automatically invalidated

# Rotate anon key:
# 1. Regenerate in Supabase → Settings → API
# 2. Update NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel
# 3. Redeploy
```

### Data deletion requests

When a user or organization requests data deletion:

1. **Individual user**: Use the self-service `/api/account/delete` endpoint. This removes the user's auth account and rep row. If they are the last member, the organization and all its data are also deleted.
2. **Organization**: An admin can use `/api/organization/delete`. This cascades to all org data (leads, messages, facts, proof, content, etc.) and removes all member auth accounts.
3. **Manual/backup**: After deletion, data may persist in Supabase automated backups until those rotate out (typically 7 days). For immediate purging from backups, restore to a temporary project, manually delete, and re-backup.

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | Yes (live models) | AI provider |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (supabase mode) | Database |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (supabase mode) | Auth |
| `EMBEDDING_API_KEY` | Yes (semantic search) | OpenAI embeddings |
| `SCOUT_DAILY_SEND_LIMIT` | No | Per-rep ceiling (default 15) |
