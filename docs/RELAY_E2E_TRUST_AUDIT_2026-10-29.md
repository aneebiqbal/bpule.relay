# Relay — End-to-End Trust Audit (2026-10-29)

**Goal:** every surface tested as a real user against production data, no mock
or demo fallbacks, and every fix verified by saving and reading back.

**Production:** `https://bpule-relay.vercel.app`
**Code SHAs:** data-visibility `59868f5`, Studio `a47965c`, hydration `e9e681c`.

---

## Method

1. **Route crawl** — `scripts/qa/feature-audit.mjs` logs in as an admin and a rep
   and visits every surface (53 admin routes, 46 rep routes), capturing HTTP
   status, final URL, page errors, console errors, error-boundary text,
   mock/placeholder text, heading and text length.
2. **Data smoke** — `scripts/qa/data-smoke.mjs` checks the board count and the
   analytics/activity heatmaps for both roles.
3. **Save smoke** — `scripts/qa/save-smoke.mjs` creates a real test lead through
   the live API, reads it back, then deletes it.
4. **Studio generate** — exercised the live `POST /api/content/.../daily-brief`.
5. **Database hygiene** — counted and removed only provably test rows.

---

## Real defects found and fixed

### 1. Large `in.(...)` queries silently returned nothing (already deployed `59868f5`)

The org board passed 761 lead ids into one PostgREST `in.(...)`. The request
returned no rows, so the board, stages and analytics heatmap looked empty.
Chunking by 100 returns 1,060 messages. Fixed with `chunkedIn` across the board,
admin performance, archive cron, follow-up queue, activity names and training
data.

**Verified:** admin board **756 → 716** active org leads (after test cleanup);
rep board **1 → 126** (Madiha); analytics heatmap **12 active days**; activity
heatmap **175 actions** (admin) / **154** (rep).

### 2. Studio `/content` took ~45s (deployed `a47965c`)

The page loaded every persona's clusters, drafts, history, feedback and research
before redirecting to the daily workspace. It now redirects first.

**Verified:** `/content` opens `/content-v2/<persona>/today` in ~8s (was a 45s
timeout) and renders the persona header.

### 3. Studio generation (verified)

`POST /api/content/intelligence/v2/daily-brief` → **200, 4 ideas, brief row
created** for Usman Ali. The AI path made real OpenAI calls but returned zero
ideas for this persona, so the deterministic engine produced the four ideas
(`fromFallback: true`). The generated rows were removed after the check.

### 4. Team board hydration (`e9e681c`)

`TeamLiveBoard` seeded `now` with `Date.now()` on both server and client, so the
relative-time text differed and React raised #418. It now takes the server clock
as `initialNow`.

---

## Fake / test data removed from production

Only rows with explicit test provenance were touched; anything ambiguous was
kept.

| Data | Rows | Evidence |
|---|---:|---|
| E2E leads (QA Inbound/Terminal/No Thread/Score Parity/NorthPeak) | 47 | `is_test=true`; children reclassified only when the raw input was a QA fixture |
| E2E captured prospects (NorthPeak) | 4 | `is_test=true`; 16 shadow decisions reclassified |
| E2E child rows | 281 | sample events, shadows, action events, states, messages, runs, samples |
| Test content personas (`QA Deploy`/`Debug` + epoch) | 15 | no drafts/history/findings/feedback; 2026-10-21 QA window |
| Test content profiles / briefs / ideas | 15 / 15 / 9 | children of those personas |
| QA/Demo leads (`QA Horizon`, `QA Northstar`, `QA Atlas`, `QA Summit`, `Demo QA`, `NorthPeak Logistics`) | 6 | QA fixtures with no real conversation |
| QA samples / shadow decisions for those leads | 3 / 12 | AI-only, no human labeler |

**Final state:** `leads 716` (0 `is_test`), `captured_prospects 1000` (0
`is_test`), `intelligence_samples 758` (0 `is_test`), `content_personas 7` (all
real names).

**Kept for manual review:** `863d9665…` "QA Atlas Technologies. We are actively
looking for" — it has a real-looking five-message conversation and a `replied`
outcome, so it was not deleted.

---

## Save-path verification

`scripts/qa/save-smoke.mjs` against production:

```
POST /api/prospect/save        201
persisted.is_test              true
persisted.source_kind           E2E
persisted.owner_rep_id         Madiha
GET /leads/<id>                company rendered
cleanup                        deleted (ok: true)
```

---

## Route audit results

- **No error boundary** ("Something went wrong" / "Application error") on any
  surface.
- **No mock/placeholder text** found in rendered pages.
- The `null`/`ERR_ABORTED` entries are expected redirects: `/accountability` →
  `/admin/accountability` (admin), `/account` → `/settings`, `/admin` →
  `/admin/command-center`, and every `/admin/*` → `/dashboard` for a rep.
- Client-fetched pages (`/admin/targets`, `/admin/growth`,
  `/profile-intelligence/<id>`, `/rep/assigned-profiles`) render content once
  given a 5–6s settle; they were not broken, the first crawl was too early.

---

## Residual / known

1. **React #418 on the rep dashboard** — intermittent hydration mismatch from
   relative-time text computed with `Date.now()` in several client components.
   Cosmetic (client recovers, data is correct); the team board instance is fixed.
2. **Test reps** — `Verify User`, `Verify DC`, `rep`, and numeric admin names
   still exist. They are auth users, so they were not deleted without sign-off.
3. **Empty-by-data features** — `upwork_applications`, `email_messages`,
   `proof_items`, `day_closes` are 0 because no contracts/applications/proof
   exist, not because the pages error. The app falls back to
   `daily_targets`/`daily_accountability`.
4. **Migrations** — still cannot run from this environment (no
   `SUPABASE_DB_PASSWORD`; management token is an encrypted keyring blob).

---

## Verification

| Gate | Result |
|---|---|
| `tsc --noEmit` | PASS |
| `next build` | PASS |
| Full tests | **265 files / 3,983 tests / 0 failed** |
| Production `/api/version` | `e9e681c` |
| Admin production smoke | 716 leads, 12 heatmap days, 175 actions, Command Center OK, 0 page errors |
| Rep production smoke | 126 leads, 8 heatmap days, 154 actions, 1 hydration warning |
| Save smoke | 201 → persisted → readable → deleted |
| Studio generate | 200 → 4 ideas → cleaned up |
| Test data remaining | 0 flagged test leads/prospects/samples/personas |
