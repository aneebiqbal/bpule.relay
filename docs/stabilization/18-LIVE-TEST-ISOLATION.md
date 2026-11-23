# Relay — Live Test Isolation (R-03)

## 1. Problem

`.env.local` pointed `DATABASE_URL` / `SERVICE_DATABASE_URL` at the production
Aiven database (`relay_prod_final`). `vitest.live.config.mts` loaded `.env.local`
and its suites perform writes (`tests/operator-visibility.live.test.ts` 26 write
calls, `tests/v6-live-coverage-acceptance.test.ts` 15). Running `npm run test:live`
mutated production.

## 2. Guard

`src/lib/db/test-isolation.ts`:

- inspects **every** variable that can carry a URL (`DATABASE_URL`,
  `SERVICE_DATABASE_URL`, `TEST_DATABASE_URL`, `RELAY_TEST_DATABASE_URL`), so a
  swapped service URL cannot smuggle production in;
- rejects any database **name** matching production (`prod`, `production`). The
  Aiven staging clone shares a host with production, so name-based rejection is
  authoritative; an optional `RELAY_PRODUCTION_SERVICE_FINGERPRINT` adds host
  rejection where a deployment has distinct hosts;
- requires an explicit opt-in marker (`RELAY_TEST_DATABASE=1`) and fails closed
  when it is missing or when no URL is configured;
- never prints credentials.

Production is rejected even if another variable claims it is staging — only the
actual URL is inspected.

## 3. Enforcement points

| Point | File |
|---|---|
| Live config load (before collection) | `vitest.live.config.mts` |
| Smoke config load | `vitest.smoke.config.mts` |
| Runtime global setup | `tests/live-global-setup.ts` |
| Safe runner CLI | `scripts/qa/run-live-tests.mjs` (now `npm run test:live`) |
| QA/maintenance scripts | `scripts/qa/assert-safe-target.mjs` wired into `save-smoke.mjs`; `assertNoProductionDatabase()` in `rls-and-forged-identity-cert.mjs` |

`.env.test` is loaded **before** `.env.local` and is the documented place for the
disposable database (see `.env.test.example`).

## 4. Verified behavior (13 tests + CLI probes)

| Case | Result |
|---|---|
| production `DATABASE_URL` | rejected |
| swapped production `SERVICE_DATABASE_URL` | rejected |
| two production-like URLs via different variables | rejected |
| production + marker set (claims staging) | rejected |
| staging without marker | rejected (fail closed) |
| marker but no URL | rejected |
| staging + marker | accepted |
| fingerprint host | rejected when configured |
| credentials in messages | never leaked |

CLI probes run this pass:

```
node scripts/qa/run-live-tests.mjs            → exit 1, "requires an explicit disposable-database marker"
RELAY_TEST_DATABASE=1 node scripts/qa/run-live-tests.mjs
                                              → exit 1, both URLs named as production
npx vitest run --config vitest.live.config.mts → startup error before collection
```

## 5. Safe command

```bash
cp .env.test.example .env.test   # point at relay_staging (or a local throwaway)
RELAY_TEST_DATABASE=1 npm run test:live
```

Never put `relay_prod*` in a test URL. Unrelated staging records are preserved:
the suites use isolated fixtures keyed to their own organization/profile ids.

## 6. Residual

Other ad-hoc maintenance scripts that connect through app code should call
`assertSafeScriptTarget()` / `assertNoProductionDatabase()` before writing; the
high-risk record creators were wired this pass. The full list is auditable via
`grep -rl 'DATABASE_URL' scripts`.
