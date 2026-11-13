# Retire Neon + Supabase — auth & storage migration

Both remaining dependencies now run on Aiven. This is the exact production switch.

## What changed

| Dependency | Before | After |
|---|---|---|
| Database | Neon | Aiven `relay_prod_final` |
| Auth | Neon Auth (Better Auth hosted on Neon) | Better Auth in-app, `neon_auth` schema on Aiven |
| Object storage | Supabase Storage | Aiven Postgres `public.storage_objects` |

## 1. Auth: `RELAY_AUTH_PROVIDER=aiven`

Better Auth runs in the Next.js app against Aiven. Users, accounts and sessions
were already migrated, so **nobody needs to re-register** — and because the
cookie prefix (`neon-auth`) and uuid id scheme match Neon Auth's, existing
sessions keep working on HTTPS.

Verified locally against Aiven:

```
sign-in / sign-up / sign-out      200
get-session (Better Auth)         200 with the real user
/api/me/status                    200 with the real rep workspace
admin createUser (invitation)     200, user row written to neon_auth.user
dashboard / leads / team          200 with real data
```

## 2. Storage: `public.storage_objects`

`createPostgresStorage` backs the StorageClient interface; the 12 `proof-cvs`
objects (499 KB) were migrated from Supabase.

## 3. Production switch

In Vercel → Production env, **add/change**:

```text
RELAY_AUTH_PROVIDER=aiven
NEXT_PUBLIC_RELAY_AUTH_PROVIDER=aiven
```

Everything else stays (DB provider, URLs, pools). Redeploy.

Rollback: set both back to `neon` and redeploy — Neon Auth answers again.

## 4. Verify on production

```bash
curl -s https://relay.bpulse.dev/api/version
# → {"databaseProvider":"postgres","authProvider":"aiven", ...}
```

Then sign in, load `/dashboard`, `/profile-intelligence`, and upload a CV.

## 5. Then delete Neon

Only after the above is verified for a few days:

1. Confirm `/api/version` shows `authProvider: "aiven"`.
2. Confirm no `NEON_AUTH_*` dependency remains.
3. Cancel/delete the Neon project.

## 6. Supabase

After the switch, Supabase has **no** remaining dependency (auth moved, DB
moved, storage moved). It can be deleted in a separate cleanup.
