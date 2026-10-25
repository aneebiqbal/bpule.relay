# Relay — job engine port architecture

Target: `/Users/mac/Desktop/products/scout` (work codename **Relay**).
Source to port: `/Users/mac/Desktop/relayjobsapply/leadengine` (Cloudflare Worker).

---

## 0. The good news: Relay already has the extension point

Relay's `src/lib/jobs/` is a **provider architecture** — the same shape the catalogue needs.
Adding a source is one small file plus one registry line. You do not need a new system.

```ts
// src/lib/jobs/provider-types.ts — the contract every source implements
export interface JobProvider {
  meta: ProviderMeta            // { id, name, requiresCredentials, configured }
  search(params, opts?): Promise<ProviderSearchResult>
  parseResponse(raw, params): Job[]   // pure — used by tests and mock mode
  buildUrl(params, page?): string     // used by smoke tests
}
```

Existing layers that are already correct and should be reused unchanged:

| File | Role |
| --- | --- |
| `src/lib/jobs/index.ts` | `searchJobs()` — orchestrates the whole pipeline |
| `src/lib/jobs/aggregate.ts` | runs all providers concurrently, isolates per-source failures |
| `src/lib/jobs/deduplicate.ts` | cross-source dedupe |
| `src/lib/jobs/filters.ts` | hard filters (remote, age, salary, location) |
| `src/lib/jobs/rank-jobs.ts` | pure-arithmetic scoring |
| `src/lib/jobs/match.ts` | AI ranking pass over the top N |
| `src/lib/jobs/search-query.ts` | CV/profile → provider query set |
| `src/lib/jobs/salary.ts`, `location.ts`, `normalize.ts`, `attribution.ts` | normalisation |
| `src/lib/jobs/config.ts` | env-driven credentials, timeouts, limits |
| `src/lib/jobs/mocks/*.json` | fixture per provider for tests + demo mode |
| `src/lib/jobs/providers/` | 8 adapters: adzuna, arbeitnow, himalayas, jobicy, remoteok, remotive, themuse, usajobs |
| `src/lib/upwork-v2.ts` | full Upwork job model + application model (896 lines) |

**8 providers today. The catalogue adds ~120.**

---

## 1. Gap analysis — what you asked for vs what exists

| You asked for | Relay today | Gap |
| --- | --- | --- |
| Scrape the best jobs daily | 8 providers, **on-demand search only** | no scheduler, no persistence, no incremental cursors |
| 100+ internet resources | 8 providers | ~120 adapters to write (Tier A-D first) |
| Match against my profile | `rank-jobs.ts` + `match.ts` + `search-query.ts` | **exists** — reuse as-is |
| One-click apply | Upwork `apply` route (cover letter + answers) | generic apply + non-Upwork apply |
| Applied tracking ("we applied to this") | nothing | new `job_application` model + UI |
| Job detail page | `/find-jobs` list only | `/jobs/[id]` detail |
| See it in Relay | `upwork_jobs` table | generic `job` table |
| Reps see it | org-scoped (multi-tenant foundation exists) | RLS on the new tables |

The pipeline is the easy half. The **scheduler + persistence + apply loop** is the real build.

---

## 2. Target architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  UI (Next.js App Router)                                        │
│  /find-jobs  ·  /jobs/[id]  ·  /my-applications  ·  /docs/jobs  │
└───────────────┬─────────────────────────────────────────────────┘
                │ server actions + API routes
┌───────────────▼─────────────────────────────────────────────────┐
│  Match & rank            searchJobs() → rank-jobs → match       │
│  (exists, extend)                                                │
└───────────────┬─────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────┐
│  Persistence (Supabase Postgres + RLS)                          │
│  job · job_application · job_source_state · rep_profile        │
└───────────────┬─────────────────────────────────────────────────┘
                │ write on collect / read on search
┌───────────────▼─────────────────────────────────────────────────┐
│  Collector (queue worker)                                       │
│  pick due sources → call provider → normalize → dedupe → insert│
└───────────────┬─────────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────────┐
│  Provider registry (src/lib/jobs/providers/*)                  │
│  8 today → 130 in the catalogue                                 │
└─────────────────────────────────────────────────────────────────┘
```

### The five layers

**L1 — Providers.** One file per source, same contract. Credential sources set
`requiresCredentials: true` and `isConfigured: () => bool`; the aggregator already returns
`not_configured` instead of failing. **Do not special-case anything.**

**L2 — Collector (new).** The only genuinely new subsystem. Picks the sources that are due,
pulls them incrementally, normalizes, dedupes, inserts. Runs in a worker, not a request.

**L3 — Persistence (new).** Canonical `job` table + `job_application` + `job_source_state`.

**L4 — Match & rank (exists).** Unchanged. Keep scoring pure arithmetic; AI only re-ranks the top N.
Relay's stated philosophy — "scoring as pure arithmetic, zero model tokens" — stays true.

**L5 — UI.** List, detail, applied board, source health.

---

## 3. Data model additions

```sql
-- Canonical job. One row per (source, source_job_id) across all providers.
create table job (
  id            uuid primary key default gen_random_uuid(),
  source        text not null,              -- JobSource
  source_job_id text not null,
  title         text not null,
  company       text,
  company_logo  text,
  url           text not null,              -- source page
  apply_url     text,                       -- where the button points
  description   text,
  skills        text[] default '{}',
  location_raw  text,
  remote        boolean,
  salary_min    numeric, salary_max numeric, salary_currency char(3),
  posted_at     timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  closed_at     timestamptz,                -- disappeared from the board = filled
  raw           jsonb,                      -- provider payload, for debugging
  unique (source, source_job_id)
);
create index on job (posted_at desc);
create index on job (company);
create index on job using gin (skills);

-- Per-source pull state: the incremental cursor + health + throttle.
create table job_source_state (
  source        text primary key,
  enabled       boolean not null default true,
  interval_secs integer not null default 3600,   -- throttle
  daily_cap     integer,                          -- provider-specific ceiling
  cursor        text,                             -- provider cursor (page/after/since)
  last_pulled_at timestamptz,
  last_ok_at     timestamptz,
  last_error     text,
  consecutive_failures integer not null default 0,
  pulls_24h     integer not null default 0,
  jobs_24h      integer not null default 0
);

-- What a rep did with a job. The "we applied to this" record.
create table job_application (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organization(id),
  rep_id      uuid not null references rep(id),
  job_id      uuid not null references job(id),
  status      text not null default 'shortlisted',
                -- shortlisted | applied | replied | interviewing | rejected | ignored
  method      text not null default 'manual',  -- upwork | email | external | one_click
  applied_at  timestamptz,
  note        text default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (rep_id, job_id)
);
```

Retention: `closed_at` or 90 days unseen → archive. `raw` payload is the first thing to drop
when the table grows.

---

## 4. The collector (L2) — the real build

```ts
// src/lib/jobs/collect.ts
export async function collectDueSources(opts: { maxSources?: number; now?: Date }) {
  const due = await db.query(`
    select * from job_source_state
    where enabled and (last_pulled_at is null or last_pulled_at < now() - interval '1 second' * interval_secs)
    order by last_pulled_at nulls first, last_pulled_at
    limit $1`, [opts.maxSources ?? 6]);

  for (const state of due) {
    const provider = providerFor(state.source);
    if (!provider) continue;
    try {
      const res = await provider.search(paramsFor(state.source), { cursor: state.cursor });
      const jobs = deduplicateJobs(res.jobs);
      await upsertJobs(jobs);                       // on conflict (source, source_job_id)
      await advanceCursor(state, res.nextCursor);   // incremental, not a full re-pull
    } catch (e) {
      await recordFailure(state, e);                // consecutive_failures → auto-disable after N
    }
  }
}
```

Scheduling options, in order of preference for Relay:

| Option | Why |
| --- | --- |
| **Trigger.dev** (or Inngest) | durable, retryable, cron + per-source tasks, no infra |
| **pg_cron** + a small Node worker | stays in Supabase, no new vendor |
| **Vercel Cron** hitting `/api/jobs/collect` | simplest, but serverless timeouts bite on 100+ sources |
| Cloudflare Worker | you already have one written — but it has no API to feed Relay |

Recommendation: **Trigger.dev** (or Inngest) for the worker, Vercel Cron as a thin trigger.
Collect in batches of 5-10 sources per tick, each with its own retry.

**Throttle, don't hammer.** `job_source_state.interval_secs` + `daily_cap` per source.
Defaults: JSON boards 3600 s, Reddit 1800 s, GitHub Search 600 s (10/min unauth), ATS boards 86400 s.

---

## 5. Adding a source — the actual recipe

1. `src/lib/jobs/providers/<source>.ts` — implement `defineProvider({...})`, copy
   `remoteok.ts` as the template (~50 lines).
2. Add the id to the `JobSource` union in `src/lib/jobs/types.ts`.
3. Register in `src/lib/jobs/providers/index.ts` (import + `allProviders` array).
4. Add env accessors in `config.ts` if it needs credentials.
5. Add a fixture in `src/lib/jobs/mocks/<source>.json`.
6. Seed `job_source_state` with the right throttle.
7. Test with `vitest` — `parseResponse` is pure, so the adapter test is a fixture assertion.

**Start with Tier A + Tier B + Tier D**: ~25 keyless JSON boards, 4 ATS endpoints, 22 Reddit
boards, GitHub Search. That is ~50 sources with zero credentials and no scraping.

---

## 6. Apply + applied tracking

Three apply methods, in increasing order of ambition:

| Method | What it does | Risk |
| --- | --- | --- |
| **external** | records the application, opens the apply URL | none — honest |
| **email** | records + sends the draft from the lead page | low |
| **one_click** | Playwright submits the form using the rep's logged-in session | ToS-sensitive, fragile |

**Default to `external`.** "Click apply" records intent and opens the page — no fake claims, no
ToS violation. Relay already has Playwright (`e2e/job-application.spec.ts` exists), so
`one_click` is a real opt-in later, per-rep, with an explicit acknowledgement.

Detail page (`/jobs/[id]`):
- full JD, skills, salary, location, remote
- match breakdown (reuse `rank-jobs.ts` output) + which proof points match
- source health + when it was first seen
- **Apply** button → `job_application` row (`status: applied`, `method`, `applied_at`)
- applied timeline (shortlisted → applied → replied → interviewing)
- note field
- "ignored" / "rejected" so the list stops showing it

---

## 7. Constraints to design around

| Constraint | Handling |
| --- | --- |
| Reddit 100 req/10 min | throttle, cache, dedupe before insert |
| GitHub Search 10 req/min unauth | throttle; a PAT raises it to 30/min |
| ATS boards 404 on bad slugs | auto-disable the row (leadengine already does this) |
| Scraping ToS | prefer JSON/RSS; document the decision per source |
| Storage growth | `closed_at` / 90-day retention; drop `raw` first |
| AI cost | keep scoring pure; AI only re-ranks the top N (`aiMatchCandidateCap`, default 50) |
| Multi-tenant | RLS on `job_application` by `org_id` (multi-tenant foundation exists) |
| Demo mode | keep `mocks/*.json` — the whole pipeline must run with zero credentials |

---

## 8. Phased build plan

**Phase 1 — generic the jobs table (1-2 days).**
Migrate `upwork_jobs` → canonical `job`. Keep the Upwork routes working against it.
No new sources yet. This is the foundation everything else needs.

**Phase 2 — collector + cursors (2-3 days).**
`job_source_state`, `collectDueSources`, a cron trigger, failure auto-disable, retention.
Verify against the 8 existing providers first.

**Phase 3 — apply loop (2 days).**
`job_application`, `/jobs/[id]`, apply button, applied board. Start with `external` only.

**Phase 4 — source blitz (1-2 days per batch).**
Tier A (25 boards) → Tier D (22 Reddit) → Tier B (4 ATS + watchlist discovery) → Tier C
(GitHub Search, good-first-issue, bounties) → Tier G (hackathons/grants).
Batch by tier so you always have a working system.

**Phase 5 — one-click apply (later, opt-in).**
Playwright persistent context per rep, explicit consent, audit log of every submission.

**Phase 6 — signals + velocity (from leadengine).**
`job_source_state` already gives per-source counts. Add board-size snapshots (like
`watch_snapshot`) to show "they are hiring faster/slower" — leadengine's closure detection
transfers directly.

---

## 9. What NOT to do

- Do not keep leadengine as a second system. Port it; running two collectors against the same
  sources doubles the rate-limit pressure for nothing.
- Do not add providers before the collector exists — 100 providers with no persistence is a
  very slow search page.
- Do not make scoring call a model. `rank-jobs.ts` is pure arithmetic and that is a feature.
- Do not scrape freelance marketplaces (Tier F) — no public API and explicit ToS.
- Do not let "one click" mean an unverifiable claim. Record what actually happened.
