# Backlog

Investment-grade items that are notсейчас in flight. Each entry states the
question, the why, and a concrete first step so the next person (or future me)
can pick it up without re-deriving context.

---

## Lead Detail: split / optimize `getLead` (data-shape, not prefetch)

**Status:** not started
**Created:** 2026-09-17
**Area:** `src/lib/store/supabase-store.ts` (`getLead`), `src/app/(app)/leads/[id]/page.tsx`

### Observation

`/leads/[id]` streams the shell chrome immediately (good), but the real
workspace — anchored by the company name — lands at **~1.3s** on a warm
navigation. Streaming hides that latency; it does not make it healthy.

`getLead` currently does, in order:

1. `SELECT <LEAD_COLUMNS> FROM leads WHERE id = $1` (one row)
2. `SELECT * FROM messages WHERE lead_id = $1` (all messages, all columns)
3. `SELECT * FROM outcomes WHERE lead_id = $1` (all outcomes)

Steps 2 and 3 run *after* step 1 resolves, and they return **every** message
and outcome for the lead — all columns, no limit. The company name (needed
for the `<h1>`) is available after step 1, but the function only returns after
2 and 3 finish, and the page only renders the workspace once the whole
promise resolves.

For leads with long histories this is a real, user-visible cost — and it grows
with the lead.

### Hypothesis

Lead identity + core fields (company, contact, status, score inputs) can be
decoupled from the conversation history. The timeline/messages and outcomes are
secondary content that can be fetched and rendered independently, and probably
paginated or windowed.

### Target

Core lead identity (the `<h1>` company name, status, score ring, next-action
card) in **<300ms** on warm navigation, without sacrificing canonical DB truth.

### First steps (do this before any prefetching)

1. **Measure.** Add temporary timing inside `getLead` (or query-by-query via
   the Supabase client) to confirm how much of the 1.3s is the lead-row fetch
   vs. messages vs. outcomes. Report ms + row counts + payload KB for a few
   leads of different sizes. Decide based on data, not intuition.
2. **Decouple.** Fetch the lead row + rulebook + profiles first (everything
   needed for identity + score + next-action). Render the workspace shell as
   soon as that resolves.
3. **Stream the rest.** Fetch messages (paginated or windowed) and outcomes in
   a second phase, inside their own Suspense boundary, so the timeline fills
   in independently.
4. **Paginate.** Confirm whether the timeline ever needs `SELECT *` for all
   messages, or whether a window (e.g. most recent N) plus a "load more" is
   sufficient. Outcomes are likely small enough to keep whole.

### Non-goals

- **No prefetching as the first move.** Prefetching moves the same expensive
  `getLead` earlier; it does not make it cheaper. Only consider prefetching
*after* the query itself is lean, and only if measurement still shows a gap.
- Do not denormalize or cache lead data in a way that diverges from DB truth.

### Return trigger

Revisit only if real usage confirms the ~1.3s content arrival is annoying to
actual users. Synthetic probe numbers alone are not enough to justify the
work.
