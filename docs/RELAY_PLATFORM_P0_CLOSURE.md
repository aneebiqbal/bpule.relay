# Relay — Platform P0 Closure

Branch `feat/relay-completion-program`. Not deployed, not merged to `main`.

This is the defect ledger required by Phase 0, with the closure state of each
item. Severity: **P0** = data integrity / security / wrong money-or-work
attribution; **P1** = a reported user defect with a workaround; **P2** = polish.

---

## 1. Ledger (prioritized)

| # | Defect | Severity | Root cause (short) | State |
|---|---|---|---|---|
| BUG-40 | Prospect captures collapsed to one per day | **P0** | RPC arguments bound positionally; business date landed in `p_source_event_id` | **FIXED** |
| BUG-42 | Acknowledged assignment re-armed on every re-save | **P0** | Coverage reconcile inserted new row ids; `ack_arm` keyed on row id | **FIXED** |
| BUG-38 | Analyzer ran as a profile the rep did not select | **P1** | Silent fallback to the first candidate | **FIXED** |
| BUG-41 | Upwork drafts invisible to the daily action count | **P1** | Metrics read only `messages`/`outcomes` | **FIXED** |
| BUG-39 | Re-analysis always re-ran; Re-analyze read the cache | **P1** | Cache key missed org+identity; `forceReanalyze` ignored | **FIXED** |
| — | `profile_coverage` history: 1,302 rows / 18 active | P2 | Deactivate-don't-delete design + the BUG-42 re-arm | Open (hygiene) |
| — | Analysis cache is in-process only | P2 | No shared cache state | Open |
| — | Analysis cache telemetry (hit/miss/cost/time) | P2 | Not instrumented | Open |
| — | Browser/Playwright acceptance | **Blocker** | Harness proxy blanks top-level navigation | Blocked |
| — | Aiven owner cutover + deployed-SHA proof | **Blocker** | Owner action | Blocked |

---

## 2. What was already sound (verified, not assumed)

- **Channel lifecycle** (`sprint 6`): suspend blocks execution for rep and org
  scope; restore works; invalid transitions and blank reasons rejected.
- **Canonical execution readers** (`lib/coverage/access.ts`) are used by the
  profile directory, Team live, Today and the analyzer; the analyzer's 403 for
  an inaccessible identity was already correct and is now covered by tests.
- **Data Management** (`sprint 7`): duplicate candidates, dependency inspection,
  deletion gated on every count being zero with a server-side re-check.
- **Person-first directory** (`sprint 8`): archived profiles/channels hidden;
  ownership merged across a person's profiles.

---

## 3. Cross-cutting defect found during the sweep

**RPC named binding.** Both DB adapters (`neon.ts`, `postgres.ts`) built
`SELECT * FROM fn($1, $2, …)` from `Object.keys(args)`. Any call site that
omitted an optional parameter before a later one mis-bound every subsequent
argument. `record_prospect_extracted` was live-hit.

An audit of all 28 `.rpc()` call sites against `pg_proc.proargnames` was run to
prove the blast radius. Result: one real defect (BUG-40); the two other apparent
hits were regex false positives (a shorthand property and a template literal).
The fix makes any future mismatch a loud error instead of silent corruption.

---

## 4. Data mutated during this sprint

| Action | Detail |
|---|---|
| Team coverage set to the real structure | 11 profiles, via `POST /api/team/profiles/[id]/coverage` (admin actor). Both channel profiles of a person carry the same seats. |
| Test profiles removed | `V6 fixture` (with its identity/assignments/targets/coverage), `testing`, one empty duplicate `Aleena Saman` |
| Live probes | Two save/restore probes (BUG-40 credit, BUG-42 re-arm). Both restored the exact prior row state. |

No real person's assignment was removed. `Fizza Upwork`'s assignment and targets
were **not** modified; the missing-PRIMARY finding is closed by the explicit
coverage set (Hassan PRIMARY, Aneeb OPERATOR).

---

## 5. Non-negotiables checklist

| Criterion | State |
|---|---|
| BUG-38 … BUG-42 each have a verified end-to-end fix | Met (unit + live) |
| Every authorized operator sees their correct assignments | Met — directory verified against the authoritative structure |
| No assignment duplicates after acknowledgment | Met (BUG-42 guard + live proof) |
| The selected identity controls profile-specific AI analysis | Met (BUG-38) |
| Cached analyses are reused correctly | Met (BUG-39); telemetry open |
| Prospect captures and Upwork drafts contribute accurately | Met (BUG-40, BUG-41) |
| Admin Control Center: task/target/assignment/lifecycle/safe-cleanup | Built in sprints 3–8; not re-verified in this sprint |
| Inactive and suspended identities cannot execute | Met (sprint 6, unchanged) |
| No unexpected automatic task assignment | Met — capture paths do not create tasks |
| No accidental deletion or merge of real identities | Met — deletes were test-only, dependency-gated |
| No unresolved P0 security or data-integrity defects | Met — the two P0s are fixed and verified |
| All required release checks pass with evidence | **Not met** — browser acceptance and the deployed-SHA RLS proof are external blockers |
