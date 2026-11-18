# Relay — BUG-38 … BUG-42 Resolution

Branch `feat/relay-completion-program`. HEAD `77fe1c54`.
Not deployed. No production team configuration was mutated by any automated
test; the two live probes used an explicit save/restore.

Source bug report: `Relay_Bug_Report_Nov17 (1).pdf` (5 bugs, 2026-11-17).

---

## BUG-38 — Analyzer uses Mehak's profile when another is selected

**Root cause.** The route resolved the requested profile and, when that profile
was not in the candidate set, silently fell back to `accessibleRanked[0] ??
profiles[0]`. The first candidate for the reporting rep was Mehak, so a
selection of Aneeb was analysed as Mehak. The V3 decision is deliberately
sender-independent (`profileId` is `@deprecated` in `V3IntelligenceOptions`),
so the profile only surfaces through proof/note/sender — which made the
fallback invisible until the note was read.

**Changed files.**
- `src/lib/prospect/sender-selection.ts` (new) — the one selection decision.
- `src/app/api/prospect/analyze/route.ts` — uses it; errors instead of falling back.
- `tests/prospect-sender-selection.test.ts` (new).

**Backend fix.** `resolveAnalysisSender({ requestedProfileId, requestedIdentityId,
candidates })` returns `{ sender, error }`. A requested profile must be one of
the rep's candidates and must carry an identity on its own platform; a supplied
identity must belong to the supplied profile. Any failure returns a typed error
(`PROFILE_NOT_ACCESSIBLE`, `PROFILE_NOT_EXECUTABLE`, `IDENTITY_NOT_ACCESSIBLE`,
`IDENTITY_PROFILE_MISMATCH`) which the route emits as an SSE `error` event.

**UI change.** The error banner shows the message; the stale result is cleared
before the request, so a failed selection never leaves the previous profile's
result on screen. The result now carries `selectedProfileId` /
`selectedIdentityId` as provenance.

**Database/migration impact.** None.

**Unit evidence.** `tests/prospect-sender-selection.test.ts` — 9 tests: the
selected profile wins over list order, unknown profile/orphan profile/mismatched
identity/foreign identity all error, identity-only resolves the owning profile,
no selection leaves the choice to the caller. Plus `buildProfileIntelligence`
leakage tests: two profiles with different skills/industries produce different
capabilities, industries and proof attribution.

**Browser acceptance.** Not run — see *External blockers*.

**Performance evidence.** Not applicable.

**Remaining risk.** The decision itself (score/qualification) is intentionally
sender-independent by design; the profile governs sender, proof, routing and the
generated note. A product decision to make the score sender-aware would be a
contract change.

**Decision: PASS** (fix + 9 unit tests; live API call returned
`bestSender = Aneeb, LinkedIn` for a profileId of Aneeb).

---

## BUG-39 — Analyzing the same prospect twice wastes time

**Root cause.** Three defects: the reuse cache key omitted the organization and
the channel identity; the explicit "Re-analyze" button still read from the cache
(`forceReanalyze` was never consulted); nothing told the user a result was reused.

**Changed files.**
- `src/lib/prospect/analysis-fingerprint.ts` (new).
- `src/app/api/prospect/analyze/route.ts`.
- `src/components/prospect/prospect-analyze.tsx`.
- `tests/prospect-analysis-fingerprint.test.ts` (new).

**Backend fix.** `analysisFingerprint` = opportunity version + organization +
normalized prospect text + text length + selected profile + channel identity +
mode. `forceReanalyze` bypasses the cache. A cached result is returned with
`reused: true` and `reusedAt`.

**UI change.** "Re-analyze" sends `forceReanalyze: true`; a reused result shows
"Previously analyzed · <timestamp> · Re-analyze runs it again."

**Database/migration impact.** None. Cache is in-process (5-minute TTL); a
multi-instance deployment would need shared cache state to reuse across nodes —
recorded as remaining risk, not a defect.

**Unit evidence.** 6 fingerprint tests (stable for identical input; changes on
profile, identity, org, text, mode).

**Browser acceptance.** Not run.

**Performance evidence.** Cache hit returns without any model call (the route
short-circuits before `produceV3Intelligence`).

**Remaining risk.** In-process cache only; no cost/telemetry counters yet; no
explicit expiry policy beyond 5 minutes.

**Decision: PASS** for the reported defect (reuse is correct and Re-analyze
works). Cache telemetry is outstanding.

---

## BUG-40 — Prospect capture not counted in daily activity

**Root cause (P0 data integrity).** Both DB adapters bound RPC arguments
**positionally** by call-site key order:

```ts
const params = keys.map((_, i) => `$${i + 1}`)   // neon.ts / postgres.ts
```

`recordProspectExtracted` sent `{ p_rep_id, p_identity_id, p_activity_type,
p_org_id, p_date }`. The function signature is
`(p_rep_id, p_identity_id, p_activity_type, p_org_id, p_source_event_id, p_date)`.
So the business date was bound into `p_source_event_id`, and the real `p_date`
fell back to `current_date`. Consequences:

1. The organization's business date was ignored.
2. The first capture of a day inserted `source_event_ids = ['2026-11-18']`; every
   later capture that day was answered `already_recorded` and **not counted**.

Confirmed live: Ahmad's `daily_accountability` for `prospect_extracted` had
stalled at 2 while `captured_prospects` showed repeated captures, and
`source_event_ids` contained `'2026-11-18'` and `'2026-11-19'`.

**Changed files.**
- `src/lib/db/neon.ts`, `src/lib/db/postgres.ts` — `rpc()` emits named notation
  (`"p_x" => $n`).
- `src/lib/store/supabase-store.ts` — `recordProspectExtracted` credits the
  account actually captured on and passes `p_source_event_id`.
- `src/lib/store/types.ts`, `src/lib/store/mock-store.ts` — signature.
- `src/app/api/prospect/analyze/route.ts` — passes `prospect_capture:<id>`.
- `tests/db-rpc-named-binding.test.ts` (new).

**Backend fix.** Named binding makes every RPC call self-describing and order
independent. Capture credit is exactly-once per capture id.

**UI change.** None required.

**Database/migration impact.** None (no signature changes).

**Unit evidence.** 4 tests across both adapters, including the exact buggy shape.

**Live evidence.** Before: `completed_count 2`, `source_event_ids
['2026-11-18','2026-11-19']`. Same `p_source_event_id` twice → one increment;
a second capture id → a second increment; state restored afterwards.

**Remaining risk.** Any caller still passing a key the function does not declare
now errors loudly instead of silently mis-binding — that is the intended
behaviour. An audit of all 28 `.rpc()` call sites found no other positional
defect (the two apparent hits were regex false positives from shorthand and
template-literal keys).

**Decision: PASS.**

---

## BUG-41 — Upwork drafts not counted as actions

**Root cause.** `DailyMetrics` was computed from `messages` and `outcomes` only:

```ts
const outreachActions = connectionsSent + dmsSent + followupsSent + repliesSent
```

Upwork work lives in `action_events`, so a saved draft — and a submitted
application — never reached the daily action count, Today, Performance or the
team calendar.

**Changed files.**
- `src/lib/accountability/metrics.ts` — reads `action_events` for
  `UPWORK_PROPOSAL_PREPARED` and `UPWORK_APPLICATION_SUBMITTED`/`UPWORK_APPLIED`;
  adds `upworkProposals` / `upworkApplications`; both feed `outreachActions` and
  `totalActions`. Response rate stays a messaging metric.
- `src/lib/responsibility/activity-registry.ts` — `proposal_generated`
  `defaultWeight` 0 → 1 (still `targetable: false`).
- `tests/accountability-upwork-metrics.test.ts` (new).

**Backend fix.** Draft = one action; application = one action; a draft is never
counted as an application.

**UI change.** None required — the existing surfaces render `totalActions`.

**Database/migration impact.** None.

**Unit evidence.** 4 tests: a draft counts once and not as an application; a
draft plus a submission count twice; an unrelated action type is ignored; the
response rate is unaffected by a draft.

**Browser acceptance.** Not run.

**Performance evidence.** One extra batched `action_events` read per metrics
period; the team calendar adds it to the existing `Promise.all`.

**Remaining risk.** `defaultWeight` is currently documentation-only (no consumer
in `src`); the real count authority is `action_events`.

**Decision: PASS.**

---

## BUG-42 — Profile reassigned repeatedly after acknowledgment

**Root cause.** `configureCoverageStatement` inserted a **fresh** set of
`profile_coverage` rows on every call, and its `ack_arm` CTE re-arms an
acknowledgement whenever `source_row_id` is distinct from the new row id:

```sql
ack_arm AS (
  UPDATE responsibility_acknowledgements a
  SET source_row_id = ins.id, assigned_at = now, acknowledged_at = NULL
  FROM ins WHERE ... AND a.source_row_id IS DISTINCT FROM ins.id
)
```

A new row id every time ⇒ every re-save cleared `acknowledged_at` and handed the
assignment back. `profile_coverage` held 1,302 rows for 18 active seats — the
archaeology of exactly this.

**Changed files.**
- `src/lib/coverage/configure.ts` — idempotence guard: read the active chain,
  compare seats, return `{ ok, unchanged: true }` and skip the mutation.
  Exported `uniqueSeats` / `sameSeatSet`.
- `src/lib/coverage/actions.ts` — propagates `unchanged`.
- `tests/coverage-configure-idempotence.test.ts` (new).

**Backend fix.** Reconcile repairs genuine drift; an unchanged chain is a no-op
(no deactivate, no insert, no acknowledgement re-arm).

**UI change.** None required.

**Database/migration impact.** None. Stops the accumulation of inactive
`profile_coverage` rows; the existing history is untouched.

**Unit evidence.** 7 tests: unchanged chain (row ids irrelevant), added/removed
operator, primary change, priority change, seat dedupe rules.

**Live evidence.** Fizza Upwork, re-configuring the identical chain:
`configure → {"ok":true,"unchanged":true}`, the acknowledged row kept
`acknowledged_at` and `source_row_id`, and the active seat set was unchanged.

**Remaining risk.** A genuine same-day seat change now reconciles only because
the seat set differs; a same-day re-arm policy (for example "re-confirm a
transfer") would need a separate, explicit rule.

**Decision: PASS.**

---

## External blockers

- **Browser acceptance (Playwright).** Top-level browser navigation is served an
  empty document by the harness egress proxy (502 on the navigation request);
  authenticated `fetch` returns the full SSR page. Client click-through and the
  Playwright journey could not be executed in this environment.
- **Serial isolated-DB integration suite / RLS cutover verifier.** Not run here;
  they require the Aiven owner cutover and a deployed SHA.
