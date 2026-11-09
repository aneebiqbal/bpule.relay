# Relay V4 — Owner Cutover Checklist

The engineering work is complete. This is the **operator procedure** for the
Vercel owner: point the deployment at the least-privilege `relay_app` role and
prove fresh page traffic is covered by RLS.

Do not print secrets in reports or tickets. Connection strings are read from the
Neon console; the values below say **where** to get them, not what the password
is.

---

## 0. Freeze (already done)

```
FINAL_CODE_SHA   = <HEAD at freeze>
TREE             = clean
LOCAL == REMOTE  = yes
```

No code changes after this point unless a P0/P1 appears.

---

## 1. Required production variables

Project: `bpule-relay` → Settings → Environment Variables → **Production**

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | **replace** with the `relay_app` pooler URL |
| `SERVICE_DATABASE_URL` | keep the existing owner/service URL |
| `RELAY_DB_PROVIDER` | `neon` |
| `RELAY_AUTH_PROVIDER` | `neon` |

The `relay_app` URL is the pooler connection string for role `relay_app`:

```
Neon console → lingering-cell-60275711 → neondb → Connect → role: relay_app
```

It has the form `postgresql://relay_app:<password>@ep-red-paper-…-pooler…/neondb?sslmode=require`.

`relay_app` is a member of `authenticated`, has `rolbypassrls = false`, and
holds full grants on the application tables. The owner URL keeps `BYPASSRLS`
and is used **only** by trusted service paths.

Verify before saving:

```bash
# role attributes — relay_app must NOT bypass RLS
select rolname, rolbypassrls from pg_roles where rolname in ('relay_app','neondb_owner');
```

---

## 2. Owner procedure

```text
Vercel → bpule-relay → Settings → Environment Variables → Production
  1. DATABASE_URL          → Edit → paste the relay_app pooler URL → Save
  2. SERVICE_DATABASE_URL  → confirm it still holds the owner URL
  3. RELAY_DB_PROVIDER     → confirm "neon"
  4. RELAY_AUTH_PROVIDER   → confirm "neon"
  5. Redeploy the exact frozen SHA (Deployments → ⋯ → Redeploy)
```

A redeploy is required: the env change alone does not rebuild the Lambda env.

---

## 3. Post-cutover verification

Run the canonical script from a machine with the owner URL:

```bash
RELAY_CUTOVER_SHA=<FINAL_CODE_SHA> \
RELAY_CUTOVER_COOKIE="<session cookie of a real rep>" \
RELAY_CUTOVER_DB_URL="<owner URL>" \
RELAY_CUTOVER_APP_URL="<relay_app URL>" \
RELAY_CUTOVER_AUTH_USER_ID=<that rep's auth user id> \
RELAY_CUTOVER_ORG_ID=<that rep's organisation id> \
node scripts/qa/verify-production-rls-cutover.mjs
```

Release gate — every line must pass:

```text
GET /api/version → 200
deployed SHA matches <FINAL_CODE_SHA>
databaseProvider=neon
authProvider=neon
GET /dashboard → 200
relay_app rolbypassrls=false
relay_app holds live application connections
page traffic opened no owner backend
relay_app with no identity sees 0 leads
relay_app scoped to the rep sees exactly its org
```

The script is read-only: it issues one authenticated `/dashboard` request and
runs `SELECT`s against `pg_stat_activity`, `pg_roles` and `leads`.

---

## 4. Service-role check

Trusted paths must still work with `SERVICE_DATABASE_URL`. Check a safe,
read-only service path (for example an admin readout) and confirm it returns
data. Normal user requests must never select the service pool.

---

## 5. Production log review

After the redeploy, inspect the runtime logs for:

```text
permission denied
row-level security
unexpected 401 / 403
500
Neon errors
uncaught exceptions
raw SQL errors
hydration errors
```

Required: **0 unexplained P0/P1 errors**.

---

## 6. Final production smoke

Only after the RLS proof passes:

```text
Rep Home   Admin Home   Inbox   Tasks   Profiles   Coverage   Upwork   Prospect
```

Confirm real data still appears under enforced RLS. No destructive test data.

---

## 7. Rollback

If anything fails, set `DATABASE_URL` back to the owner URL and redeploy the
same SHA. The database role changes are additive and do not need reverting.
