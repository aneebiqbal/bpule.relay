# Neon → Aiven production cutover runbook

All parity gates have passed on the restored Aiven database `relay_prod`.
This runbook covers the production switch. **Do not run it until the freeze
window is scheduled.**

## Pre-cutover checklist

- [ ] Row parity PASS (Neon vs `relay_prod`)
- [ ] RLS matrix PASS as `relay_app`
- [ ] Live page smoke PASS (all pages 200 with real data)
- [ ] Backup/restore test PASS
- [ ] Rollback env values captured (below)

## 1. Capture the rollback values

```bash
# In the Vercel project → Settings → Environment Variables, record:
#   RELAY_DB_PROVIDER, DATABASE_URL, SERVICE_DATABASE_URL
# Also record them from the Neon console (they are the current production values).
```

## 2. Freeze writes

Relay has no maintenance mode. Choose one:

- **Preferred:** a short scheduled window where reps are told not to send.
- **Alternative:** block writes at the edge (Vercel WAF / auth) for the window.

Minimum write-free period: the time to take the final dump + restore + verify
(measured: dump 94s, restore 497s, verify ~60s → **~12 minutes**).

## 3. Final dump + restore

```bash
# 1. Create a fresh target (the certification DB is not reused).
#    Aiven console → relay_prod_final (or reuse relay_prod after a reset)

# 2. Dump Neon (requires pg_dump >= the Neon server version).
NEON_DATABASE_URL=<neon-service-url> \
AIVEN_ADMIN_URL=<aiven-admin-url> \
AIVEN_TARGET_DB=relay_prod_final \
RELAY_APP_PASSWORD=<app-pw> RELAY_SERVICE_PASSWORD=<service-pw> \
  bash supabase/aiven/migrate.sh

# 3. Verify parity against Neon.
node supabase/aiven/verify-parity.mjs "$NEON_DATABASE_URL" \
  "postgres://avnadmin:<pw>@<aiven-host>:22864/relay_prod_final"
```

## 4. Switch the Vercel environment

In the Vercel project → Settings → Environment Variables (Production):

```text
RELAY_DB_PROVIDER=postgres
DATABASE_URL=postgres://relay_app:<app-pw>@<aiven-host>:22864/relay_prod_final
SERVICE_DATABASE_URL=postgres://relay_service:<service-pw>@<aiven-host>:22864/relay_prod_final
DATABASE_POOL_MAX=3
SERVICE_DATABASE_POOL_MAX=1
```

Do **not** expose the `avnadmin` URL.

Redeploy the exact frozen SHA.

## 5. Prove the cutover

```bash
# Version endpoint shows the provider.
curl -s https://<production>/api/version

# Aiven should show relay_app for page traffic, relay_service for cron.
# avnadmin must never appear for application traffic.
```

Production smoke: Rep Home, Admin Home, Inbox, Tasks, Leads, Profiles,
Targets, Prospect, Upwork, Fresh Prospects, Provider Health.

## 6. Re-enable writes

Only after row parity, RLS, role proof, smoke and one safe write proof pass.

## 7. Rollback

If Aiven fails **before** writes diverged:

```text
restore RELAY_DB_PROVIDER / DATABASE_URL / SERVICE_DATABASE_URL to the captured
Neon values, redeploy the previous SHA.
```

If writes occurred on Aiven, do **not** blindly switch back — reconcile the
divergence first (Aiven is now the source of truth).

## 8. Neon retirement

Keep Neon read-only for a rollback window (≥ 1 week). Then export a final
archival dump, store it securely, and cancel/downgrade the Neon plan.

## 9. Supabase

Do **not** delete Supabase during the DB cutover. Auth (Neon Auth) and object
storage are separate concerns; audit them in a separate cleanup sprint.
