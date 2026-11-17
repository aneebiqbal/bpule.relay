# Relay — Completion Ledger

Branch: `feat/relay-completion-program` (from `main` at `e0ef467f`).
Pushed for review; not merged; not deployed.

## Committed on this branch

### 1. Coverage capability parity (visible-control 403)

`/team/profiles` is reachable by managers, and it rendered “Assign operators”
for them, but `POST /api/team/profiles/[profileId]/coverage` returned 403
because it required `isAdmin` while the sibling bulk-assignment, knowledge and
history writers accept `MANAGE_REVENUE_IDENTITIES`.

- the coverage writer now accepts `can(ctx, 'MANAGE_REVENUE_IDENTITIES')`;
- `PersonProfilesWorkspace` / `TeamProfilesTable` take `canManageIdentities` and
  hide every identity write (assign people, add account/profile) from roles that
  cannot write;
- `/team/profiles` computes the flag from the organization role + capability.

### 2. Assign People rebuilt (`src/components/coverage/manage-people-dialog.tsx`)

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

### 3. Real LinkedIn / Upwork brand marks on every profile mention

`ChannelBadge` — the one component that names a channel — used generic Lucide
icons (`Users`, `Briefcase`). The official Simple Icons glyphs (LinkedIn
`#0A66C2`, Upwork `#6FDA44`) are now the single brand source in
`channel-logo.tsx`, and `ChannelBadge` renders them. Text-only channel mentions
were replaced with the badge on: Team command center (operator + profile
matrix), People profiles workspace, profile detail identity list, profile
switcher, responsibility workspace header, and the Manage People dialog
subtitle. `Dialog` titles accept a node so the Transfer/Remove dialogs can carry
the mark.

Native `<select>` options (Upwork profile picker, target manager, channel
filter) keep text labels — options cannot render SVG consistently.

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
- P1-3 cold-start latency on first authenticated page load.
- Full role-based Playwright journey across admin/manager/rep (browser DOM
  checks done; no persistent Playwright suite added).
- Screenshots: the desktop browser window is not visible in this environment,
  so `browser.screenshot` refuses. DOM/HTTP evidence is used instead.
