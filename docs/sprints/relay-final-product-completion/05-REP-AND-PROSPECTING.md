# Rep workspace and prospecting

## Fixed in this program

| ID | Finding | Fix |
|---|---|---|
| SR-U3 | Rep360 header and per-lane remaining mixed personal and lane/profile bases | Personal target per lane now comes from `lanePersonalTarget` (explicit share, else solo-seat lane target). `target` = personal, `profileTarget` = channel requirement. `todayRemaining` sums personal remaining; the shared label uses `profileTarget`. |
| SR-U8 | Performance → Targets attributed an unallocated shared lane to the primary | Same canonical helper; unallocated multi-seat lanes yield no personal row. |

Both surfaces now agree with Team Live, People and the accountability ledger by construction
(single shared function), not by duplicated arithmetic.

## Effects a reviewer should know

- A rep on a shared profile with **no allocations** now sees **0 personal expectation** instead of
  the whole lane target. That is the canonical rule already used everywhere else; it removes a
  number that never matched their actual allocation.
- The channel's full requirement remains visible as a separate figure.

## Preserved

- Attendance/check-in/out, daily actions ordering, follow-up lateness labels, end-of-day handling
  (prior sprint) are unchanged.
- No change to lead capture, scoring, duplicate detection or sender-profile ownership logic.

## Not verified

No authenticated run of the rep day (check-in → targets → tasks → check-out) was possible.
Unit suites covering these loaders pass in the no-env suite.
