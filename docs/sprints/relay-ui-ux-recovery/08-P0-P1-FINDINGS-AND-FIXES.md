# P0 / P1 findings and fixes

Severity definitions from the sprint brief.

## P0

| ID | Finding | State |
|---|---|---|
| SR-01 | Inbox thread read/write refused outside the owning rep — managers could not open a teammate's conversation at all | **FIXED** (unit-verified; browser confirmation blocked) |

No cross-tenant access, data corruption, login failure or permission-escalation defect was
found. Cross-organization isolation is enforced by `.eq('organization_id', ...)` on every new
query path added here, and the store's unscoped branch is unchanged so no legacy caller widened.

## P1

| ID | Finding | State |
|---|---|---|
| SR-02 | Intelligence pane scope differed from the queue (both too broad for `scope=me` and too narrow for coverage) | **FIXED** |
| SR-03 | Work Setup never sent the CAS token → silent overwrite; 409 state discarded | **FIXED** |
| SR-04 | Clearing one lane's allocations silently did nothing | **FIXED** |
| SR-05 | "Remove plan" on an operator deleted the whole channel plan | **FIXED** (UI gating) |
| SR-06 | "End day" always recorded an incomplete shortfall | **FIXED** |
| SR-07 | `/admin/people` trusted stale `reps.role` | **FIXED** |
| SR-U1 | Upwork actions claim a send that never happens; failures swallowed; optimistic append | **OPEN** — needs a product decision |
| SR-U3 | Rep360 mixes personal target with profile totals | **OPEN** — needs one agreed basis |
| SR-U5 | Team profile detail hides target/people controls from `MANAGE_REVENUE_IDENTITIES` managers | **OPEN** — protected authorization surface |
| SR-U6 | Setup assistant / Rep360 write targets through `MANAGE_TEAM_TARGETS` and swallow failures | **OPEN** |
| SR-U8 | Performance → Targets attributes unallocated shared lanes to the primary | **OPEN** — same basis question as SR-U3 |

## Counts

- **P0:** discovered 1, fixed 1, remaining 0.
- **P1:** discovered 11, fixed 6, remaining 5 (all blocked on a decision or a protected surface).
- **P2:** discovered 9, fixed 9, remaining 0. (SR-08…SR-16.)
- **P3:** discovered 2 groupings (token/style bypass; nav duplication and orphan routes),
  remaining 2. None were applied because both are visual/IA changes with deep-link impact.

Discovered, fixed and open are reported separately above; nothing is counted as fixed because it
compiles. Each fix lists its regression evidence in `artifacts/issue-register.json`.
