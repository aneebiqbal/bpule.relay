# Production-equivalent certification — summary

**Branch:** `feat/relay-job-intelligence-v2`
**Base SHA:** `e6e5a607` · **Head:** see `git rev-parse HEAD`
**Environment:** disposable local PostgreSQL 18 (`127.0.0.1:5433`) + Better Auth sessions; production never contacted.

## What was certified

| Workstream | Result |
|---|---|
| A — Database & RLS | **31/31 adversarial checks pass** on real PostgreSQL as the runtime role (`relay_app`, member of `authenticated`), with forged GUC, forged org insert, CRUD boundaries, SECURITY DEFINER/search_path audit, transaction-local context and Work Setup revision conflict + cross-org refusal |
| B — Authenticated routes | **164/164 checks pass** across OWNER/ADMIN/MANAGER/MEMBER × 24 routes, incl. 390/768/1280/1440 overflow sweeps |
| C — UI/instrumentation | One intermittent unattributed `performance.measure()` error remains recorded (no call site in source); no new UI system introduced; responsive sweep clean |
| D — Critical workflows | Manager Inbox, member scope, cross-org denial, suspended refusal, Work Setup save/409/invalid allocation, rep daily fixtures — pass |
| E — Performance | Local authenticated p50/p95 sampled for 9 routes × 3 roles; production/VPS unverified |
| F — Security & release | Credential rotation still external; CI not re-run here; packaging reproducible from the documented bootstrap |

## Defects fixed during this certification

| # | Severity | Defect | Fix |
|---|---|---|---|
| 1 | P1 | Work Setup returned HTTP 500 wherever an assignment existed — `identity_assignments.updated_at` did not exist | migration adds/backfills the column |
| 2 | P2 | Out-of-scope conversation reads returned HTTP 500 instead of a denial | typed `LeadAccessDeniedError(404)` |
| 3 | ops | Clean bootstrap failed at 174/201 migrations | six migration repairs; bootstrap now uses the canonical `supabase/aiven/bootstrap.sql` |

## New findings recorded (not hidden)

1. **Forbidden pages return HTTP 200 with dashboard content** rather than a 3xx. Verified identical in dev *and* production build (`next start`). APIs still reject (member/manager `GET`/`POST /api/admin/work-setup` → 403), so no damaging action is possible; the URL/content mismatch is misleading and is listed as P2.
2. `auth.uid()` compatibility function is STABLE and reads only request context; it is deliberately not SECURITY DEFINER and touches no relation (documented rationale).

## Verdict

**GO for integration; NO-GO for production activation.** The remaining blockers are external/authorization-gated, not code defects:
Aiven administrator credential rotation, GitHub PAT revocation, Vercel billing, real staging/VPS deployment of this SHA, and owner approval to merge/deploy.
