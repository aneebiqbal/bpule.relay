# Relay — Production Runbook

One page per incident. Release baseline: `435a36a` (tag `release-v4.3-435a36a`).
Architecture is frozen — this document describes how to operate it, not change it.

---

## 1. Release identity

```bash
# What is deployed right now
curl -s https://bpule-relay.vercel.app/api/version
# sha / databaseProvider / authProvider must match the frozen baseline
```

| Check | Expected |
| --- | --- |
| `sha` | the release SHA |
| `databaseProvider` | `neon` |
| `authProvider` | `neon` |

If `sha` differs from the frozen baseline, the deployment moved. Stop and re-freeze.

---

## 2. Database role model

| Role | Used by | RLS |
| --- | --- | --- |
| `relay_app` | Every browser request | **enforced**, member of `authenticated`, `rolbypassrls = false` |
| `neondb_owner` (`SERVICE_DATABASE_URL`) | Trusted service paths only — cron jobs, admin service reads, the action ledger's privileged writes | bypasses RLS |
| `service_role` | Supabase-side system actions | bypasses RLS |

**Boundary rule:** a request that carries a signed-in rep must never resolve the service pool.
If `pg_stat_activity` shows a new `neondb_owner` backend caused by normal page traffic, that is **P0**.

Verify from fresh traffic:

```bash
RELAY_CUTOVER_SHA=<sha> \
RELAY_CUTOVER_COOKIE="<session cookie>" \
RELAY_CUTOVER_DB_URL="<owner url>" \
RELAY_CUTOVER_APP_URL="<relay_app url>" \
RELAY_CUTOVER_AUTH_USER_ID=<rep auth user id> \
RELAY_CUTOVER_ORG_ID=<org id> \
node scripts/qa/verify-production-rls-cutover.mjs
```

Expected: `relay_app rolbypassrls=false`, `page traffic opened no owner backend`,
`relay_app with no identity sees 0 leads`, org-scoped row counts.

---

## 3. Smoke commands

```bash
BASE=https://bpule-relay.vercel.app
COOKIE=$(curl -s -i -X POST $BASE/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"<rep>","password":"<password>"}' \
  | grep -i '^set-cookie:' | sed -E 's/^set-cookie: ([^;]+);.*/\1/' | tr '\n' ';' | sed 's/;$//')

for r in /dashboard /chats /tasks /leads /prospect /upwork; do
  printf '%-12s ' "$r"; curl -s -o /dev/null -w '%{http_code}\n' -H "Cookie: $COOKIE" "$BASE$r"
done
```

All `200`. Retired Team URLs return `308` to their replacements
(`/team/coverage → /team`, `/team/activity → /reports/activity`,
`/team/workload → /team/people`, `/team/targets → /team/performance?view=targets`) — intentional.

Admin smoke: `/admin/command`, `/team`, `/team/profiles`, `/admin/targets`, `/tasks`, `/chats`.

Read-only integrity audit:

```bash
SERVICE_URL='<owner url>' node scripts/qa/production-integrity-audit.mjs
```

---

## 4. Release health dashboard

`/admin/health` (linked from Admin → System) surfaces existing telemetry only:

model traffic and failure ratio (24h), Inbox sends today, tasks created/completed today,
coverage activations today, assignments today, daily active reps, lead book, action ledger.

The same numbers are available without the UI:

```bash
curl -s -H "Cookie: $COOKIE" $BASE/api/admin/health
curl -s -H "Cookie: $COOKIE" $BASE/api/admin/integrity/action-ledger
```

`healthy: false` means a table is missing or the AI failure ratio exceeds 10%.
Zero model traffic is **healthy**, not broken.

---

## 5. Common failure modes

| Symptom | Likely cause | First move |
| --- | --- | --- |
| `/api/version` reports `databaseProvider=supabase` | env not applied | check Vercel production env; redeploy |
| Rep sees 0 leads / empty inbox | `DATABASE_URL` points at the owner, or RLS GUC lost | run the cutover verifier |
| `permission denied` in responses | policy role regression | compare `pg_policies` to the migrations |
| `NextApiError` / 500 on a page | check `/api/admin/health` for missing tables | re-run migrations |
| Owner backend appears from page traffic | service client leaking into a request path | **P0** — trace the call site |
| Task create returns 403 | rep is not a manager/admin | expected; use an admin account |
| PATCH `/api/tasks/assigned:<uuid>` returns 404 | composite id not stripped | pass the raw UUID |

---

## 6. Rollback

1. Vercel → Deployments → the previous deployment → Promote (no rebuild needed).
2. If the database role changed, set `DATABASE_URL` back to the owner URL and redeploy.
   Database migrations are additive; they do not need reverting.
3. Re-run the smoke commands and the cutover verifier.

---

## 7. Triage rules

Only **P0** and **P1** interrupt the release freeze.

| Level | Definition | Examples | Action |
| --- | --- | --- | --- |
| **P0** | Security, data corruption, or the app is unavailable | owner connection from page traffic; cross-org data visible; RLS bypassed; 500 on login or `/dashboard`; data loss | Page immediately; fix forward; re-run the verifier |
| **P1** | A core workflow is broken for real users | cannot send a reply; task cannot be created or completed; coverage cannot be activated; profile assignment fails; Inbox counts disagree with the destination rows | Same-day fix; no architecture change |
| **P2** | Degraded workflow or observability gap | missing runtime-log access; a dashboard is stale; elevated AI latency without failures; health flag false-negative | Schedule; does not interrupt the freeze |
| **P3** | Polish | copy, spacing, empty-state wording | Backlog |

Escalation: post the failing request, the role, the org, and the SHA. Do not speculate about
root cause in the incident channel — reproduce first.

---

## 8. Stabilization watch

During a 24–72h watch, sample at least once per day:

```bash
# Role separation
#   expect: page traffic → relay_app, trusted jobs → owner, no owner from page traffic
node scripts/qa/verify-production-rls-cutover.mjs

# Data integrity (read-only)
SERVICE_URL='<owner url>' node scripts/qa/production-integrity-audit.mjs
```

Record real failures per surface: Inbox, Tasks, Profiles, Team Today, Targets, Coverage,
Upwork, LinkedIn/Prospect, Admin Command Center. Synthetic traffic does not count as evidence.

---

## 9. Keeping the architecture frozen

- No new counting authority. Inbox counts, task counts, progress and profile execution all
  read the canonical contracts.
- No new observability stack. `/api/admin/health`, `/api/admin/observability` and the
  PostHog event taxonomy already cover the signals.
- P0/P1 fixes only, and they must not move data between authorities.
