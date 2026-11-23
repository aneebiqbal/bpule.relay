# Open P1 closure

The five P1 records came from `../relay-ui-ux-recovery/artifacts/issue-register.json`. Each was
read, reproduced against source, fixed, and given a regression contract in
`tests/relay-p1-closure.test.ts` (13 tests).

## SR-U1 — Upwork history claimed delivery

- **Reproduction:** `upwork-communication.tsx` labelled the action "Save & send" while both
  endpoints document "history only"; both handlers appended optimistically inside `catch {}` and
  never inspected `res.ok`.
- **Correct behaviour from code:** the routes (`.../message`, `.../followup`) only persist
  history, complete tasks and schedule steps. Relay cannot deliver to Upwork.
- **Fix:** require `res.ok`, append only after success, render an inline error; relabel to
  "Log reply"; the follow-up prompt now says the rep must send it themselves.
- **Preserved:** task completion / scheduling side effects untouched.

## SR-U3 — Rep360 target basis

- **Reproduction:** header summed lane targets while per-lane remaining compared the same number
  against a profile total; shared unallocated lanes therefore appeared as a personal expectation,
  contradicting Team Live / People.
- **Correct behaviour from code:** `lanePersonalTarget` (accountability) is the canonical rule —
  explicit allocation, else solo-seat lane target, else 0.
- **Fix:** one shared function; `target` personal, `profileTarget` channel; header and "N left"
  use personal; the shared label uses the channel figure.

## SR-U5 — Profile detail capability mismatch

- **Reproduction:** list page allowed `MANAGE_REVENUE_IDENTITIES`; detail page required
  admin/owner, hiding Manage people, CoverageActions and Knowledge even though those APIs accept
  the capability. Target editing requires a different capability again.
- **Fix:** two flags. People/coverage/knowledge = capability-aware; targets = `MANAGE_TEAM_TARGETS`.

## SR-U6 — Unauthorized target writes reported as success

- **Reproduction:** `/team` gates Setup assistant on `MANAGE_REVENUE_IDENTITIES`, but
  `/api/admin/targets` requires `MANAGE_TEAM_TARGETS`; the assistant logged "target failed" next
  to "chain saved". Rep360's assign dialog fired target POSTs and closed regardless.
- **Fix:** capability threaded; skip is explicit; Rep360 reports partial failure honestly.

## SR-U8 — Performance target attribution

- **Reproduction:** `targets.ts` fell back to the PRIMARY rep for any lane without allocations.
- **Fix:** same canonical helper; unallocated multi-seat lanes yield no personal row.

## Result

**Open P1: 0.** No P1 was closed by moving it to a decision backlog; each is implemented and
covered by a test.
