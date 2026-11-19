# Relay Job Intelligence v4 — Pakistan-first proactive job hunter

**Branch:** `feat/relay-job-intelligence-v2`
**Date:** 2026-11-20
**Status:** staging browser-verified on Aiven; production schema migrated and reindexed; code **not deployed, not merged**.

This is the v4 activation record. It reports what changed, what was measured against real data, and what remains external.

---

## 1. Mission

Turn Job Intelligence from a passive board into a proactive, Pakistan-first remote job hunter: discover, verify, match, prepare a tailored CV / application package, and deliver a small daily shortlist — without a new paid service, database, queue, search server or VPS.

Hard rules carried through v4:

- Pakistan eligibility is read from the **job posting** and from the **Relay profile**. Nationality / work authorization is never inferred; unknown eligibility goes to review.
- Default recommendations must be remote, confirmed-eligible, verified, fresh and correctly profiled.
- Submission always requires explicit human confirmation.
- Saved jobs, applications, documents and events are never deleted by automation.

---

## 2. What changed

### 2.1 Pakistan-first eligibility (`src/lib/job-discovery/eligibility.ts`)

`classifyRemoteEligibility` now returns a `pakistan` verdict with its own classification and evidence:

| Evidence | Verdict |
|---|---|
| Posting names Pakistan / Pakistani | eligible, confirmed |
| Named country list (no PK) | not eligible, confirmed |
| Named country list (includes PK) | eligible, confirmed |
| Region APAC only | eligible, likely |
| Region list without APAC (EU/EEA/EMEA/NA/LATAM/AFR/MEA) | not eligible, confirmed |
| Mixed regions incl. APAC | unknown → review |
| Timezone boundary | unknown → review |
| Explicit worldwide language | eligible, likely |

Precedence mirrors the existing main classifier: a named country or region boundary outranks a "worldwide" phrase, so marketing boilerplate ("we help entrepreneurs from anywhere in the world") cannot mask a real restriction. `evaluateEligibility` rejects a PK seeker when the posting confirms Pakistan is excluded.

### 2.2 Non-destructive inventory reindex (`src/lib/job-discovery/inventory.ts`)

New `job_inventory_index` table + `GET /api/cron/job-inventory`. Every job is bucketed:

- `recommended` — remote, `verified_open`, Pakistan-eligible, engineering, ≤ 90 days old
- `eligible_low` — eligible but not the strict recommended set
- `eligibility_unknown` — included for review, never recommended
- `location_restricted`, `stale_unverified`, `duplicate`, `not_remote`, `closed` — excluded

No job row is deleted or mutated by the bucket computation. The reindex also refreshes `jobs.eligibility` so new eligibility dimensions reach existing rows without a full re-ingest. It writes `jobs.eligibility` only when the JSON actually changed.

### 2.3 New sources (`src/lib/job-discovery/adapters.ts`, `20261120130000_more_sources.sql`)

- **Himalayas** — cursor-paginated feed, location/timezone restrictions, salary, categories.
- **Jobicy** — engineering feed, geo / level / industry, salary.
- **Arbeitnow** — evaluated and left **disabled** (Germany-centric, low Pakistan eligibility). Recorded so the decision is auditable.

Both new feeds are remote-only boards: their location / timezone bounds are recorded in `location_raw` but do not mark a role onsite (`remote = true`). Himalayas timezone offsets are appended as `UTC±n` so the eligibility classifier can see them.

ATS boards (Greenhouse / Ashby) keep a larger bounded detail budget (`detail_limit: 800`).

### 2.4 Matching normalization (`src/lib/jobs/rank-jobs.ts`)

`tokenizeSkill` splits `Rails/React`, `Node.js`, `C#`, `K8s` into normalized tokens and aliases, so a job requiring `Rails/React` matches a CV with `Ruby on Rails` + `React`. Skill gaps use the same normalization. `MATCH_SCORE_VERSION` bumped to 2 so every stored match recomputes under the new eligibility semantics.

### 2.5 Daily shortlist

New **Ready Today** view (`/jobs?view=shortlist`, the default) reads the inventory index (`recommended` + `eligible_low`), ranks by stored match, and shows the Pakistan verdict. The nav exposes it under **Discover**.

### 2.6 Freshness (`20261120140000_job_freshness_columns.sql`)

`content_changed_at` and `source_updated_at` distinguish "we saw it again" from "the content actually changed". Cards use a live relative-time component.

### 2.7 Application-destination safety (`src/lib/job-discovery/url.ts`)

`isSafeApplicationUrl` allows only public `http(s)` hosts. Loopback, RFC1918, link-local and non-http destinations are rejected at ingest and disable the "Open official application" button. This prevents a malicious feed from turning the button into an SSRF probe.

### 2.8 Preparation polish

- PDF / DOCX resumes now render real headings and bullets (bold, indented) instead of a flat text dump.
- New `zip` download bundles CV (PDF + DOCX), cover letter, LinkedIn note and the human checklist.
- Job detail shows the **Pakistan verdict** and a six-step pre-submission checklist. Submission remains human-confirmed.

---

## 3. Real data results

Both databases: 196 → **197 migrations** applied (`applied=1 skipped=196 failed=0` on the last one).

Production `relay_prod_final` reindex (1,430 jobs):

```text
location_restricted 416   not_remote 746   stale_unverified 77
duplicate 130             eligibility_unknown 48   eligible_low 13
recommended 0            included 61
```

Staging `relay_staging` reindex (1,450 jobs):

```text
location_restricted 434   not_remote 744   stale_unverified 78
duplicate 130             eligibility_unknown 51   eligible_low 13
recommended 0            included 64
```

Himalayas / Jobicy rows were backfilled to `remote = true` after the adapter
fix (a remote board's location bound is not an onsite role): 49 rows on
staging, 41 on production.

`recommended` is empty because only ATS boards are `verified_open` and every ATS role in the current pipeline is either country-restricted or non-engineering. The shortlist therefore serves the 13 `eligible_low` roles, each badged `Recently seen` — honest, not invented.

`shortcut: feed jobs are recently_seen, not employer-verified; only ATS boards are verified_open. Upgrade when a bounded apply-URL verification sweep exists.`

---

## 4. Browser acceptance evidence

Script: `scripts/qa/job-intelligence-v4-acceptance.mjs`. Screenshots: `qa-artifacts/staging-v4/`.

Real Chromium against `relay_staging`:

```text
login ok: /dashboard
shortlist cards: 13
shortlist view active: true
for-you cards: 24
job detail: Software Engineer - Auth
checklist present: true
eligibility evidence present: true
apply button disabled (no safe destination): false
```

The shortlist shows only `Worldwide remote` roles; the detail page shows the eligibility reasoning, the Pakistan verdict, the match breakdown and the pre-submission checklist.

---

## 5. Gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` (changed paths) | 0 errors |
| `vitest run` | **5,860 passed**, 5 skipped (409 files) |
| `next build` | pass |
| Migrations | 197 on staging and production, 0 failed |
| Staging browser | pass (§4) |

New tests: `tests/job-inventory.test.ts` (buckets incl. onsite exclusion), `tests/job-application-url.test.ts` (SSRF guard), plus Pakistan precedence and skill-normalization cases.

---

## 6. Security / data verification

- `job_inventory_index` has RLS enabled with a select policy for `authenticated` / `service_role`; the reindex route is under the allowlisted `src/app/api/cron/` prefix and gated by `CRON_SECRET`.
- No production row was deleted. The reindex only inserts/updates the index and `jobs.eligibility`.
- Saved jobs, applications, documents and events were not touched.
- **External action still required:** the `avnadmin` credential exposed in the earlier chat must be rotated in the Aiven console. The app uses `relay_app` / `relay_service`.

---

## 7. Deployment

```bash
# 1. migrations (idempotent)
SERVICE_DATABASE_URL=... bash scripts/apply-pending-migrations.sh

# 2. install / refresh the two timers (discovery + inventory)
bash deploy/install-job-discovery.sh

# 3. initial index (the timer also does this every 15 min)
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/job-inventory?dryRun=1"   # counts only
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/job-inventory"
```

Rollback: `sudo systemctl disable --now job-inventory.timer`; the index is derived data and can be left in place. Revert the code commit; the `job_inventory_index` table and the two new columns are additive and harmless.

---

## 8. GO / NO-GO

**GO for merge and staging deploy.** The build, tests, migrations and browser pass are green, and the index is non-destructive.

**NO-GO for production deploy until:**

1. The exposed `avnadmin` credential is rotated and the old password verified dead.
2. The VPS/PM2 resource benchmark for the extra 15-minute reindex is measured (local run: ~3–7 s for 1,430 jobs; systemd cap 180 MB / 25% CPU).
3. Explicit authorization to merge and deploy is given.

Known limits: `recommended` is currently empty (no verified-eligible engineering ATS roles); feed verification is not implemented; the reindex loads all jobs into memory (fine below ~50k rows).
