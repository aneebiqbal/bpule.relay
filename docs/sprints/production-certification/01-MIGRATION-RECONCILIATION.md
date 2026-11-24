# Migration reconciliation & provider parity

## Counts (reconciled)

| Item | Count |
|---|---|
| Files in `supabase/migrations` | **202** |
| Applied by `staging-bootstrap.mjs` | **198** |
| Skipped, with recorded reason | **4** (`0044`, `0079`, `0080`, `20261110080000`) — historical demo seeds bound to production-era reps/profiles; they insert rows only |
| Failures | **0** |

The previous report's "201" was accurate before the new `20261124000000_add_identity_assignments_updated_at.sql`; the set is now 202. The earlier "174/201" bootstrap ceiling is resolved.

## Provider parity correction

`staging-bootstrap.mjs` originally carried a **private, weaker** copy of the Supabase
compatibility shims. It now executes the repository's canonical
`supabase/aiven/bootstrap.sql` unmodified, which provides:

- roles `anon`, `authenticated`, `service_role`, `relay_app` (login, member of
  `authenticated`), `relay_service` (login, bypassrls), `neondb_owner`;
- `auth.uid()` deriving identity from `app.current_user_id`, then
  `request.jwt.claim.sub`, then `request.jwt.claims->>'sub'` — never from the browser;
- `storage.buckets`/`storage.objects` + `foldername()`;
- `extensions` schema with pgcrypto, and `vector`;
- default privileges for the runtime roles.

Two environment-specific adjustments remain, both local-only: an `avnadmin` role is
created so the canonical default-privilege statements run, and `relay_app`/`relay_service`
shapes are re-asserted because cluster roles survive a database drop. Runtime-table grants
are applied explicitly because on this cluster the migrations ran as the bootstrap user
rather than the hosted admin role.

## Migration repairs (all additive or syntax corrections)

See `../staging-recovery/01-MIGRATION-ORDER-FIXES.md` for the per-file table:
`0044` conflict targets; idempotent column additions in `20261005000000`,
`20261101160000`, `20261110050000`, `20261110110000`; the new
`identity_assignments.updated_at` migration.

No historical data is altered: the new column is backfilled from `created_at`.

## Repeatability

Bootstrap drops and recreates its own database each run, retries deferred migrations until no
progress, and exits non-zero if any unskipped migration fails. Two consecutive full cycles
(bootstrap → fixtures → E2E) both produced 19/19.
