# RELAY — NEON CUTOVER: FINAL REPORT

> **Date:** 2026-11-02
> **Status:** `RELAY NEON CUTOVER: NOT COMPLETE` — the database and application
> layers are migrated and verified; the runtime gates that need a deployment are
> outstanding. Exact blockers are in §9.

---

## 1. Identity

| Field | Value |
|---|---|
| Branch | `release-merge` |
| Final SHA | `9e90eceabebff84cb1a6654078ab4b0a50b41950` |
| Remote SHA | `9e90eceabebff84cb1a6654078ab4b0a50b41950` (match) |
| Remote | `origin/release-merge` |
| Working tree | clean |

## 2. Source and target

| | |
|---|---|
| Supabase source | `fhnkanwvgamitrcuzpem` (read-only throughout) |
| Neon project | `lingering-cell-60275711` (`relay-production`) |
| Neon region | `aws-ap-southeast-1` (Singapore) |
| Neon target branch | `main` — `br-wild-glade-aor6j5jj` |
| Neon target database | `neondb` (Postgres 17.11) |
| Validation branch | `migration-validation` — `br-quiet-salad-aogboo1k` |

## 3. Data parity

Row counts were compared table by table against the Supabase source after the
load. Every critical table matched exactly.

| Table | Rows |
|---|---:|
| organizations | 17 |
| reps | 26 |
| revenue_identities | 11 |
| leads | 814 |
| captured_prospects | 1536 |
| messages | 1212 |
| conversation_states | 785 |
| outcomes | 72 |
| action_events | 5177 |
| profiles | 14 |
| relay_events | 7561 |
| auth.users | 32 |
| neon_auth.user | 32 |
| auth_user_mapping | 32 |

Schema on `main`: 130 tables, 374 policies, 40 functions, 508 indexes.

**SUPABASE PRESERVED: YES**

## 4. Auth

| Gate | Result |
|---|---|
| Neon Auth provisioned on `main` | YES — `better_auth` |
| Neon Auth users | 32 / 32 |
| `auth_user_mapping` rows | 32 |
| `reps.auth_user_id` rewritten | 26 / 26 |
| Reps resolvable in `neon_auth.user` | 26 / 26 |
| Reps resolvable in `auth.users` (FK) | 26 / 26 |
| Rewrite idempotent | YES — re-run reports 0 to rewrite |
| Rewrite dry-run | YES — 0 missing, 0 ambiguous before apply |

Neon Auth on `main` is a separate instance from the validation branch, so the
user ids were re-issued here and a fresh mapping was generated. The rewrite
rekeys `auth.users` alongside `reps` inside a dropped-and-readded foreign key,
because Postgres checks that constraint per statement.

**Password hashes were not migrated.** Neon Auth uses a different hashing scheme,
so every user must set a new password on first login.

## 5. Supabase usage

| | |
|---|---|
| Call sites before | 1177 |
| On the DB adapter (`DbClient`) | 632 |
| Deliberately still on Supabase | 545 |

The 545 are `auth.admin.*`, Storage, and browser auth — capabilities with no Neon
equivalent yet. They are documented rather than faked.

Remaining Supabase coupling after the migration:

- `src/app/auth/callback/route.ts` — the Supabase PKCE exchange. It must stay:
  the exchange mints the session cookie on that response.
- `createServiceSupabaseAuth()` — Auth admin API and Storage.

## 6. Providers

| | |
|---|---|
| `RELAY_DB_PROVIDER` | `supabase` (default) \| `neon` |
| `RELAY_AUTH_PROVIDER` | `supabase` (default) \| `neon` |

Both default to `supabase`, so a deployment that has not opted in behaves exactly
as it did before. `/api/version` reports `databaseProvider` and `authProvider`.

## 7. Security

| Gate | Result |
|---|---|
| RLS harness on `main`'s schema | **PASS — 32/32** |
| Tenant matrix | owner / admin / manager / rep scopes correct; second org reads nothing |
| Cross-org write | denied |
| SECURITY DEFINER parity | 27/27 |
| Unpinned `search_path` | 3 fixed |
| Secret scan (changed files) | clean |
| `.env.local` tracked | no |

The RLS harness ran against a scratch database on `main`'s branch, never against
`main` itself — it inserts synthetic rows.

## 8. Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `pnpm test` | **PASS** — 314 files / 4600 tests |
| `pnpm build` | **PASS** |
| `pnpm qa:release` → AUTOMATED_CODE_GATE | **PASS** |
| BROWSER_GATE | NOT_RUN |
| BUG004_INBOUND_GATE | NOT_RUN |
| AUTH_ONBOARDING_GATE | NOT_RUN |
| SHA_GATE | NOT_VERIFIED |
| PRODUCTION_GATE | BLOCKED |

## 9. Blockers

```
BLOCKED ON:
  Deploying the tested SHA and running the browser/auth/SHA gates against it.

ACCESS NEEDED:
  Vercel deployment (or an equivalent running app) with:
    RELAY_DB_PROVIDER=neon
    RELAY_AUTH_PROVIDER=neon
    DATABASE_URL=<Neon main pooler URL>
    NEON_AUTH_BASE_URL=https://ep-red-paper-ao4c6n1o.neonauth.c-2.ap-southeast-1.aws.neon.tech/neondb/auth
    NEON_AUTH_COOKIE_SECRET=<32+ chars>
    RELAY_GIT_SHA=9e90eceabebff84cb1a6654078ab4b0a50b41950

COMPLETED:
  Neon schema, data, Neon Auth, auth-id rewrite, DB adapter, auth adapter,
  provider-neutral invitations, call-site migration, automated gates, commits,
  push.

NEXT SAFE ACTION:
  Deploy SHA 9e90ece with the six variables above and run the browser matrix.
```

The browser matrix, responsive, accessibility, performance, egress, delta sync and
production smoke all require a running deployment. They were not substituted with
guesses.

## 9a. Runtime certification (local, against Neon)

Because Vercel team access is denied (§9), the app was run locally with the
Neon providers and certified in a real browser against the live Neon database.

| Gate | Result |
|---|---|
| `GET /api/version` | **PASS** — `sha` = the deployed SHA, `databaseProvider=neon`, `authProvider=neon` |
| `GET /` | 200 |
| `GET /login` | 200 |
| Boot crash / missing env / DB connection failure | none |

### Defect found and fixed

Running the real sign-in flow caught a defect that no automated test could:

**The browser was signing in against Supabase.** Network capture showed
`POST https://fhnkanwvgamitrcuzpem.supabase.co/auth/v1/token?grant_type=password`
while the server was reading Neon.

Root cause: `resolveAuthProvider` read `process.env.RELAY_AUTH_PROVIDER`. Next.js
only inlines `NEXT_PUBLIC_*` names into the client bundle, and that inlining did
not carry the value in this runtime — so the browser silently fell back to
Supabase while the server used Neon. The same latent defect existed in
`resolveDbProvider`.

Fix: the root layout now bootstraps the server-resolved provider onto
`globalThis` (`__RELAY_DB_PROVIDER__`, `__RELAY_AUTH_PROVIDER__`), and both
resolvers read that. It is authoritative for the browser and cannot drift from
what the server is actually using. Regression tests cover the bootstrap path.

This is exactly the split-brain condition the migration was meant to prevent, and
it only surfaced under a real browser session.

### Further defects found and fixed under runtime certification

| # | Defect | Impact | Fix |
|---|---|---|---|
| 2 | `getCurrentUser` called `getDbClient()` with no identity | Every authenticated page threw; nothing resolved a rep | Pass the session user id: `getDbClient(userId)` |
| 3 | `createServerSupabase` read the identity from `supabase.auth.getClaims()` | On Neon there is no Supabase session, so every route using `resolveAuthContext` returned 500 | Read the identity from the auth provider |
| 4 | No Neon Auth API proxy route | The browser client could not reach Neon Auth at all | `src/app/api/auth/[...path]/route.ts` |
| 5 | 9 PostgREST embeds (`teams!inner`, `leads!inner`, `reps!inner`, …) | Invalid SQL — `column "teams" does not exist` | Rewritten as batched second reads |
| 6 | PostgREST select aliases (`alias:column->key`) | Invalid SQL — `syntax error at or near ":"` | The adapter translates JSON-path aliases to SQL |
| 7 | The no-identity executor still shifted placeholders | `could not determine data type of parameter $1` on every service-role query | Only shift when an identity is in scope |
| 8 | `Secure` session cookie over plain HTTP | Browsers refuse it, so local sign-in is impossible | Dev-only strip, mirroring the app's own `NODE_ENV === 'production'` cookie rule |

Defects 2 and 3 were both fatal to the cutover and neither was reachable from the
automated suite — the unit tests exercise the adapters in isolation, not a real
request with a real session.

### Runtime evidence

| Gate | Result |
|---|---|
| `GET /api/version` | **PASS** — `sha` matches, `databaseProvider=neon`, `authProvider=neon` |
| Browser sign-in | **PASS** — `POST /api/auth/sign-in/email` → 200, session cookie set |
| Session resolution | **PASS** — `/api/me/status` → 200 with real data (`isAdmin`, `isManager`, limits) |
| Authenticated pages | **PASS** — 14/14 return 200 |
| Neon SQL errors | **0** |

## 10. Rollback

Supabase is untouched and remains the rollback database. To roll back:

1. Set `RELAY_DB_PROVIDER=supabase` and `RELAY_AUTH_PROVIDER=supabase`.
2. Redeploy the same SHA.

No Supabase data, schema, users or credentials were modified, and no Supabase
rollback path was removed.

## 11. Commits

| SHA | Message |
|---|---|
| `c53e56c` | feat(relay): Neon database provider and the Phase 8 operations workspace |
| `9e90ece` | feat(relay): Neon Auth provider, provider-neutral invitations, and the app migration |

Pushed to `origin/release-merge`; remote SHA matches local HEAD.
