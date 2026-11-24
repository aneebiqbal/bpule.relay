# Admin, Team, People and Work Setup

## What was broken and what changed

### Work Setup (`/admin/targets`) — SR-03, SR-04

- The GET payload returns a per-row `revision` explicitly documented as
  "POST this back as `expectedRevision`". The drawer never read it, so the atomic
  compare-and-set in `saveWorkSetup` was **never exercised**: two admins editing the same
  account silently last-write-won. On the rare 409 the response's committed `current` row was
  discarded and only a string shown.
- Now: `draftFromRow()` captures the token, `save()` posts it, and a 409 renders a conflict
  panel built by the pure `workSetupConflictLines()` with **Load latest and re-edit** /
  **Discard my changes**. Save stays disabled while a conflict is open, so a stale retry is
  impossible.
- Blanking one lane's allocations while another kept shares left the blanked lane active. The
  writer now always seeds the affected lanes from the supplied target list; the previous
  active-plan fallback remains for callers that omit targets entirely.

### Rep360 plan removal (`/team/[repId]`) — SR-05

`deactivateDailyPlanAdmin` deactivates every active lane for a `revenue_identity_id` and uses
`repId` only in the audit text. The UI offered "Remove plan" on any row with a target,
including operators/backups, so removing an operator's expectation also removed the primary's.
The control now appears only on the PRIMARY row, where "the channel's plan" is accurate.

### `/admin/people` — SR-07

The page gate trusted `user.rep.role !== 'admin'` alongside the auth context — the exact
stale-field pattern `src/lib/auth/admin-page.ts` forbids. Replaced with
`requireProductAdmin()`, so a demotion recorded in `organization_roles` takes effect
immediately.

## Verified unchanged (protected contracts)

- Atomic Work Setup transaction, fail-closed non-transactional adapters, revision computation
  and cross-org seat validation were **not** modified. Only the client now participates in CAS.
- Allocation sum-per-lane validation, positive-target validation, backup/operator exclusion
  and the accountability ledger are untouched.
- `tests/work-setup-accounting-rules.test.ts`, `tests/work-setup-hardening.test.ts`,
  `tests/work-setup-transaction.test.ts`, `scripts/qa/postgres-txn-integration.mjs` remain the
  authority for the writer.

## Not done here

Rep360's per-person totals still mix personal and profile bases (SR-U3), Performance → Targets
attributes unallocated shared lanes to the primary (SR-U8), target editors still cannot express
zero (SR-U4), and the Team profile detail hides target controls from
`MANAGE_REVENUE_IDENTITIES` managers (SR-U5). Each needs a product decision or a protected
authorization change; see `artifacts/issue-register.json`.
