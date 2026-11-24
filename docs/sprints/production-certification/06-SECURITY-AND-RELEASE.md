# Security, CI & release certification

## Environment separation

- All verification ran against a disposable local PostgreSQL 18 database
  (`relay_staging_local` on `127.0.0.1:5433`). Production was never contacted.
- `scripts/qa/staging-bootstrap.mjs`, `staging-fixtures.mjs`, `rls-adversarial-staging.mjs`
  and `staging-e2e.mjs` refuse any target matching `aivencloud`/`relay_prod`.
- `.env.staging` is gitignored and untracked (verified with `git ls-files`).
- No production secrets were printed, copied or committed.

## Least privilege

- The RLS harness connects as `relay_app`, a non-superuser member of `authenticated`; table
  grants are explicit and the service role (`bypassrls`) is used only for trusted server paths.
- Authorization functions are SECURITY DEFINER with a pinned `search_path`.

## External security gates — NOT cleared

| Gate | Status |
|---|---|
| Aiven administrator credential rotation | **owner console action** — unconfirmed |
| Exposed GitHub PAT revocation | **owner action** — unconfirmed |
| Vercel billing block | external account issue; not required by the VPS release path |

These are reported as open, not claimed as resolved.

## CI / packaging

| Item | Status |
|---|---|
| TypeScript | clean |
| ESLint | 0 errors (777 pre-existing warnings) |
| Unit + integration suite (no env) | **5970 passed / 19 skipped**, exit 0 |
| Production build | pass |
| Migration bootstrap | 198 applied / 0 failed / 4 documented skips |
| Authenticated E2E | 19/19 |
| Route × role matrix | 164/164 |
| RLS adversarial | 31/31 |
| CI run on the exact SHA | **not re-run in this session** — requires the PR update |

## Reproducibility checklist

```
node scripts/qa/staging-bootstrap.mjs     # schema, 0 failures
node scripts/qa/staging-fixtures.mjs      # two orgs, real auth accounts
node scripts/qa/rls-adversarial-staging.mjs   # needs npx tsx
node scripts/qa/staging-e2e.mjs http://localhost:3000
node scripts/qa/staging-route-matrix.mjs http://localhost:3000
```

Rollback: no data migration ships in this candidate set except an additive backfilled column, so
reverting the code commits restores prior behaviour; no data rollback is required.

## Verdict

**GO for integration.** **NO-GO for production activation** pending owner-authorized deploy to
the real staging/VPS environment, the external credential rotations above, and CI re-run on the
final SHA.
