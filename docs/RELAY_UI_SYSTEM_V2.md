# RELAY UI SYSTEM V2

The reusable page system for Relay's operational surfaces. Every page that
lists, filters or acts on records uses these primitives — no page builds its own
table, filter bar or hero block.

Reference: the dense operational CRM pattern (checkbox table + sort dropdown +
saved views with counts and explanatory tooltips + page-size selector + relative
times + per-row action cluster + kanban pipeline with per-column totals).

---

## PageHeader

`src/components/ui/page-header.tsx`

```
Leads

Every active opportunity for the selected profile.

[Add lead]
```

| Prop | Purpose |
|---|---|
| `eyebrow` | Small uppercase label above the title (`Sales`) |
| `title` | Page title — one line, `text-xl`/`text-2xl` |
| `description` | One sentence, `max-w-2xl` |
| `action` | Primary action (right) |
| `secondaryAction` | Secondary action (left of primary) |
| `filters` | A `FilterBar` |
| `savedView` | A `Tabs` strip of saved views |
| `breadcrumb` | Optional nav |

No oversized hero blocks. The header is one row plus an optional meta row.

---

## FilterBar

`src/components/ui/filter-bar.tsx`

- Debounced search (250ms) — a keystroke never fires a request.
- **Holds no filter state.** Every filter is URL state owned by the page, so
  filters are shareable, refresh-safe and back-button safe.
- `children` slot for filter selects; `trailing` slot for views/export.

```
[ Search name, company or title… ] [Stage ▾] [Priority ▾] [Owner ▾]   [views]
```

---

## DataTable

`src/components/ui/data-table.tsx`

| Capability | How |
|---|---|
| Sticky header | `sticky top-0 z-10 bg-bone` on every `th` |
| Sorting | Controlled via `sort` + `onSortChange` — the page owns the URL state; the table never sorts itself |
| Filtering | The page filters server-side; the table only renders the page |
| Pagination | `footer` slot — the page renders the pager |
| Row selection | `selectable` + controlled/uncontrolled `selectedKeys` |
| Bulk actions | `bulkActions`, rendered only when a row is selected |
| Loading | `loading` renders skeleton rows in the same grid |
| Empty | `empty` slot |
| Error | `error` renders an inline alert |
| Responsive | `renderCard` renders a compact record card below `md` |
| Keyboard | Rows are focusable; Enter/Space activates; `aria-sort` on headers |

Density: `default` = 44px rows, `roomy` = 52px rows, 13px operational text.

`Column.hideBelow` collapses a column below `sm`/`md`/`lg`/`xl` via CSS
(`hidden md:table-cell`) — the mobile card carries the essential cells.

---

## Status / Priority

`src/components/ui/status-badge.tsx` + `pipeline-utils`

- **Stage** — canonical pipeline state from `derivePipelineStage()`, never
  derived per page. Labels: Qualified / Watch / Connection sent / Conversation /
  Won / Cold.
- **Priority** — canonical language from `leadPriority()`: Critical / High /
  Normal / Watch. Never a raw score band.
- **Intent** — buyer intent from `leadIntentLevel()`: HIGH / MEDIUM / LOW /
  UNKNOWN, rendered as `—` when there is no evidence. Kept visually separate
  from the opportunity score and the sender match.
- **Score** — `LeadScoreRing` (opportunity score), never confused with sender
  match.

Status is never colour-only: every badge carries a dot **and** text.

---

## Pagination

Server-side, URL state: `?page=…&pageSize=…&sort=…&dir=…`.

- The database filters, orders, counts and pages; only the current page is
  enriched.
- `pageSize` is clamped to `LEADS_MAX_PAGE_SIZE` (200).
- The pager shows the total, the current page and a page-size selector.
- Tested at 100 / 500 / 1000+ records — every record is reachable.

---

## Empty state

`src/components/ui/empty-state.tsx` + the canonical resolvers
(`resolveLeadsBoardEmptyState`, `resolvePipelineEmptyState`).

- A board with content must never say "No leads yet" just because a filter
  matched none.
- Copy is specific: "No leads match this view." / "No leads need a reply." /
  "No prospects analyzed yet."

---

## Loading

Skeleton rows in the same grid (`Skeleton` / `DataTable loading`). The shell
never blanks on a filter, sort, profile switch or page change.

---

## Overflow menu

Per-row actions in a keyboard-accessible popover (`role="menu"`, Escape closes,
outside-click closes). Permission-gated: owner/profile change only for admins.

---

## Responsive record row

Below `md` the table becomes compact cards:

```
Sarah Chen            [score]
VP Engineering · Acme
[Qualified] [Normal] [HIGH]
[Reply →]                        [⋯]
```

Name, company, stage, profile, next action. Never a 10-column table at 375px.

---

## Rules

1. No page-specific business logic — derive from the canonical owners.
2. No hidden filter state — URL state only.
3. No full-dataset fetch in the browser.
4. Profile attribution is always visible; a lead with no sender says so plainly.
5. Bulk actions are conservative: assign owner/profile, create task, archive.
   Never bulk send / follow up / mark won-lost.
