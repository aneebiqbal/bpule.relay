# Critical workflow E2E

Evidence: `../staging-recovery/artifacts/authenticated-e2e.txt` — **19 checks, 0 failures**,
reproduced from a freshly provisioned database.

## Inbox

| Journey | Result |
|---|---|
| Manager signs in and opens `/chats` | ok |
| Queue contains teammate-owned and member-owned conversations; no org B company | ok |
| Manager opens the teammate thread and reads both message directions | ok |
| Intelligence pane loads (no "could not be loaded") | ok |
| Composer names a sending profile | ok |
| Refresh keeps the selected conversation | ok |
| Member sees own conversations, not an identity with no seat/coverage | ok |
| Member API request for that out-of-scope lead | HTTP 404 |
| Cross-org conversation id | HTTP 404 |

## Work Setup & accountability

| Check | Result |
|---|---|
| Admin Work Setup renders with correct requirement/allocated totals | ok |
| Save with current revision | HTTP 200 |
| Replayed stale revision | HTTP 409 (committed row returned; nothing overwritten) |
| Allocation above lane target | HTTP 400 |
| CAS under real PostgreSQL (`computeAccountRevision` + two writes) | first ok, second `CONFLICT` |
| Writer refuses another organisation's identity | ok |
| Shared requirement counted once (20 target / 6 allocated / 14 unallocated) | ok |

## Daily execution fixtures

Fixtures provide check-in-capable reps, targets, allocations, an open assigned task, leads in
waiting-on-rep / waiting-on-prospect states and a covered-profile lead. End-of-day completion
was fixed in the previous program and is covered by unit contracts; a live check-in → end-day
browser journey was **not** executed in this pass.

## Prospecting / Jobs / Studio

Not exercised end to end in this pass. Static and route-level verification only; no external
message or job application was sent. Recorded as untested rather than passed.
