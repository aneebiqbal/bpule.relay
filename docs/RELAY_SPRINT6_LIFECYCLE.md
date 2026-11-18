# Relay Sprint 6 — Channel Lifecycle

Branch `feat/relay-completion-program`. Commit `54414b88`. Pushed; not deployed.

## Implemented

**Lifecycle service** — `src/lib/profiles/lifecycle.ts`

```
ACTIVE ⇄ INACTIVE, ACTIVE → SUSPENDED, INACTIVE → SUSPENDED
ACTIVE / INACTIVE / SUSPENDED → ARCHIVED
ARCHIVED → ACTIVE (restore)
```

- Every transition validated; a reason is mandatory for anything other than
  reactivation; actor + timestamp recorded in `accountability_audit_log`.
- The identity row is updated, never deleted. History, knowledge, targets and
  assignments are untouched.
- Latest reason/actor is readable for display.

**API** — `POST /api/admin/identities/[id]/lifecycle`, `MANAGE_REVENUE_IDENTITIES`
only, requires `confirm: true`. Unknown status / missing confirm are rejected.

**Enforcement** — the canonical execution readers already return only
`status = 'active'` identities:

| Reader | Filter |
|---|---|
| `listExecutableIdentitiesForRep` | `revenue_identities.status = 'active'` |
| `listExecutableIdentitiesForOrg` | same |
| `listActiveCoveredIdentities` | same |
| `syncChannelEligibility` (eligibility writes) | same |

The profile directory now carries `status` so non-active channels stay
inspectable by admins with a status badge, while operators never see them.

**Control Center** — a `Status` action on every channel card opens a contextual
dialog showing the current state, the valid transitions from it, a reason field,
and an explicit confirm.

## Verified

- Live: a suspended channel disappears from the operator's executable scope and
  from the org scope; restore brings it back; `ARCHIVED → INACTIVE` is rejected;
  a blank reason is rejected. `operator-visibility.live.test.ts` 7/7.
- Gates: TypeScript clean, build clean, unit **397 files / 5,773 passed**.

## Not done

- The full Control Center action set (header target/split/task controls, status
  on the table density, archive/restore from the card).
- Safe deletion / duplicate review.
- Playwright journey (the dev server returned 502s under load, so the click
 -through could not be completed; the dialog and service are covered by types
  and the live enforcement test).
- Re-measurement of assignment latency after the lifecycle change.

## Integrity blocker (unchanged, needs approval)

Fizza·Upwork (`6e92e611-…`) still has an active plan and no active PRIMARY.
The scanner proposes PRIMARY Hassan; **not applied**. The hard invariant test
stays failing on purpose.
