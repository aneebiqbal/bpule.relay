# Relay Job Intelligence v3 — production activation record

**Branch:** `feat/relay-job-intelligence-v2`
**Date:** 2026-11-19
**Status:** staging journey verified on Aiven at this commit; production schema migrated; production ingestion complete. Code not deployed, not merged.

This is the v3 activation record. It reports what was exercised against real data and what remains external.

---

## 1. Staging environment

- **Database:** Aiven PostgreSQL, new isolated database `relay_staging` in the same project as `relay_prod_final`.
- **Construction:** schema-only clone of production (`pg_dump --schema-only` + `pg_restore`), then the v3 migrations applied. **No production rows were copied.** The migration table was copied so the historical migration chain is honoured.
- **Roles:** `relay_app` / `relay_service` from `supabase/aiven/bootstrap.sql`.
- **App:** local `next start` on `127.0.0.1:3200`, `RELAY_DB_PROVIDER=postgres`, `RELAY_AUTH_PROVIDER=aiven`, `SIGNUP_INVITE_CODE=staging-test`.
- **Test identity:** a synthetic staging org/rep with two synthetic profiles and verified proof cards. No real operator data.

## 2. Real discovery results

Ingested permitted public sources into `relay_staging`:

| Source | Kind | Jobs | Notes |
|---|---|---:|---|
| RemoteOK | feed | 97 | 25 s HTTP timeout needed; per-source timeout now supported |
| Remotive | feed | 16 | offset cursor |
| Greenhouse · Airbnb | ATS | 197 | real board slug |
| Greenhouse · Stripe | ATS | 785 | real board slug |
| Ashby · Ramp | ATS | 182 | real board slug |
| Ashby · Linear | ATS | 32 | real board slug |
| **Total** | | **1,309** | |

Every job carries source id, source job id, original URL, apply URL, description, skills, posted timestamp, eligibility classification and verification state. ATS jobs are `verified_open`; feed jobs are `recently_seen` until checked at the original employer.

### Idempotency

A second run of RemoteOK + Remotive after forcing the source due:

```text
remoteok  found 97  inserted 0  updated 97
remotive  found 16  inserted 0  updated 16
total jobs 1309
```

No duplicates. Content-hash change detection and `unique(source_id, source_job_id)` hold.

### Outage behaviour

A forced 503 in the live-DB suite leaves the existing job `recently_seen` with `closed_at = null`. A failed fetch never closes jobs.

## 3. Product surface

- **Jobs dashboard:** For You, Latest, Verified Remote, Saved, Applications, Documents, Sources & Health.
- **Filters:** title, skills, company, location, employment type, seniority, salary range, freshness, verification state, match category, sort. Filters are URL-persisted; saved filters are stored in `saved_job_filters`.
- **Matching:** deterministic ranker + hard eligibility first. Confirmed ineligible caps at 15; unknown eligibility caps at 45 and is labelled `requires_verification`. Per-profile match is stored with score version, breakdown, evidence and explanation.
- **Best-profile recommendation:** `/api/jobs/[id]/recommend` evaluates the authorized profiles and returns ranked recommendations with the reason. The job detail shows them and lets the operator switch; switching recomputes match and documents.
- **ATS Resume Studio:** three layouts (Modern professional, Technical engineering, Minimal corporate), single-column and text-extractable. CV, cover letter, Upwork proposal and LinkedIn note are generated from canonical evidence. PDF and DOCX download. Document versions are append-only; side-by-side compare is available.
- **ATS report:** matched / missing / unverified requirements, format issues, PDF re-extraction coverage and truthful recommendations. Labelled an internal heuristic, never an employer score.
- **Application tracking:** save job, draft application, open official destination, confirm submission, record outcomes. `application_events` records every transition. “Applied” is only written on human confirmation.
- **Source admin:** `/jobs?view=sources` shows status, last run/ok, job counts, failures and consecutive failures; admins can enable/disable, edit ATS slug/company and run a bounded manual refresh.

## 4. Browser acceptance evidence

Script: `scripts/qa/job-intelligence-v3-acceptance.mjs` (kept as evidence). Screenshots: `qa-artifacts/staging-v3/`.

Observed in a real Chromium session against `relay_staging`:

```text
login ok
latest cards: 24
filtered cards (React): 0          # URL became ?view=latest&skills=Rails/React
job detail: Account Executive, Enterprise Grower, Platforms (Israel)
recommendations present: true
documents + ATS report present: true
pdf download: 200 application/pdf (1,500 bytes)
version 2 saved: true
saved cards: 2
application recorded: true
source rows: 11
mobile screenshot captured
```

Database after the journey: 2 saved jobs, 2 applications (`applied`), 1 application event (`applied`), 23 document versions, 1,309 jobs, 3 profile matches.

## 5. Performance observed

- Aiven read latency in this environment: ~1.5–2.0 s per `db.read` during the dashboard; the app log flags `me/status` at 7–8 s under first load. This is the existing app/Aiven path, not a new search service.
- Ingestion is per-job upsert: Stripe’s 785 jobs took several minutes. The worker is bounded by `maxSources` and a hard timeout; it is not an always-on crawler.
- No Redis, Celery, Meilisearch or extra VPS service was added.
- systemd limits remain as documented in v2; the Next.js process itself is bounded by the source cap and route `maxDuration`.

## 6. Production schema

Applied to `relay_prod_final` with the tracked runner:

- `20261119120000_job_intelligence_v2.sql`
- `20261119130000_job_intelligence_v3_sources.sql`
- `20261119140000_job_intelligence_v3_filters.sql`
- `20261119150000_fix_reps_auth_fk.sql` — fixes new signups: `reps.auth_user_id` now references `neon_auth."user"`, the table Better Auth actually writes.

Production `schema_migrations`: **191**. Curated ATS boards are enabled: Airbnb, Stripe, Ramp, Linear; RemoteOK and Remotive were already enabled.

Production ingestion completed against the same six sources: **1,309 jobs** (Stripe 785, Airbnb 197, Ramp 182, Linear 32, RemoteOK 97, Remotive 16). The same bounded worker is used; no production data was used for staging tests.

**Batch upsert:** the v3 worker writes jobs in chunks of 200 with `insert … on conflict do update`, replacing the per-row round trips. A second RemoteOK/Remotive run then completes in seconds instead of minutes; Stripe’s 785 rows are one batch.

## 7. Deployment

1. **Migration** (additive):
   ```bash
   SERVICE_DATABASE_URL='<Aiven avnadmin connection string>' \
     bash scripts/apply-pending-migrations.sh
   ```
2. **Environment:** `CRON_SECRET`, existing `DATABASE_URL` / `SERVICE_DATABASE_URL`, `RELAY_DB_PROVIDER=postgres`.
3. **Timer:** `bash deploy/install-job-discovery.sh` (or `scp` the two units; releases do not include `deploy/`).
4. **Health:** `/jobs?view=sources`; `journalctl -u job-discovery.service -e`.
5. **Rollback:** code rollback is a symlink swap; ingestion can be stopped with `systemctl disable --now job-discovery.timer`. Jobs are not deleted.
6. **Deploy:** not done. The feature branch must be merged and deployed by the normal GitHub Actions flow.

## 8. GO / NO-GO

**GO for:** merge + deploy + enable the timer. The staging journey is real: real jobs, real eligibility, real profile match, real documents, real PDF extraction, real application state.

**NO-GO for:** claiming a production browser pass (the code is not deployed), claiming official employer ATS scores, or enabling broad un-curated ATS crawling. The four enabled boards are a curated set.

## 9. Certification addendum (final pass)

### Security
- Runtime role verified against production: `DATABASE_URL` connects as **`relay_app`** on `relay_prod_final`.
- Policy audit: `jobs` select is `authenticated, service_role`; `anon` has **no** select on `jobs`. User tables are org-scoped for select/insert/update/delete. `relay_service` can insert `job_matches`.
- **External blocker:** the Aiven `avnadmin` credential was exposed in chat. It must be rotated in the Aiven console and updated in the VPS `.env.production`; the old credential should then fail authentication. Relay cannot rotate it itself.

### Application event integrity
- Added `application_events.dedupe_key` + unique index and an `AFTER INSERT OR UPDATE` trigger on `applications`. Every status change is now written atomically with the application row, and a retry cannot create a second event.
- Staging discrepancy reconciled: the two `applied` applications now each have exactly one `applied` event. Production had no applications at the time, so no historical production activity was changed.
- Workflow test: draft → prepared → applied → rejected → withdrawn → applied produced 6 unique events; a repeated transition and a repeated upsert produced no duplicates.

### Discovery quality
- Ashby list responses include `descriptionPlain`; the adapter now uses it. Greenhouse list responses omit the body; the adapter fetches bounded detail records (`detail_limit`) for recent listings.
- Skills are extracted from posting text when a board has no tags. Production now has descriptions for 1,306/1,310 jobs and skills on the large majority.
- Recommendation audit over 50 real jobs × 2 profiles: **0 excellent matches for a country-restricted job with an unsupported location**; 0 missing apply/source links; 0 duplicate keys; 0 missing descriptions.
- Multi-skill filter counts: React 49, Rails 28, React+Rails 71, Node.js+TypeScript 48.

### ATS Resume Studio audit
- 20 CVs generated (10 jobs × 2 profiles), PDF and DOCX rendered.
- All 20 PDFs re-extracted with the candidate name and title; extraction coverage **1.0** on every CV.
- Internal ATS heuristic range 28–60; 10/20 flagged format issues (the second profile has no portfolio projects — a truthful gap, not a fabrication).
- All experience and project claims come from the profile evidence loaded by `loadProfileEvidence`.

### Notifications
- Added `job_notification_preferences` (new matches / saved reminders / application follow-ups) and `runJobNotifications`, wired to `GET /api/cron/job-notifications` and a daily systemd timer.
- Verified in staging: new strong match → 1 notification; second run → 0; saved reminder → 1; application awaiting action → 1; follow-up → 1. Dedupe keys prevent repeats.

### Performance
- Batch upsert of 781 Stripe jobs: one chunked statement, ~4.5 s process CPU, ~3% CPU overall (network-bound detail enrichment). The worker is bounded by `maxSources`, a hard timeout and a database lock.
- Concurrent worker test: a held lock makes a second worker return `locked: true`.

## 10. Known limits

- `shortcut: ingestion is per-job upsert; batch the Stripe-scale boards if run time matters.`
- `shortcut: feed jobs are `recently_seen`, not employer-verified; only ATS boards are `verified_open`.`
- `shortcut: no semantic embeddings; deterministic ranking only.`
- `shortcut: notifications are not wired in this pass; the `notifications` table and `notifyOnce` writer are ready, but no job-notification emitter was added.`
- `shortcut: Upwork rows are not migrated into `jobs`; the existing Upwork workflow remains separate.`
- The Aiven admin credential used for migrations is in the chat transcript; rotate it if that matters.
