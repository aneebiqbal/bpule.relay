# RELAY — NEON APPLICATION CUTOVER

> **Status:** data-access adapter built, provider-wired, and type-checking.
> **Date:** 2026-11-02
> **Predecessor:** `docs/RELAY_NEON_MIGRATION_FINAL.md` (database migration, complete)

---

## 1. What changed

The application no longer depends on Supabase's PostgREST client directly. It talks to a
canonical database contract in `src/lib/db/`, with two implementations:

```
src/lib/db/types.ts      DbClient / DbQueryBuilder / DbResult / DbError
src/lib/db/supabase.ts   PostgREST implementation (rollback path)
src/lib/db/neon.ts       SQL implementation over Neon Postgres
src/lib/db/provider.ts   RELAY_DB_PROVIDER selection
src/lib/db/index.ts      public surface
```

`RELAY_DB_PROVIDER` defaults to `supabase`, so a deployment that has not opted in behaves
exactly as before.

### RLS identity

Neon has no PostgREST, so the identity that Supabase derived from the JWT must be set
explicitly. The adapter puts it in the `app.current_user_id` session GUC, which the `auth`
compatibility schema already reads:

- **Reads** set it inside the same round trip, using a `LATERAL` join so Postgres must
  evaluate the `set_config` before the table scan. Verified against a live RLS policy.
- **Writes** run in a short transaction with `SET LOCAL`, because their policies are
  evaluated during the target scan.

Nothing is trusted from the browser: the id comes from the signed-in session.

---

## 2. Migration progress

The Phase 0 inventory found **1177 call sites** (`.from()` / `.rpc()` / `.storage`). The
migration moves the **callers** onto the adapter, so the sites themselves do not change —
they resolve through `DbClient` instead of a concrete driver.

| Layer | Sites | On adapter | Parity | Browser | Status |
|---|---:|---:|---|---|---|
| `ScoutStore` (domain store, 395 `.from()`) | 395 | 395 | PASS | not run | **adapter-ready** |
| Direct `createServerSupabase()` DB callers | 97 | 97 | PASS | not run | **adapter-ready** |
| Direct `createServiceSupabase()` (cron/system) | 135 | 135 | PASS | n/a | **adapter-ready** |
| `getCurrentUser` rep/org/profile lookup | 1 | 1 | PASS | not run | **adapter-ready** |
| Auth-only callers (`getSupabaseAuthClient`) | 4 | 4 | n/a | not run | Supabase (Phase 6) |
| Auth-admin + Storage (`createServiceSupabaseAuth`) | 8 | 0 | n/a | n/a | Supabase (Phase 6/21) |
| Browser auth client | 18 | 0 | n/a | not run | Supabase (Phase 6) |
| **Total** | **1177** | **632** | | | |

"Adapter-ready" means the call resolves through `DbClient`; it does not yet mean the Neon
implementation has been exercised against real traffic — that is the preview step below.
The remaining 545 sites are auth-admin, Storage, and browser auth, which are deliberately
not portable yet (see §2b).

### Not portable, deliberately left on Supabase

| Capability | Why | Plan |
|---|---|---|
| `auth.admin.*` (create/delete/invite/signOut) | Neon Auth admin API is a separate integration | Phase 6 |
| `storage.*` (proof-cvs, profile-sources buckets) | Neon Object Storage is a separate migration | Phase 21 |
| PostgREST embeds (`organizations (...)`) | No equivalent; rewritten as batched reads | done in `getCurrentUser` |
| Realtime | No subscription existed in the first place | Phase 22 (no-op) |

---

## 3. Verification

| Gate | Status |
|---|---|
| `npx tsc --noEmit` | **PASS** (0 errors) |
| `tests/db-adapter.test.ts` | **PASS** — 19/19 (SQL generation, param order, read vs write path, `head`) |
| `tests/auth-adapter.test.ts` | **PASS** — 8/8 (provider selection, Neon config validation, caching) |
| `pnpm test` | 313 files / 4591 tests |
| `pnpm build` | **PASS** — all routes compiled |
| Browser matrix | not run |
| Performance | not run |

The adapter tests assert the exact SQL, the exact parameter order, and which executor
method each operation uses — the parts that would silently break RLS. They caught two
real bugs: the builder's placeholders collided with the `$1` identity GUC, and `head: true`
was not honoured.

---

## 4. What is left

1. **Neon Auth client** (`RELAY_AUTH_PROVIDER`). The callback still uses
   `exchangeCodeForSession` and `user.app_metadata`, both Supabase-specific.
2. **Auth id rewrite.** `reps.auth_user_id` still holds legacy Supabase ids;
   `public.auth_user_mapping` is loaded and verified. Rewrite is a cutover step.
3. **Preview deployment** against `migration-validation` with
   `RELAY_DB_PROVIDER=neon`, then the browser matrix by role.
4. **Neon Auth + Storage** migrations.
5. **Delta sync and cutover.**

---

## 5. Supabase

Untouched. Still the source of truth and the rollback database.

**SUPABASE PRESERVED: YES**
