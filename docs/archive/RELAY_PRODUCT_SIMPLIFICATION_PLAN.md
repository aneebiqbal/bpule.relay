# Relay — Product Simplification Plan (Day 6)

**Date:** 2026-10-24 · **Status:** reviewed plan — no deletion yet (implementation is next sprint, after trust work).

Every item lists imports, links, API dependencies, redirect plan and migration impact. Nothing is deleted here.

## 1. Dead page routes — REMOVE

| Route | Evidence (0 refs) | Redirect plan | Notes |
|---|---|---|---|
| `/find-jobs` | not linked from nav/palette/other pages | none | Upwork covers jobs |
| `/relay/persona-daily` | 0 refs | none | legacy |
| `/resume/generate` | 0 refs | none | CV flow unused |
| `/studio/drafts/new` | 0 refs | none | Studio v1 |
| `/admin/growth` | 0 refs | none | superseded by `/content-v2/growth` |
| `/conversations` | 0 refs | → `/chats` | duplicate surface |
| `/usage` | 0 refs | none | low value |
| `/content/growth` | 0 refs | → `/content-v2/growth` | superseded |
| `/admin` (stub) | redirects | none | keep as redirect if it redirects; else remove |
| `/admin/revenue-identities` (stub) | redirects | → `/profile-intelligence?tab=identities` | keep redirect |
| `/content/[id]` + 5 sub-routes | redirect stubs | → `/content-v2/[id]` | keep redirect if redirecting |

## 2. Dead components — REMOVE

| Component | Evidence | Notes |
|---|---|---|
| `leads/leads-pipeline.tsx` | 0 refs; page uses `leads-board-v2` | legacy pipeline |
| `leads-tab-view.tsx` | 0 refs | superseded by `leads-board-v2` |
| `public-nav.tsx`, `public-footer.tsx` | 0 refs; landing uses `landing-nav`/`marketing-footer` | remove |
| `account-settings.tsx` | 0 refs; superseded by `/account`/`/settings` | remove |
| `email-outreach-panel.tsx` | 0 refs | legacy |
| `generation-mode-selector.tsx` | 0 refs | legacy |
| `manager-team-view.tsx` | 0 refs | superseded by `rep-workspace` manager mode |
| `admin-performance-overview.tsx` | 0 refs | superseded |
| `rep/team-view.tsx`, `rep/my-day-card.tsx`, `rep/responsibility-card.tsx` | 0 refs | superseded by `rep-workspace` |
| `admin/rep-day-timeline.tsx` | 0 refs | superseded |
| 8 unused `ui/*` primitives (`avatar`, `breadcrumb`, `checkbox`, `drawer`, `inline-notice`, `page-shell`, `sparkline`, `switch`) | 0 refs | remove or re-export if shadcn needs them |

## 3. Dead lib modules — REMOVE (after import-graph + route checks)

| Module | Notes |
|---|---|
| `relay/hallucination-guard.ts` | proper-noun heuristic unused; the composer claim gate is live |
| `relay/objection-memory.ts` | unused |
| `relay/message-eligibility.ts` | UI cooldown only; superseded by the follow-up policy |
| `conversation/intelligence-engine.ts` | unused |
| `orchestration/next-action.ts` | unused; the only caller of the dead `relay/timing-engine.ts` |
| `intelligence-v3/latent-opportunity.ts` | unused |
| `scoring-v4/research-router.ts` | unused |
| `intelligence-v2/index.ts` | legacy engine entry |
| `lib/demo-extract.ts` | demo-only |
| `admin/org-command-snapshot.ts` | unused |

## 4. Superseded API families — REMOVE or REDIRECT

| Family | Status | Plan |
|---|---|---|
| `content/intelligence/{discover,forge,interview,org-themes}` | v2 live | remove v1 |
| `growth/{decision,draft,memory,publications,today}` | 0 refs | remove |
| `profile-intelligence/legacy/classify` | legacy | remove |
| `profile-intelligence/profiles/[id]/sources` | returns 410 | remove |
| `profile-intelligence/batch/**` | check refs before removing | verify |

## 5. Duplicate engines — MERGE to ONE

| Duplicate | Canonical | Plan |
|---|---|---|
| `intelligence-v2` (12 files) vs `intelligence-v3` (23) | **v3** | remove v2 after confirming `intelligence-v2/types.ts` type-only imports are re-pointed |
| `lib/score/rubric` (0–12) vs `score-v3` (0–100) | **score-v3** | stop writing `computeScore` to `leads.score`; migrate/label legacy rows; remove the writer |
| `timezone/resolve.calculateContactWindow` vs `relay/timing-engine.calculateContactWindow` | neither is a cadence | `resolve` is working-hours overlap (keep); `timing-engine` is dead (remove) |
| `studio-v2` vs `content-v2` | **content-v2** | merge; keep one content architecture |

## 6. Follow-up clocks — ALREADY MERGED (Sprint B)

`src/lib/conversation/follow-up-policy.ts` is the single authority; `relay/timing-engine.ts` is unreachable dead code (remove); the DB trigger is aligned (`20261024120001`).

## 7. Implementation order (next sprint)

1. Run the import graph + route-reference check for each REMOVE candidate.
2. Remove the dead pages with a redirect where a user-facing URL exists (`/conversations` → `/chats`, `/content/growth` → `/content-v2/growth`).
3. Remove dead components and lib modules; keep the tests that assert them, then delete the tests.
4. Merge the content/studio architectures.
5. Remove `intelligence-v2` type re-exports and the legacy scorer writer.
6. Re-run typecheck + full suite + build after each step.

**Do not delete** anything that a live route or API imports until that import is re-pointed.
