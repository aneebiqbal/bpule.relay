# Relay V3 — Content / Studio

Sprint 5 makes Content a first-class pillar alongside Home, Sales, Inbox and
Team/Work. Studio is the daily creation workspace; Ideas and Growth are its
supporting surfaces. Everything reads the existing content engine — no second
brief generator, no second trend ranker.

## Information architecture

| Primary | Secondary | Route |
| --- | --- | --- |
| Content | Studio | `/content` |
| Content | Ideas | `/content/ideas` |
| Content | Growth | `/content/growth` (admin/owner) |

Calendar is not exposed — no real schedule data exists, so it is not faked.
`/content-v2/[id]/today` and `/content-v2/growth` redirect to the V3 routes.
The old `StudioTodayV2` / `GrowthTodayV2` components are now unreferenced and
are flagged for Sprint 8 dead-code cleanup.

## Canonical sources

- `content_personas` — the rep's personas; access is own-personas plus admin.
- `daily_content_briefs` + `daily_content_ideas` — the daily brief, its
  recommended post and alternates (`idea_type` = recommended | alternate).
- `content_memories` — anti-repetition memory (`topic_covered`, `angle_used`, …).
- `content_history` — published posts (`opening_line`, `posted_at`, `platform`).
- `trend_items` + `rankTrendsForPersona` — the ranked public trend pool.
- `daily_growth_briefs` — the Relay brand account's daily post.

## Studio

`/content` resolves the persona **before** loading any brief/idea/memory
fan-out (the old `/content` loaded every persona and timed out). The page then
renders:

1. Header — persona, date, Regenerate Brief, Create Post.
2. Today's content brief — topic, angle, why now, visual direction.
3. Recommended post — the primary object, with Draft Post / Copy / Mark
   published / Try another.
4. Alternates — up to four, each reusable.
5. Trend context — source, topic, freshness, why relevant (from the idea).
6. Content memory — recently used themes and recent posts, so repetition is
   visible.

### Draft flow

`Draft Post` → `/studio/drafts/new?personaId=…&ideaId=…` creates a canonical
`content_drafts` row and opens `PostWorkspace`. The draft's caption and source
material come from `draftSourceFromIdea` — the one mapping contract.

### Feedback copy

Every write has explicit feedback: `Copy` → `Copied`, `Save draft` →
`Draft saved`, `Mark published` → `Marked published`
(`src/lib/content/studio-feedback.ts`).

## Ideas

`/content/ideas` lists `daily_content_ideas` for the selected persona with
URL-backed views (Today / Recent / All) and filters (Persona, Topic, Source,
Status). Status derives only from canonical columns: `posted_at` → Posted,
`copied_at` → Used, otherwise the idea type. Rows deep-link to the draft
workspace.

## Growth

`/content/growth` is admin/owner only (the existing contract). It reads the
canonical growth brief and the ranked Relay brand trends, and renders the
recommended post, alternates, a trend list and the privacy guard: Growth drafts
from public trend signals and the brand persona — never private conversations
or personal profiles.

## Navigation

- Sidebar: Content sits between Team and Insights.
- Section rail: Studio, Ideas, Growth.
- Mobile: Content is a primary destination.
- Cmd-K: Open Studio, Create Post, Open Ideas, Open Growth.

## Tests and fixtures

- `tests/v3-content.test.ts` — the named Sprint 5 fixtures
  (`V3_STUDIO_*`, `V3_IDEAS_*`, `V3_GROWTH_*`, nav and parity gates).
- `tests/fixtures/v3-content-fixtures.ts` — realistic technical content: a
  recommended post, four alternates, trends, memories, recent posts, a used
  idea, a posted idea and a fallback idea.

## Known gaps

- Content performance (posts created/published, consistency) is not shown
  because engagement metrics are not stored; no invented numbers.
- No content calendar/heatmap — no real schedule data.
- Live Neon Auth certification and the browser screenshot matrix are separate
  from fixture QA.
