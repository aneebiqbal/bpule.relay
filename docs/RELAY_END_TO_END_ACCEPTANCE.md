# Relay — End-to-End Acceptance

Branch `feat/relay-completion-program`. Not deployed.

This records what was actually executed and observed, what could not be executed,
and the exact remaining steps. It does not claim a journey that did not run.

---

## 1. Execution environment

| Fact | Value |
|---|---|
| Database | Aiven Postgres (`RELAY_DB_PROVIDER=postgres`) |
| Auth | Better Auth in-app (`RELAY_AUTH_PROVIDER=aiven`) |
| App | `npm run dev` on `localhost:3000` |
| Accounts used | `hassan@scout.dev` (admin), `ahmad@scout.dev` (rep) |
| Date of run | 2026-11-18/19 UTC |

---

## 2. Journeys that were executed

### 2.1 BUG-38 — selected profile is authoritative (API-level, authenticated)

1. Signed in as `ahmad@scout.dev`.
2. `GET /api/profiles?assigned=1&channel=linkedin` → `Aneeb, LinkedIn`
   (`87c10cd5…`) and `Mehak, LinkedIn` (`fb589293…`).
3. `POST /api/prospect/analyze` with `profileId = 87c10cd5…` and Aneeb's
   revenue identity.
4. Observed `bestSender` = **`Aneeb, LinkedIn`**, `selectedProfileId` =
   `87c10cd5…`, `selectedIdentityId` = Aneeb's identity.

Before the fix the same call could fall back to `profiles[0]` (Mehak) whenever
the selection did not resolve. The route now rejects that case.

### 2.2 BUG-40 — capture credit (live DB probe, saved and restored)

Probe on `daily_accountability` for `prospect_extracted`:

| Step | Observation |
|---|---|
| Before | `completed_count = 2`, `source_event_ids = ['2026-11-18','2026-11-19']` — proof the business date was being written into the idempotency slot |
| `record_activity_event` with `p_source_event_id = probe-fix-a` | `recorded: true`, count 2 → 3 |
| Same `p_source_event_id` again | `recorded: false, reason: already_recorded`, count stays 3 |
| `p_source_event_id = probe-fix-b` | `recorded: true`, count 3 → 4 |
| Restore | count and `source_event_ids` returned to the exact prior values |

### 2.3 BUG-42 — unchanged reconcile (live, saved and restored)

On `Fizza Upwork` (`6e92e611…`), with an acknowledgement row set to
acknowledged:

| Step | Observation |
|---|---|
| Before | `acknowledged_at` set, `source_row_id = aa56ac72…` |
| `configureCoverage` with the identical chain | `{ ok: true, unchanged: true }` |
| After | `acknowledged_at` preserved, `source_row_id` preserved, active seat set identical |
| Restore | `acknowledged_at` returned to `null` |

### 2.4 Directory correctness (sprint 8, re-confirmed)

`GET /team/profiles` renders exactly seven person cards with the authoritative
primary/operator pairs, no archived rows, no test fixtures.

---

## 3. Journeys that were NOT executed

| Journey | Why |
|---|---|
| Full 24-step management journey (Phase 12) | Top-level browser navigation is served an empty document by the harness egress proxy (HTTP 502 on the navigation request). `fetch` from an authenticated tab works and returns the full SSR page; click-through does not. |
| Playwright spec run | Same proxy limitation. |
| Rep-role and unauthorized-role journeys | Not run. |
| Multi-operator simultaneous sessions | Not run. |
| Desktop/mobile screenshots | Not captured. |
| Serial isolated-DB integration suite | Requires the Aiven owner cutover. |
| Production RLS cutover verifier | Requires a deployed SHA. |

---

## 4. Exact remaining steps

1. **Owner:** apply the Vercel cutover (`DATABASE_URL` → `relay_app`,
   `SERVICE_DATABASE_URL` → owner/service) and redeploy `77fe1c54`.
2. **Owner:** run `scripts/qa/verify-production-rls-cutover.mjs`; confirm 0
   owner-role page connections.
3. **Agent:** on a host with unrestricted egress, run the Phase 12 journey with
   Playwright against disposable users, capturing desktop and mobile screenshots.
4. **Agent:** run the serial isolated-DB integration suite and the concurrent
   assignment tests on the deployed SHA.
5. **Agent:** add analysis-cache telemetry (hit/miss/reuse/cost/time) and decide
   whether the cache moves to shared state.
6. **Owner decision:** release.

---

## 5. Verdict

**NO-GO for public release** — not because of a known product defect, but because
the browser acceptance and the deployed-SHA security proof could not be executed
in this environment. All five reported bugs are fixed and verified at the unit
and live-API/DB level.
