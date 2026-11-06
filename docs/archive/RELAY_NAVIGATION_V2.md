# RELAY NAVIGATION V2 — Sales surfaces

Phase 7.27. The canonical routes for the sales workspace, what replaced what,
and what is intentionally kept rather than hard-deleted.

---

## Canonical routes

| Route | Surface | Data authority |
|---|---|---|
| `/leads` | Leads table (default) | `listLeadsPage` + `enrichLeads` |
| `/leads?view=pipeline` | Pipeline board | `loadBoardData` (same leads) |
| `/leads/new` | Manual lead entry | `POST /api/leads` |
| `/leads/import` | Bulk import | `POST /api/leads/import` |
| `/leads/[id]` | Lead detail | `GET /api/leads/[id]` |
| `/prospect` | Prospect workspace → Analyze | `POST /api/prospect/analyze` |
| `/prospect?tab=recent` | Prospect workspace → Recent | `captured_prospects` |
| `/prospect?tab=saved` | Prospect workspace → Saved | leads matched to converted captures |
| `/prospect?tab=watchlist` | Prospect workspace → Watchlist | canonical observe stage |
| `/archive` | Conversation archive + archived leads | `fetchLeadsAll(false, true)` |
| `/upwork` | Upwork jobs | `listUpworkJobs` |

---

## Replacements

| Old | New | Why |
|---|---|---|
| `/leads` as a client-side board | `/leads` as a server-paginated table | fetch-everything-then-filter was the defect (D1) |
| `/leads` board stage labels | one `STAGE_LABELS` vocabulary | the table and the board must not disagree |
| `/prospect` as a single-use form | `/prospect` as a tabbed workspace | the form had no history, no saved set, no watchlist |
| prospect hero header | workspace `PageHeader` | no oversized hero blocks |

---

## Kept, not deleted

- `/leads?view=pipeline` — the board is a representation of the same leads, not
  a second data model. Deleting it would remove the grouped view users rely on.
- `/archive` — unchanged data, now reachable from the shared header.
- `/upwork` — unchanged data.
- The prospect draft in `localStorage` — a completed analysis must not resurrect
  (BUG-23); the draft is cleared only after the server confirms the save.

---

## No redirect needed

`/pipeline` never existed as a route, so there is nothing to redirect. The
Pipeline surface is the `/leads?view=pipeline` toggle.

---

## Rules

1. One canonical route per surface; a representation is a query param, not a route.
2. Never hard-delete a surface until nothing links to it.
3. Profile attribution travels with the record across every route.
