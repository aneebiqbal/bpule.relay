# Relay Sales Query Egress Audit — Phase 7.5

> **Date:** 2026-11-01  
> **SHA context:** Phase 7.5 closure  
> **Rule:** list pages fetch only required columns; no message bodies / embeddings / raw source on list paths.

---

## `/leads` table — `loadLeadsPage` → `listLeadsPage`

| Field | Value |
|---|---|
| columns | `LEAD_LIST_COLUMNS` via store (identity, status, scores, owners — not message bodies) |
| row limit | pageSize ≤ 200 (`LEADS_MAX_PAGE_SIZE`) |
| pagination | PostgREST `.range` + `count: exact` |
| estimated payload | ~pageSize × ~1–2 KB ≈ ≤ 400 KB/page |
| egress risk | **Low** on happy path. **Medium** when derived stage/priority forces `fetchLeadsAll` then in-memory page |

Mitigation: prefer column filters + DB pagination; derived filters document the tradeoff.

---

## Enrichment — `enrichLeads`

| Field | Value |
|---|---|
| columns | messages: `lead_id, sent_at, created_at, sent_text, direction, type`; conversation_states: `lead_id, followup_count`; assigned_tasks: `lead_id` only |
| row limit | current page lead ids only |
| pagination | `chunkedIn` — no giant `in(...)` |
| estimated payload | page × messages (bounded by chunk) |
| egress risk | **Medium** if `sent_text` retained for last outbound/inbound snippets — needed for Next Action; never loads embeddings |

---

## Pipeline — `loadBoardData`

| Field | Value |
|---|---|
| columns | same enrichment as table |
| row limit | full scoped set (org or profile) |
| pagination | none (representation toggle) |
| estimated payload | org-wide can be large |
| egress risk | **High** for large orgs — same historical risk as pre-Phase-7 board. Prefer table as default dense view |

---

## `/api/tasks` + assigned task counts

| Field | Value |
|---|---|
| columns | task metadata only (title, status, due, ids) — no conversation content |
| row limit | scoped open/completed lists |
| egress risk | **Low** |

---

## Forbidden on list paths

- `select *` on leads with JSON blobs
- embeddings / vector columns
- full message history for every lead on first paint
- unchunked `in.(uuid×N)` over hundreds of ids

---

## Follow-ups

1. Add DB-expressible stage materialization only if product owns a single writer.
2. Cap pipeline org board or force server pagination for admin pipeline.
3. Keep `LEAD_LIST_COLUMNS` as the allowlist; expand only with egress review.
