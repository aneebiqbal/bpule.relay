# Relay — Completion Ledger

Branch: `feat/relay-completion-program` (from `main` at `e0ef467f`).
Nothing pushed, nothing deployed.

## Committed on this branch

### 1. Assign People rebuilt (`src/components/coverage/manage-people-dialog.tsx`)

Replaces the flat checkbox grid with the required flow:

**current setup → edit (searchable, bulk) → review exact diff → confirm.**

| Requirement | Implementation |
|---|---|
| Current primary / operators / backups visible immediately | “Current setup” panel at the top, with avatars and seat labels |
| Searchable operator control | `Search operators…` filter with result count |
| Bulk actions with preview | `Select all` / `Clear`; preview is the review step |
| Review differences | `diffPeopleChain()` shows primary change, operators added/removed, backups added/removed/reordered |
| Prevent contradictory roles | primary excluded from operators/backups; backup add list excludes operators; payload filters `id !== primary` |
| Preserve valid multi-operator assignments | multi-select unchanged; no change → “No changes. The current setup will be preserved exactly.” |
| Explicit approval | write only on `Confirm & save` |
| Canonical writer | unchanged `POST /api/team/profiles/[profileId]/coverage` → `configureCoverage()` |

New pure module `src/components/coverage/people-chain-diff.ts` (framework-free,
unit-tested) so the UI and the tests share one change set.

## Verified

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `npm run build` | exit 0, standalone present |
| Unit suite | see release report |
| Live-DB suite | see release report |
| ESLint on changed source | 0 errors |
| Browser: dialog opens | current setup renders with avatars |
| Browser: bulk + review | “Operators added: Aneeb, Madiha, Ahmad, Dawood, anas” |
| Browser: no-change path | “No changes. The current setup will be preserved exactly.” |
| Browser: search | “mad” → “Showing 2 of 5 reps.” |
| Browser: cancel | dialog closes, no request issued |

No production write was performed during verification.

## Remaining (not done on this branch)

- P1-1 `/team/eval` has no inbound link.
- P1-2 coverage API is `isAdmin`-only while sibling assignment APIs accept
  `MANAGE_REVENUE_IDENTITIES`.
- P1-3 cold-start latency on first authenticated page load.
- Full role-based Playwright journey across admin/manager/rep (browser DOM
  checks done; no persistent Playwright suite added).
- Screenshots: the desktop browser window is not visible in this environment,
  so `browser.screenshot` refuses. DOM/HTTP evidence is used instead.
