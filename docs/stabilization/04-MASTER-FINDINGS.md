# Relay — Master Findings

**Machine-readable register:** `findings-register.json`
**Method:** static code read + live read-only DB probe. No fabricated findings.

## 1. Totals

| Metric | Count |
|---|---|
| Hypotheses investigated | 42 |
| Confirmed | 15 |
| Fixed this pass | 5 |
| Carried forward, verified fixed | 9 |
| Open after this pass | 10 |
| Not run (external blockers) | 8 |

Severity of confirmed: P1 = 3 (R-01, R-02, R-13), P2 = 6, P3 = 3, plus R-06 P1
credential handling.

## 2. Confirmed findings

| ID | Sev | Title | Status |
|---|---|---|---|
| R-01 | P1 | Cross-organization seat write through Work Setup | fixed |
| R-02 | P1 | Allocation replace could zero a lane | partially fixed |
| R-03 | P1 | Live-test config targets production | open |
| R-04 | P2 | Org delete did not revoke sessions | fixed |
| R-05 | P2 | Login `next` backslash redirect | fixed |
| R-06 | P1 | GitHub PAT in local remote | remediated locally / rotate pending |
| R-07 | P2 | Two AI routing systems | open |
| R-08 | P2 | UTC dates in adjacent surfaces | open |
| R-09 | P2 | personal invariant breaks on solo-seat allocation | open |
| R-10 | P2 | Work Setup cannot clear allocations | open |
| R-11 | P2 | Work Setup permits unseated allocations | open |
| R-12 | P3 | Dead `_userId` params | open |
| R-13 | P1 | No transaction / no optimistic concurrency | open |
| R-14 | P3 | `backfillProfileCoverage` second writer | open |
| R-15 | P3 | Requirement invariant doc mismatch | open |

Full reproduction steps, evidence and regression tests are in
`findings-register.json`.

## 3. Carried-forward ledger (2026-09-29) — verification result

| Old ID | Old claim | Current status |
|---|---|---|
| P0-01 | stale `reps.role` escalates | **fixed** — org roles canonical |
| P0-02 | no session revocation after delete | route moved; **still no explicit revoke → R-04 (fixed here)** |
| P0-03 | signup rate limiter fails open | **fixed** — fails closed |
| P0-04/05/08 | AI evidence fabrication / score inflation | not re-verified (AI paths not exercised) — **carried as unverified** |
| P0-06 | Studio onboarding infinite redirect | not re-verified |
| P0-07 | `/admin` route broken | **fixed** — `page.tsx` exists |
| P0-09 | corrupted service key | production reachable; **closed** |
| P0-10 | few-shot RPC cross-org | **fixed** — org guard + revoke |
| P1-01 | session refresh in RSC | not re-verified |
| P1-02 | login 1.2s timeout | not re-verified |
| P1-03 | `_userId` dead param | **confirmed — R-12** |
| P1-04/05 | store org filters | **fixed** |
| P1-12/13 | orphan routes / dead anchors | partially; `/conversations` still redirects |
| P1-14 | admin command center empty | superseded by canonical loader |
| P1-15..17 | E2E failures | not re-run (no staging) |
| P1-18 | `tailored_cvs` missing | **fixed** — present in production |
| P2-19 | `current_org_id()` missing | **fixed** — present in production |

**Note:** P0-04/05/08, P0-06, P1-01, P1-02 remain **unverified** in this pass.
They are not counted as confirmed and not counted as fixed.

## 4. Hypotheses investigated but not confirmed

- IDOR on `/api/tasks/[id]`, `/api/leads/[id]`, `/api/profiles/[id]`: the
  read paths filter by `organization_id`; no unguarded cross-org read found in
  the spot checks.
- Service-role exposure to browser requests: `createServiceSupabase` appears
  only in cron + 2 admin routes guarded by `can(...)`.
- SQL injection: all raw SQL observed uses `$n` placeholders; `rpc` binds by
  name (`src/lib/db/postgres.ts:203-218`).
- XSS: React escaping; no `dangerouslySetInnerHTML` found in the spot checks.
- Open redirect: callback `safeNextPath` is same-origin strict; login sanitizer
  hardened (R-05).
