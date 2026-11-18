# Relay — Release Readiness (current)

Branch `feat/relay-completion-program`. Not deployed. No merge to `main`.

This replaces the point-in-time V4 note (`RELAY_PUBLIC_RELEASE_READINESS.md`) as
the live gate record.

---

## 1. Verdict

```
PRODUCT:                   READY — the five reported bugs are fixed and verified
PUBLIC PRODUCTION RELEASE: BLOCKED — BROWSER ACCEPTANCE + DEPLOYED-SHA PROOF
```

---

## 2. Gate results (this sprint)

| Gate | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | pass |
| ESLint | see commit log |
| Unit suite | see §3 |
| Standalone `next build` | exit 0 |
| Live API/DB probes | BUG-38, BUG-40, BUG-42 verified (saved/restored) |
| Playwright | **not run** — harness proxy |
| Serial isolated-DB suite | **not run** — needs Aiven cutover |
| Production RLS verifier | **not run** — needs deployed SHA |

---

## 3. Unit suite

| Gate | Result |
|---|---|
| Unit | **402 files / 5,805 tests passed** |
| ESLint | **0 errors** (769 pre-existing warnings) |
| Standalone build | exit 0 |
| `qa:contracts` | 4 files / 80 tests passed |
| `qa:coverage` | **15/15 contracts pass, 0 skipped** |
| `qa:release` (code portion) | UNIT PASS · BUILD PASS · 5,805/5,805 · 0 skipped |
| Playwright | Chromium installed; suite running against `http://127.0.0.1:3000` |

Deployment: `origin/main` = `77476c75`. Production `/api/version` reports
`sha: null`, `databaseProvider: postgres`, `authProvider: aiven`. `deploy.yml`
now stamps `RELAY_GIT_SHA` so the next deployment is identifiable.

New files this sprint:

| File | Covers |
|---|---|
| `tests/prospect-sender-selection.test.ts` | BUG-38 |
| `tests/prospect-analysis-fingerprint.test.ts` | BUG-39 |
| `tests/accountability-upwork-metrics.test.ts` | BUG-41 |
| `tests/db-rpc-named-binding.test.ts` | BUG-40 (both adapters) |
| `tests/coverage-configure-idempotence.test.ts` | BUG-42 |

---

## 4. Evidence map

| Bug | Unit | Live | Browser |
|---|---|---|---|
| BUG-38 | 9 tests | authenticated analyze → `bestSender = Aneeb, LinkedIn` | not run |
| BUG-39 | 6 tests | cache short-circuit before the model call | not run |
| BUG-40 | 4 tests | RPC probe: once per capture id, twice for two captures, restored | not run |
| BUG-41 | 4 tests | — | not run |
| BUG-42 | 7 tests | `unchanged: true`, acknowledgement preserved, restored | not run |

Full detail: `RELAY_BUG_38_42_RESOLUTION.md`.
Ledger and non-negotiables: `RELAY_PLATFORM_P0_CLOSURE.md`.
Acceptance status and remaining steps: `RELAY_END_TO_END_ACCEPTANCE.md`.

---

## 5. Known debt (open, none P0)

| Level | Item |
|---|---|
| P2 | `profile_coverage` history 1,302 rows / 18 active — the design is deactivate-don't-delete; purge is optional hygiene |
| P2 | Analysis cache is in-process; a multi-instance deployment needs shared state |
| P2 | Analysis cache telemetry (hit/miss/reuse/cost/time) not instrumented |
| P2 | Full responsive/axe matrix and Inbox notes e2e not re-run on this SHA |
| P3 | Coverage readiness list is channel-first while the directory is person-first |

---

## 6. Release procedure (unchanged)

1. Owner applies the Vercel cutover and redeploys.
2. Confirm `/api/version` reports the expected `sha`, `databaseProvider`,
   `authProvider`.
3. Run the production RLS cutover verifier.
4. Run the Phase 12 browser journey on a host with unrestricted egress.
5. If all green: release decision.
