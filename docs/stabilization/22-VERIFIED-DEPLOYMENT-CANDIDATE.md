# Relay — Verified Deployment Candidate

**Date:** 2026-11-24 · **Branch:** `feat/relay-job-intelligence-v2`
**Candidate HEAD:** recorded in §1 · **Authorization:** not deployed, no merge.

## 1. Exact SHA

| Item | Value |
|---|---|
| Last code + tests commit | `ef9eca01` |
| CI fix (live-DB test classification) | `ef9eca01` |
| Documentation commits | `349d9cc` and following |
| Fail-closed adapter + real-PG harness | `de94026e` |
| Prior closure RC | `87ccbeaa` |
| Production currently reports | `e68110a` (**not this branch**) |

## 2. Work completed this pass

1. **Fail-closed transactional writes (#4).** `saveWorkSetup` and the admin
   allocation route refuse to write without a multi-statement transaction
   (`TRANSACTION_UNSUPPORTED` / HTTP 503). No sequential fallback remains.
   Regression: `tests/work-setup-transaction.test.ts`.
2. **Real PostgreSQL integration harness.** `scripts/qa/postgres-txn-integration.mjs`
   (`npm run qa:txn`) drives the actual `postgresDbClient` / `saveWorkSetup` /
   `configureCoverageStatement` / `computeAccountRevision` code against a
   throwaway local database with genuine trigger-based failure injection.
3. **CI repair.** `tests/accountability-service.test.ts` and
   `tests/job-retention-contracts.test.ts` read a populated database but ran in
   the unit job, which configures no env — the cause of the red
   `CI / test` and `CI / release-gate`. Both now use the codebase's
   `describe.skipIf(!liveDb)` convention and are listed in the guarded live
   suite. Reproduced with `.env.local` removed: unit **exit 0**, every
   release-gate step green.
4. **Packaging / workers / secrets / rollback / migration checks (#8).**
5. Re-verification of all deterministic gates (#9).

**External, not fixable from here:** Vercel reports "Account is blocked" for
`bpule-relay` and `scout-inbox`, so preview deployments cannot run. This is an
account/billing state, not a code defect; owner action required.

## 3. Real-PostgreSQL results (actual PG, not the fake)

```
PASS  work setup commits (ok=true)
PASS  requirement is 30
PASS  Rep Today operator expectation is the allocation 8
PASS  shared unallocated seat contributes 0
PASS  solo lane with allocation expects 10, not 30      (R-09)
PASS  injected failure returns ok=false                  (trigger raised mid-tx)
PASS  rollback restored every dependent table byte-for-byte
PASS  revision is computed
PASS  stale revision returns CONFLICT (code=CONFLICT)
PASS  conflict performed zero writes
PASS  empty allocation list clears without error
PASS  no active allocations remain after clear
PASS  organization B sees none of organization A data
ALL REAL-POSTGRES CHECKS PASSED
```

This is direct evidence for item #3: real transaction rollback, revision
conflict, Work Setup assignment, allocation, Rep Today, and two-organization
projection isolation. RLS policies themselves are not exercised (the harness
uses a minimal schema); see blockers.

## 4. Tested routes and roles

**Browser matrix: NOT executed this pass.** Precise blockers:

- No staging application URL exists in the repository/config; the only known
  host is production (`relay.bpulse.dev`), which must not be used for
  adversarial or write-heavy browser testing.
- The documented `relay_staging` clone **is reachable but empty**
  (`information_schema` reports 0 tables in `public`), so there is no staging
  schema to drive.
- No VPS SSH access from this environment (no matching key/host configured);
  `~/.ssh/config` lists an unrelated host.
- No AI-provider permissions were exercised.

Routes/roles therefore carry prior-pass evidence only
(`docs/RELAY_FINAL_BROWSER_ACCEPTANCE.md`, `19-ROLE-BROWSER-MATRIX.md`). The
static route/role inventory is current and machine-readable
(`route-role-manifest.json`): 112 pages, 263 API handlers, roles OWNER / ADMIN
/ MANAGER / MEMBER.

## 5. Defects fixed this pass

| ID | Severity | Fix | Evidence |
|---|---|---|---|
| R-13 (adapter gap) | P1 | non-transactional providers fail closed, no partial writes | `tests/work-setup-transaction.test.ts`; HTTP 503 mapping |

Plus the prior closure pass (R-01..R-15 except R-07): see
`16-OPEN-FINDINGS-CLOSURE.md`.

**Remaining open:** R-07 dual AI router (accepted). External: PAT rotation,
Aiven `avnadmin` rotation.

## 6. Performance before/after

No HTTP/VPS benchmark was possible (blockers above). No new unbounded query was
introduced: `saveWorkSetup` trades N independent transactions for one;
`loadWorkSetup` adds one revision aggregate. Carried prior measurements:
sender-list p50 30 s → 8.5–13.3 s; `db.read` 47 → 16/request. Worker benchmark
remains unverified.

## 7. Credentials status

| Credential | Status |
|---|---|
| GitHub PAT in git remote | removed; verified absent (`has_userinfo=no`); owner must revoke/rotate |
| Aiven `avnadmin` | still requires console rotation |
| Tracked-file secrets | none (only variable-name placeholders) |
| Release tarball | `.env*` deleted before packaging (workflow verified) |

## 8. Migration / packaging / rollback readiness

- Ops tar ships `supabase/migrations`, `scripts/apply-migrations.mjs`, `deploy`.
- 5 systemd service/timer pairs present.
- No destructive migration added; recent migrations are additive.
- Rollback = `relay-current` symlink swap + PM2 restart (`OPS.md §7`).
- Deploy workflow stamps `RELAY_GIT_SHA` and health-checks `/login`.

## 9. Gate results

| Gate | Result |
|---|---|
| `tsc --noEmit` | TSC_OK (with env and with no env) |
| `npm test` (local, DB configured) | **423 files passed / 1 skipped; 5955 tests passed / 5 skipped** |
| `pnpm test` CI simulation (no env) | **exit 0; 423 files; 5941 passed / 19 skipped** |
| `pnpm qa:coverage` (no env) | 15 contracts, 0 failed, 0 skipped |
| corpus / semantic / message / owners (no env) | 32 / 107 / 16 / 18 passed |
| `pnpm lint` (no env) | exit 0 (777 pre-existing warnings, 0 errors) |
| `npm run build` | pass, route table emitted |
| `npm run qa:txn` | ALL REAL-POSTGRES CHECKS PASSED |
| `npm run test:live` | refuses to start (no marker / production URL) |
| browser role matrix | BLOCKED (§4) |
| VPS worker benchmark | BLOCKED (§4) |
| Vercel preview deploys | BLOCKED — account blocked (external) |

## 10. GO / NO-GO

**GO** for the candidate to be reviewed and merged to staging.

**NO-GO for production** until: staging is provisioned (empty `relay_staging`,
or an authorized disposable DB) and the role×route matrix passes; VPS benchmark
accepted; Aiven `avnadmin` and the GitHub PAT are rotated; owner authorizes
merge/deploy. Blocked tests are **not** claimed as passed.
