# Authenticated role × route results

Evidence: `artifacts/authenticated-e2e.txt` (full run output). Sessions are real Better
Auth accounts in `neon_auth`; no mocked roles.

## Manager (Inbox regression)

| Check | Result |
|---|---|
| Sign in | ok → `/dashboard` |
| Queue shows a teammate-owned conversation ("Manager Client") | ok |
| Queue shows a member-owned conversation | ok |
| Queue does not leak org B data | ok |
| Opens the teammate thread | ok |
| Reads message history (both directions) | ok |
| Intelligence pane did not fail | ok |
| Composer names a sending profile | ok |
| Refresh keeps the selected conversation | ok |
| No page errors on the journey | ok |

This is the end-to-end proof of the previously unit-only SR-01/SR-02 fix.

## Member scope

| Check | Result |
|---|---|
| Sees own conversations | ok |
| Does **not** see an identity with no seat/coverage ("Solo Client") | ok |
| API request for that out-of-scope lead | **HTTP 404** |

## Cross-organization

| Check | Result |
|---|---|
| Org A member requests an org B lead conversation | **HTTP 404** |
| Manager queue contains no org B company | ok |

## Suspended account

| Check | Result |
|---|---|
| `suspended.stg@org-a.test` sign-in | refused, stays on `/login` |

## Work Setup (admin)

| Check | Result |
|---|---|
| `/admin/targets` renders | ok |
| Save with the current revision | **HTTP 200** |
| Replayed stale revision | **HTTP 409** (committed row returned, nothing overwritten) |
| Allocation above the lane target | **HTTP 400** |

Seats are preserved in the save body; an earlier version of this test cleared the
operator seat and changed who could see the lane, which was a test defect, now fixed.

## Not covered in this pass

- Remaining routes (Leads, Tasks, Jobs, Content, Resume, Reports, Settings) under
  authenticated sessions — not exercised.
- Mobile/tablet authenticated layouts.
- Direct ID substitution across tasks/documents/applications/reports — only
  conversations were tested.

Those remain open, not passed.
