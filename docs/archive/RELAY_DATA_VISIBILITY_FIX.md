# Relay — Data Visibility Fix (Leads board / heatmaps / Command Center)

**Date:** 2026-10-29
**Symptom:** a rep saw 1 lead on `/leads` despite owning 133; an admin's analytics
heatmap was empty even though the org had thousands of events; "all pages" data
looked broken for both roles.

---

## Root causes (verified against production data)

### 1. PostgREST URL limit — the big one

`loadBoardData()` fetched messages with one `in('lead_id', leadIds)`. For the
org-wide board that is **761 UUIDs** in the query string. The request comes back
with **no rows and no usable error**, so `messages = []`:

- every lead lost `lastOutboundAt` / `lastInboundAt` → wrong pipeline stages,
- the dashboard's send heatmap counted **0** events,
- the board showed no last activity.

Chunking the same query by 100 returns **1,060 messages**. This single defect is
why an active org rendered as empty.

### 2. The rep board was scoped to one workspace identity

`loadBoardData()` filtered a rep's owned leads by the active sidebar identity
(`leadBelongsToWorkspace`). Madiha is assigned four identities (Fizza, Aneeb,
Madiha Irfan); the default identity was "Aneeb", so only the leads stamped with
that identity survived — **1 lead** instead of her **133**.

### 3. Command Center read a column that does not exist

`profiles` has `display_name` / `full_name`, not `identity_name`. The
`.select('id, identity_name')` returned a 400, so the sender/best-profile name
maps were empty on the admin Command Center.

---

## Fix

- **`src/lib/supabase/chunked-in.ts`** — one helper that runs an `in.(...)`
  query in chunks of 100 and concatenates. Throws on a real error instead of
  silently returning `[]`.
- **`src/lib/leads/board-rows.ts`** — messages, conversation states and sender
  profiles use `chunkedIn`; combined message rows are sorted by newest first.
- **Board visibility** — admins/owners see the organisation; a rep sees every
  lead they own. The sidebar identity is the capture context for new leads, not
  a visibility filter.
- **`src/app/(app)/leads/page.tsx`** — the header now states the real scope
  ("All N active leads in the organisation" / "N active leads you own").
- **`command-center-v2.ts`** — selects `display_name, full_name` and chunks the
  profile lookup.
- **Same chunking applied to** the admin performance API, the archive cron, the
  follow-up queue, the activity model's lead-name lookup, and the admin
  training-data queue.

---

## Verification

### Database

| Rep | Owned leads | Identity "Aneeb" leads | Action events |
|---|---:|---:|---:|
| Aneeb (OWNER) | 19 | 147 | 42 |
| Madiha (MEMBER) | 133 | — | 1,000+ |
| Hassan (ADMIN) | 105 | — | 275 |

### Before / after (browser, seeded accounts, local dev)

| Surface | Before | After |
|---|---|---|
| `/leads` as admin | header said one identity; 1 lead | **756 active leads in the organisation** |
| `/leads` as Madiha | **1 lead** | **129 active leads you own** (133 minus archived) |
| Dashboard analytics heatmap (admin) | 0 cells with data | **82 cells, 12 non-zero**, last days 84/113/70 messages |
| Dashboard analytics heatmap (Madiha) | 0 | **84 cells, 8 non-zero**, 34/29/16 messages |
| `/performance` (admin) | — | **225 actions, 6 active days** |
| `/performance` (Madiha) | — | **159 actions, 6 active days** |
| `/admin/command-center` | profile names empty / error risk | **loads, no page errors, team data present** |

### Automated

- `tests/chunked-in.test.ts` — 5 cases (empty, 100/100/50 split, order,
  concatenation, error propagation).
- Full suite: **265 files / 3,983 tests / 0 failed**.
- `tsc --noEmit` clean; `next build` clean.

---

## Status

Data visibility: **fixed and browser-verified** for an admin and a rep against
the production org. The release gates (browser matrix, auth/onboarding, SHA
parity, production smoke) are unchanged and still required before promotion.
