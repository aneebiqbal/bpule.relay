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

### 4. Setup Assistant rebuilt around presets and a builder

The Describe screen was a single textarea and produced "Nothing" for real
requests. It now opens with **one-tap presets** (Assign operators, Split targets
60/40, Set primary, Weekday schedule, Full setup) and a **structured builder**
(account, include-operators/primary/targets/schedule, searchable reps, split
presets, day presets). Presets and the builder compose a **deterministic**
preview — no model in the loop — showing before → after for the chain, target
and schedule. Free text still goes through the model.

Backend fixes:
- profile/rep resolution now strips the `[id]` / `(full name)` annotations the
  model echoes, matches full names to short display names, and uses the channel
  in the sentence to disambiguate same-named accounts;
- the model is told a 60/40 split means 60%/40% of the target and not to invent
  schedules;
- the apply path now writes parsed schedules (previously parsed but dropped).

### 5. CV upload / profile creation fixed (two root causes)

Uploading a CV failed with "The document was processed, but no profile was
created." Two independent defects:

1. **Storage download crashed.** The batch processor used the plain service
   client (`createServiceSupabase()`), which has no `.storage`, then called
   `client.storage.from('profile-sources').download(...)` →
   `Cannot read properties of undefined (reading 'from')`. It now uses
   `createProfileClient()`, which carries the Postgres storage adapter.
2. **jsonb writes failed.** Under the `postgres` provider the driver sends a JS
   array as a Postgres array literal (`{a,b}`), which is invalid JSON, so every
   profile insert failed with `invalid input syntax for type json`. The shared
   query builder now stringifies arrays/objects bound for jsonb columns
   (`writeValue` + the schema's jsonb column set), fixing profile creation,
   profile editing, knowledge edits and revenue-identity writes at once.

The wizard also surfaces the processor's real error instead of a generic
message.

Verified against the attached `Aleena_Saman_CV.docx`: parse → extraction
("Aleena Saman", Lead Software Engineer, Spark Solutions) → insert all succeed,
with the insert rolled back so no production row was written.

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
