# RELAY SALES WORKSPACE V2

Phase 7 baseline. This documents what the sales surfaces are **today**, what they
must become, and which canonical authorities the new surfaces read.

The goal is not prettier cards. It is: a rep or admin can scan, filter,
understand and act on hundreds of leads quickly.

```
Home  → tells me what needs attention
Sales → lets me operate the underlying records efficiently
```

---

## 1. CURRENT (audited)

### /leads
- **Page:** `src/app/(app)/leads/page.tsx` (server, `force-dynamic`).
- **Data source:** `loadBoardData()` (`src/lib/leads/board-rows.ts`).
  - Admin: `store.fetchLeadsAll()` — **entire org lead set**.
  - Rep: `store.listOwnedLeads()` — **entire rep book**.
  - Then `scopeLeadsToWorkspace()` filters by the active workspace identity.
- **Filters:** client-side `FILTERS` tabs (All / To Contact / Observe / Needs
  Reply / Follow-Up / Waiting / Done) + client-side search over name/company/title.
- **Pagination:** client-side `slice(0, visibleCount)` with `PAGE_SIZE = 50`
  "Load more". Not server pagination. Not cursor. Not URL.
- **Profile scope:** resolved server-side (`resolveActiveWorkspace`); the board
  itself re-derives nothing.
- **Actions:** one button per card (`Send connection` / `Reply` / `Follow up` /
  `View`). No row menu, no bulk, no owner/profile change.
- **Rendering:** `LeadsBoardV2` — grouped pipeline columns, `motion` entrance
  animations, `LeadScoreRing`, stat cards.

### /prospect
- **Page:** `src/app/(app)/prospect/page.tsx` — a **1,045-line `'use client'`
  component** implementing a single-use intake form.
- **Data source:** `POST /api/prospect/analyze` (SSE), `POST /api/prospect/save`.
- **Filters / pagination:** none.
- **Profile scope:** `useActiveIdentity()` + `workspaceIdentityForSender()`;
  sender switchable for the check only.
- **Actions:** Analyze / Try Another Angle / Copy note / Create lead / Check
  another.
- **State:** draft persisted in `localStorage` (`PROSPECT_DRAFT_KEY`) and cleared
  on successful save (BUG-23).
- **Gaps:** no tabs, no Recent / Saved / Watchlist, no list of past checks, no
  server pagination, no URL state.

### /pipeline
- **Does not exist.** No route, no page, no API.

### /archive
- **Page:** `src/app/(app)/archive/page.tsx` (server).
- **Data source:** `store.fetchLeadsAll(false, true)` filtered to `archived`,
  plus `loadConversationArchive()`.
- **Filters / pagination:** none.
- **Profile scope:** none.
- **Actions:** link to a thread / lead.

### /upwork
- **Page:** `src/app/(app)/upwork/page.tsx` (server).
- **Data source:** `store.listUpworkJobs()`.
- **Filters / pagination:** none.
- **Profile scope:** none.
- **Actions:** row link, "Extract job".

---

## 2. TARGET

```
/leads      → primary CRM workspace: header + filter bar + data table + saved views
/prospect   → Prospect workspace: Analyze | Recent | Saved | Watchlist
/pipeline   → Table | Pipeline toggle over the SAME lead data (no new model)
/archive    → unchanged data, shared header + table
/upwork     → unchanged data, shared header + table
```

Every surface uses the same four primitives: `PageHeader`, `FilterBar`,
`DataTable`, `EmptyState`. No surface owns its own table or filter code.

---

## 3. CANONICAL DATA

No new data model is introduced. The new surfaces read the existing authorities:

| Concept | Authority | Notes |
|---|---|---|
| Lead record | `leads` (via `Lead` / `LeadRow`) | `LeadRow` adds derived fields |
| Pipeline stage | `derivePipelineStage()` | **never derived locally** |
| Priority | canonical action language (`Critical` / `High` / `Normal` / `Watch`) | never raw score bands |
| Opportunity score | `Lead.canonicalScore` + `getComparableLeadScore()` | sender-independent |
| Sender match | `Lead.profileMatchScore` / `senderProfileName` | shown separately from score |
| Owner | `Lead.ownerRepId` → rep name | |
| Profile / identity | `Lead.revenueIdentityId` + `senderProfileId` | BUG-24/29/30: always visible |
| Last activity | `messages` (delivery authority) | via `loadBoardData` |
| Conversation | `messages` (conversation authority) | |
| Email delivery | `email_messages` | **not** a third store |
| Follow-up clock | `evaluateFollowUpPolicy()` | the one cadence |
| Lifecycle | `computeLifecycleState()` | cold/frozen/stale |
| Prospect checks | `captured_prospects` (`captured` \| `converted` \| `discarded`) | Recent tab source |

`derivePipelineStage`, `computeLifecycleState`, `evaluateFollowUpPolicy` and
`getComparableLeadScore` are the only places that may derive display state.
Pages and components must not re-implement them.

---

## 4. PROFILE SCOPE

One rule, already correct in `board-rows.ts` and reused everywhere:

```ts
scopeLeadsToWorkspace(leads, workspace, orgView)
```

- **Rep:** scoped to the selected profile identity. Switching profile must change
  rows, counts, filters and pagination together — no stale cache.
- **Manager:** defaults to the personal profile for the personal Sales view; may
  filter to managed team where authorized.
- **Admin:** all profiles, or a selected profile.
- **Server permissions remain authoritative.** The client never decides scope.

Profile attribution is rendered on **every** row and result:
`Profile: <name>` / `Profile not assigned`. It must never disappear between
Prospect → Lead → Lead Detail.

---

## 5. QUERY / PAGINATION MODEL

The current model is **fetch everything, filter in the browser**. That is the
defect. The target:

```
server pagination  +  stable sort  +  cursor where appropriate
```

- `/api/leads` gains `page`, `pageSize`, `sort`, `dir`, `q`, `stage`, `owner`,
  `profile`, `source`, `status`, `view`.
- Rows are filtered and counted **server-side**; the browser never holds the full
  set.
- `chunkedIn` is used for any `in.(...)` fan-out so a large org never produces a
  URL-limited or empty `in` query.
- Pagination is tested at 100 / 500 / 1000+ records — every record reachable.
- Search is server-side over person, company, title and (where permitted) email,
  debounced in the UI, and reflected in the URL (`?q=sarah`).

URL state is the contract: `?profile=…&stage=…&priority=…&q=…&page=…`. It makes
filters shareable, refresh-safe and back-button safe, with no hidden state.

---

## 6. ACTIONS

**Row click** → Lead Detail.

**Inline action** → the canonical next action for that lead.

**Overflow menu** (permission-gated): Open · Change owner · Change profile ·
Assign task · Archive · Mark won · Mark lost.

**Bulk (safe only):** Assign owner · Assign profile · Create task · Archive.
**Never bulk:** Send message · Follow up · Mark won/lost.

Prospects that are not yet saved receive **no** persistent lead tasks.

---

## 7. DEBT

| # | Debt | Resolution |
|---|---|---|
| D1 | `/leads` fetches the full lead set then filters client-side | server pagination + URL state |
| D2 | No `/pipeline` route | add as a view over `/leads` data |
| D3 | `/prospect` is a 1,045-line single-use form | split into tabs; extract shared header/filter/table |
| D4 | No shared `PageHeader` / `FilterBar` / `DataTable` | build once, reuse everywhere |
| D5 | Client-side `slice` pagination | server cursor/offset |
| D6 | No cross-surface parity fixture | add one (Leads ↔ Pipeline ↔ Detail ↔ Home ↔ Tasks ↔ Chats) |
| D7 | `LeadsBoardV2` re-derives stage/sort per card | route through `pipeline-utils` only |
| D8 | No URL state anywhere | adopt query-param contract |
| D9 | Empty states are per-component | centralize via `resolveLeadsBoardEmptyState` / `resolvePipelineEmptyState` |
| D10 | No responsive record-row model | compact card below 768px |

---

## 8. Non-goals

- No new data model for Pipeline.
- No new AI model for "stuck" signals — reuse canonical signals.
- No bulk send / follow-up / won-lost.
- No page-specific business logic.
