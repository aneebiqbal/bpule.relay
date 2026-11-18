# Relay — Final Release Gate

Branch `feat/relay-completion-program` · PR #51 · HEAD `250cce25` · not deployed.

---

## 1. Performance (P0) — fixed and measured

**Root cause.** React's `cache()` only memoizes inside a React render pass; route
handlers are outside it, so the wrapper silently stopped deduplicating. One
`/api/profiles?assigned=1&channel=linkedin` request ran `getCurrentUser()` seven
times (14 DB reads) and `getSession()` fourteen times.

The network was never the problem: ICMP RTT to Aiven is **215 ms**, but one pool
operation costs **~870 ms** because it is three round trips
(`BEGIN; set_config` → query → `COMMIT`). Read **count** was the cost.

**Fix.** `src/lib/request-scope.ts` — an explicit request scope
(`requestMemo`), with the `AsyncLocalStorage` backend isolated in
`request-scope.node.ts` so client chunks still build. Applied to
`getCurrentUser`, `getAuthContext`, Better Auth `getSession` and
`listExecutableIdentitiesForRep`.

| Measurement | Before | After |
|---|---|---|
| Sender list (p50, 3 runs) | ~30 s (27–61 s range) | **13.3 / 8.5 / 8.6 s** |
| Cached analyze | 17.1 s | **7.0 s** |
| `db.read` per request | 47 | **16** |
| `auth.session.read` per request | 14 | **1** |
| `getCurrentUser` resolutions | 7 | **1** |

Memo behaviour verified per key: one load, three hits.

**RLS unchanged** — the identity is still `SET LOCAL` per operation.

**Remaining:** 16 reads and the 3-round-trip floor (~870 ms) are untouched.
Removing the floor means inlining parameters into one multi-statement query,
which is SQL-injection-sensitive; it needs its own security review, not a perf
tweak.

Full detail: `docs/RELAY_PERFORMANCE_2026-11.md`.

---

## 2. Browser acceptance

| Journey | Status |
|---|---|
| Admin Control Center renders (Profiles / Team / Issues & Data / Data, summary, person cards) | **completed** |
| Analyzer: selected profile drives sender, proof and note | **completed** — "Prospecting as Aneeb, LinkedIn", ranking computed with Aneeb as current sender |
| Analyzer deep link (`?paste=`) end-to-end | **completed** |
| BUG-39 cache reuse (authenticated, twice) | **completed** — 2nd call `reused: true` |
| BUG-38/39/40/41/42 API + DB probes | **completed** |
| Playwright matrix (`rc-browser-acceptance.spec.ts`) | **not completed** — reached case 5/8, then each AI-backed case exceeded the 260 s per-test timeout. Reached case 5 after the perf fix but the suite still cannot fit the budget on this host. |
| Admin / manager / operator / unauthorized role journeys | **not run** |
| Two simultaneous operator sessions | **not run** |
| Screenshots | not captured — the harness cannot hold a desktop window visible for `browser.screenshot` |

Browser reachability was diagnosed rather than assumed: `localhost` is proxied
to a 502, while `127.0.0.1:3000` and `https://relay.bpulse.dev` both work.

---

## 3. Deployment correctness

- `.github/workflows/deploy.yml` builds the standalone output, verifies
  `.next/standalone/server.js`, strips every `.env*` from the tarball, uploads to
  `/home/deploy/apps/relay-releases/<SHA>`, atomically repoints `relay-current`,
  restarts PM2 and health-checks `/login`.
- **Deployed SHA was unidentifiable** (`/api/version.sha = null`). The workflow
  now stamps `RELAY_GIT_SHA` and `BUILD_TIME`, and PM2 starts with
  `RELAY_GIT_SHA=<sha>`, so the next deployment can be tied to a commit.
- **Rollback** is a `relay-current` symlink swap to an immutable release
  directory plus a PM2 restart; procedure documented in `OPS.md` §7.
- `OPS.md` no longer describes Vercel or Supabase.

Not deployed, so the SHA stamping and the rollback swap are **unverified in
production**.

---

## 4. Production security evidence

| Control | Evidence |
|---|---|
| Tenant isolation | RLS with `app.current_user_id` set transaction-locally; one client per operation, released with `ROLLBACK` |
| Service boundary | `service-allowlist.ts` enumerates every permitted path with a justification; `NORMAL_REQUEST_SERVICE_CALLS_ZERO` gate |
| Restricted app role | `DATABASE_URL` → `relay_app`; service role only for allowlisted server paths |
| Secrets | only in the VPS `.env.production` and GitHub secrets; release tarball strips `.env*` |
| This PR's security delta | RPC named binding, analyzer identity rejection, org+identity cache key, deployed-SHA stamping — all isolation-positive |
| Migrations | **none in this PR**, so the CI `rls-adversarial` job is correctly skipped |

**Not verified here:** the production RLS cutover verifier, 0 owner-role page
connections, the direct-API authorization matrix, and concurrent assignment
under two live sessions. These need the VPS.

---

## 5. Production data review

All **11** profiles' active assignment chains were compared against the approved
structure:

```
approved profiles checked: 11  matching: 11  mismatched: 0
active seats on profiles outside the approved set: []
```

**No discrepancies.** No writes were made for this review.

Note: a concurrent session is working in this working tree on
`feat/relay-job-intelligence-v2` (untracked `src/lib/job-discovery/`,
`src/app/api/cron/job-discovery/`, a migration and a test). That work is **not
mine** and was left untouched; it is also what currently breaks
`next build` type checking (~30 TS errors). With those directories parked, this
branch builds clean (exit 0).

---

## 6. Regression gates

| Gate | Result |
|---|---|
| Unit | **404 files / 5,825 passed / 0 failed / 0 skipped** |
| ESLint | **0 errors** |
| TypeScript (`tsc --noEmit`) | clean on this branch's files |
| Standalone build | **exit 0** with the other session's untracked WIP parked; **fails** with it present, because of their in-flight `job-discovery` types |
| `qa:contracts` | 4 files / 80 passed |
| `qa:coverage` | 15/15 contracts, 0 skipped |

---

## 7. Remaining defects

| Level | Item |
|---|---|
| P1 | Playwright matrix incomplete (latency, see §2) |
| P2 | 16 reads and the 870 ms 3-round-trip floor per request remain |
| P2 | Analysis cache is in-process only; no hit/miss/cost telemetry |
| P2 | `profile_coverage` history 1,302 rows / 18 active (audit trail; not purged) |
| Blocker | Deployed-SHA proof and production RLS verifier need the VPS |
| External | Another session's untracked `job-discovery` WIP currently breaks the standalone build |

---

## 8. Decision

**NO-GO.**

The five reported bugs are fixed and verified, and the performance P0 is fixed
with measured before/after numbers. What blocks release is not a known product
defect: the deployed-SHA proof, the production RLS verification, the incomplete
browser matrix, and the build breakage from concurrent uncommitted WIP.

Recommended sequence: land the other session's `job-discovery` work (or park it),
merge PR #51, deploy, confirm `/api/version.sha`, run the RLS verifier, then
re-run the Playwright matrix.
