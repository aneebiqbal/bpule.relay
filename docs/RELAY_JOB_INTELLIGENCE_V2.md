# Relay Job Intelligence v2 — delivery record

**Branch:** `feat/relay-job-intelligence-v2`
**Status:** implemented, unit/live-DB tested, not deployed, not merged.
**Date:** 2026-11-19

This is the checkpoint record for the 150–200 hour planning scope. It states what was actually built, what was deliberately not built, and the exact deployment steps. It does not claim more than the code and tests prove.

---

## 1. Open-source evaluation

Licenses and activity were read from the GitHub API on 2026-11-19. "Reuse" means copying code; "study" means reading an algorithm and re-implementing the smallest useful part.

| Project | License | Lang | Activity | What is useful | Decision |
|---|---|---|---|---|---|
| `strelov1/freehire` | MIT | Go / SvelteKit | active (pushed 2026-11-18) | Multi-source aggregator shape, ATS normalization, Meilisearch + Postgres | **Study.** Go service would add a second runtime; no code copied. |
| `RitvikRajBhushan/jobnavigator` | MIT (fork of `vesaias/JobNavigator`) | Python | active upstream | Scoring, resume tailoring, application tracker, Chrome extension | **Study.** Auto-fill/Chrome automation is ToS-sensitive; Relay keeps human-confirmed submission. |
| `nipunsomani/job-forager` | **No license file** (README badge says MIT) | Python | last push 2026-05 | 18 source adapters, canonical `JobRecord`, URL validation, incremental SQLite | **Do not copy.** All-rights-reserved by default. Source endpoint list and normalization ideas only. |
| `albertorsesc/job-seeker` | MIT | Python | active | Profile-driven ranking, eligibility filtering, MCP/CLI | **Study.** Eligibility and ranking concepts match Relay's deterministic approach. |
| `srbhr/Resume-Matcher` | Apache-2.0 | Python / TS | active | Resume↔JD text similarity, ATS keywords, PDF/DOCX pipeline | **Study.** Heavy ML stack; Relay uses transparent deterministic scoring instead. |
| `reactive-resume/reactive-resume` | MIT | TypeScript | active | Resume section model, PDF/DOCX export, single-column ATS layout | **Study.** No code copied; Relay's renderer is a dependency-free minimal PDF/DOCX writer. |
| `DaKheera47/job-ops` | **AGPL-3.0 + Commons Clause** | TypeScript | active | Pipeline tracking, dashboard | **Do not copy.** AGPL + Commons Clause is incompatible with Relay's hosted service. |

**Additional sources studied:** Relay's own `research/job-sources/SOURCE-CATALOGUE.md` (130+ endpoints, tiered by access method) and `research/job-sources/RELAY-PORT-ARCHITECTURE.md` (existing provider port plan).

**License rule used:** no code from `job-forager` or `job-ops`. No vendored code at all; the new modules are original and reuse Relay's existing MIT-licensed codebase patterns.

---

## 2. Architecture decisions

### Adapters: TypeScript, not Python

The brief preferred Python only if its libraries materially improve coverage. They do not here: every permitted source in scope is a JSON/HTTP board, and Relay already has a typed provider runtime, timeout/backoff handling, mock fixtures and 400+ tests. Adding Python would mean a second runtime, a second DB driver, duplicated normalization and a second deployment artifact. The adapters are TypeScript under `src/lib/job-discovery/adapters.ts` and the worker is the existing Next.js runtime.

### Worker: systemd timer → cron route, not a second service

The VPS runs one Next.js standalone process under PM2. A systemd timer calls `GET /api/cron/job-discovery` with `CRON_SECRET`. This is one lightweight worker: no new always-running process, no Redis/Celery/queue, no extra database. A database lock (`job_discovery_locks`, 10-minute expiry) makes overlapping ticks harmless.

### Storage: canonical `jobs`, additive migration

`supabase/migrations/20261119120000_job_intelligence_v2.sql` is additive. It does not touch `upwork_jobs`, `upwork_applications` or any existing table. Upwork remains the workflow of record for Upwork; the Jobs workspace reads discovery jobs and can union Upwork rows later without migrating them.

### AI: only for document drafting

Deterministic code does eligibility, filtering, ranking, dedupe, verification state and ATS structure. The existing AI runtime is used only for cover letter / Upwork proposal drafting, with the same evidence blocks and claim gates as the existing Upwork proposal route. AI never creates a fit score and never writes a claim that is not in canonical profile evidence.

---

## 3. Data model

New tables (RLS-enabled unless noted):

| Table | Purpose |
|---|---|
| `job_sources` | source id, kind, config (slug/company), enabled, interval, cursor, last run/ok/error, consecutive failures |
| `ingestion_runs` | one row per source run: status, counts, error, metadata |
| `jobs` | canonical listing: source + source_job_id unique, normalized fields, eligibility jsonb, verification state/evidence, content hash, dedupe key/group |
| `job_duplicate_groups` | canonical duplicate group |
| `source_snapshots` | run-level URL, HTTP status, ETag, Last-Modified, content hash |
| `job_matches` | org + job + profile unique: score, category, breakdown, evidence, explanation, score version |
| `saved_jobs` | org + job + profile unique: saved/reviewed/prepared/applied/... + notes + reminder |
| `application_documents` | org + job + profile + kind + version: content, text, ATS report |
| `applications` | org + job + profile unique: status, method, destination URL, submitted_at, notes, reminder |
| `application_events` | append-only status transition history with actor and timestamp |
| `job_discovery_locks` | service-only one-worker lock (no RLS; never exposed to a request) |

**RLS:** `jobs`, `job_sources`, `ingestion_runs`, `source_snapshots` are readable by `authenticated`/`service_role` (public job data). User-specific tables require `organization_id = current_org_id()` for select/insert/update/delete. Anon has no policy. The live test asserts the `jobs` select policy exists and does not include `anon`.

**Idempotency:** `unique(source_id, source_job_id)`, content hash change detection, and a stable duplicate key. Re-running a source updates the existing row; it never creates a twin.

**User edits:** automated ingestion only writes `jobs` and source state. It never writes `saved_jobs`, `applications` or `application_documents`.

**Retention:** each run deletes `source_snapshots` older than 30 days and `ingestion_runs` older than 90 days. Jobs are never auto-closed by age; closure requires an explicit source expiry or an operator action.

---

## 4. Source adapters and legal guardrails

Implemented in `src/lib/job-discovery/adapters.ts`:

| Source | Access | Notes |
|---|---|---|
| RemoteOK | public JSON | enabled by default, 60 min |
| Remotive | public JSON | enabled by default, 60 min, offset cursor |
| Greenhouse | public board JSON | disabled until `config.slug` is set, 24 h |
| Lever | public postings JSON | disabled until `config.slug` is set, 24 h |
| Ashby | public posting API | disabled until `config.slug` is set, 24 h |
| SmartRecruiters | public postings API | disabled until `config.company` is set, 24 h |

**Manual / browser-assisted import:** `POST /api/jobs/import` and the "Add job" button in the Jobs header let a human paste a posting they can already see (title, company, URL, location, description). It is stored with `verification_status = 'verification_needed'` and is never labelled verified. This is the sanctioned path for a LinkedIn posting or any board that cannot be read automatically.

**Deliberately absent:** LinkedIn job scraping, Workday, Indeed, Glassdoor, CAPTCHA circumvention, stealth automation, session scraping, automated application submission. Workday has no permitted public endpoint and is a NO-GO.

Every adapter: stable source id, cursor/pagination where the source supports it, timeout (default 8 s), descriptive `User-Agent`, ETag/Last-Modified captured, partial-failure isolation (one source failure never fails the run), and raw snapshot for debugging.

**Bounded schedule:** default 4 sources per tick, 15-minute timer, 2-minute randomized delay. ATS boards default to 24 h. The worker never crawls thousands of companies in one run.

---

## 5. Verification and freshness

Statuses: `verified_open`, `recently_seen`, `verification_needed`, `closed`, `expired`, `source_unavailable`.

- A job seen in a successful **ATS board** fetch is `verified_open` and `last_verified_at` is set.
- A job seen only in an **aggregator feed** is `recently_seen`, never `verified_open`.
- A failed source fetch records the error and increments `consecutive_failures`; it **never** marks jobs closed.
- `expired` is set only when a parsed `expires_at` is in the past.
- `closed` is never set by absence from a feed. Absence alone is not evidence the employer closed the role.
- Every run appends evidence (`first_seen`, `seen`, `content_changed`) with source URL and timestamp.

The live test proves: after a 503 outage, the existing job remains `recently_seen` with `closed_at = null`.

---

## 6. Remote eligibility engine

`src/lib/job-discovery/eligibility.ts`, pure and deterministic.

Classifications: `worldwide`, `country_restricted`, `region_restricted`, `timezone_restricted`, `residency_required`, `contractor_allowed`, `employee_only`, `unknown`.

Every decision carries verbatim evidence. Hard restrictions are scanned before marketing language, so a benefits section saying "remote anywhere" cannot mask a real "US only" boundary. Tests cover this exact case.

Seeker comparison uses only what Relay already knows: `profiles.location`, `reps.timezone`, `profiles.preferred_engagement_types`. Citizenship, visa status and work authorization are **never inferred**. Unknown authorization produces `requires_verification`, not a rejection and not an approval.

Categories used in the UI: `excellent`, `strong`, `possible`, `stretch`, `not_eligible`, `requires_verification`. They are fit categories, never hiring probabilities.

---

## 7. Matching

`src/lib/job-discovery/match.ts` reuses the existing `scoreJob` deterministic ranker (role, skills, seniority, location, remote, salary, employment, freshness) and applies hard eligibility first:

- Confirmed ineligible → `not_eligible`, score capped at 15.
- Unknown eligibility → `requires_verification`, score capped at 45.
- Unverified listing → `requires_verification`, score capped at 55.
- Otherwise `excellent` ≥ 80, `strong` ≥ 65, `possible` ≥ 50, else `stretch`.

The explanation combines the ranker summary, the eligibility explanation and the eligibility reasons. `job_matches` stores the score version, breakdown, evidence and explanation. A semantically similar job cannot become a high-confidence recommendation when the seeker is confidently ineligible.

---

## 8. ATS Resume Studio

`src/lib/job-discovery/documents.ts`, `pdf.ts`, `docx.ts`, `ats.ts`.

- CV is built from canonical profile evidence only: proof cards, portfolio projects, role history, certifications, approved claims. No employer, year, degree, certification, outcome or number is invented.
- Tailoring reorders and emphasizes existing evidence; it does not add skills.
- Cover letter and Upwork proposal use the existing AI runtime with the canonical evidence block and the existing claim gate (`evaluateCoverLetter`, `findUnsupportedClaims`). Unsupported claims are surfaced, not silently shipped.
- LinkedIn note is deterministic and contains no invented claims.
- PDF: dependency-free single-column Helvetica renderer with a real text layer.
- DOCX: dependency-free stored-OOXML zip writer.
- ATS evaluation: re-extracts the generated PDF, compares it with the source text, and reports matched / missing / unverified requirements, format issues, extraction coverage and truthful recommendations. It is labelled an **internal heuristic**, never an official employer ATS score.
- Editing creates a **new version**; the previous version is never overwritten. "Compare versions" shows the two newest CV versions side by side.

---

## 9. Application workflow

`Job → Match → Select profile → Tailor CV → Review documents → Open application → Record outcome`.

- Save, match, generate documents, save draft, open official URL, confirm submission, record outcome (replied / interview / offer / hired / rejected / withdrawn).
- `applications` and `application_events` record who did what and when.
- "Applied" is written only after the human confirms. Relay never auto-applies and never claims a submission it did not make.
- Upwork keeps its existing `upwork_jobs` / `upwork_applications` workflow; the Jobs workspace does not overwrite it.

---

## 10. Deployment

### 1. Apply the migration

```bash
# On the VPS, from a backup-safe shell:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261119120000_job_intelligence_v2.sql
```

The migration is idempotent (`if not exists`, `drop policy if exists`, `on conflict do nothing`). It creates tables, indexes, policies and seeds the source rows (two enabled feeds, four disabled ATS boards, one manual source). It does not alter existing tables.

### 2. Environment

Add to `/home/deploy/apps/relay/.env.production` (and `.env.local` for development):

| Variable | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | yes | Bearer secret for `/api/cron/job-discovery` |
| `DATABASE_SSL` | local only | `false` for local Postgres; leave unset in production |

The worker uses the existing `DATABASE_URL` / `SERVICE_DATABASE_URL`. No new secret is required for the default remote feeds. ATS sources need no key; they need a slug/company in `job_sources.config`.

### 3. Enable the timer

```bash
# From a checkout that has deploy/:
bash deploy/install-job-discovery.sh

# Or copy the two units to the VPS and install them there:
scp deploy/job-discovery.service deploy/job-discovery.timer deploy@162.35.45.37:/tmp/
ssh deploy@162.35.45.37 'sudo cp /tmp/job-discovery.{service,timer} /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now job-discovery.timer'
```

Units: `deploy/job-discovery.timer` (every 15 min, 10 min after boot, 2 min randomized delay) and `deploy/job-discovery.service` (one curl through `sh -c` so `CRON_SECRET` expands, `MemoryMax=220M` and `CPUQuota=30%` for the oneshot helper, `Nice=10`, idle I/O, 160 s timeout). The ingestion work itself is bounded by 4 sources × 8 s and the route's 120 s `maxDuration`.

Manual run:

```bash
sudo systemctl start job-discovery.service
journalctl -u job-discovery.service -e
```

Manual API run (with the secret):

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/job-discovery?max=4&timeout=8000"
```

Health: `/jobs?view=sources` (admin) shows per-source last run, last ok, consecutive failures and job counts.

### 4. Rollback / removal

The migration is additive; a code rollback needs no data rollback. To stop ingestion:

```bash
sudo systemctl disable --now job-discovery.timer
sudo rm /etc/systemd/system/job-discovery.{service,timer}
sudo systemctl daemon-reload
```

To remove the feature later, drop the new tables in reverse dependency order. Do not drop `jobs` while `job_matches`, `saved_jobs`, `application_documents`, `applications` or `application_events` reference it.

---

## 11. Tests and evidence

Unit tests (default `npm test`, all 407 files / 5845 tests pass):

- `tests/job-discovery-eligibility.test.ts` — 17 tests: worldwide, country, region, timezone, residency, contractor/employee, misleading "remote anywhere" vs "US only", the pronoun "join us" not mistaken for a US boundary, unknown authorization, timezone mismatch.
- `tests/job-discovery-adapters.test.ts` — 8 tests: all six adapters, pagination, stable ids, HTML stripping, date conversion, missing config, non-JSON rejection.
- `tests/job-discovery-documents.test.ts` — 6 tests: truthful resume build, tailoring without invention, PDF text-layer extraction, DOCX zip, ATS evaluation with extraction coverage, LinkedIn note without invented years.
- `tests/job-discovery-match.test.ts` — 4 tests: strong match, hard eligibility cap, unknown eligibility, versioned breakdown.

Live-DB test (requires a disposable database):

```bash
DATABASE_SSL=false \
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/jd_test \
npx vitest run --config vitest.live.config.mts tests/job-discovery-ingest.live.test.ts
```

It proves: idempotent re-run (insert 1 then update 1, count stays 1), outage does not close the job, cross-source duplicate grouping, saved/documents/application persistence, and RLS policy shape. Run against a temporary local Postgres on 2026-11-19: **5/5 passed**.

TypeScript: `npx tsc --noEmit` clean. Production build: `npm run build` succeeds and emits `/jobs` and `/jobs/[id]`.

---

## 12. Resource benchmarks

Measured against a temporary single-core Postgres while developing:

- Ingestion of one normalized listing: ~5 SQL round trips, < 100 ms including classification.
- Default tick: 4 sources × 8 s HTTP timeout worst case, 120 s route ceiling, 160 s systemd ceiling.
- Memory: the systemd oneshot helper is capped at 220 MB; the standing PM2 app is unchanged. Ingestion work is bounded by source count and timeout, not by an always-on worker.
- No new always-running process, no new database, no queue, no search service.

The VPS is 1 vCPU / 4 GB. The timer is the only new scheduler artifact and is bounded.

---

## 13. GO / NO-GO

**GO for:** merge and deploy the migration + code, enable the timer, monitor `Sources & Health`, and start with the two enabled feeds (RemoteOK, Remotive). Add ATS slugs one at a time.

**NO-GO for:**

- Workday, LinkedIn job scraping, Indeed, Glassdoor — no permitted public access.
- Any automated application submission or "one-click apply" — not built, by design.
- Copying `job-forager` or `job-ops` code — license-incompatible.
- Claiming a fit score is a hiring probability, or that an aggregator listing is employer-verified.
- Enabling all ATS sources at once, or raising the per-tick source cap without a benchmark.

**Known limits:**

- `shortcut: only six sources are implemented; add Tier A feeds from research/job-sources/SOURCE-CATALOGUE.md when coverage is needed, one adapter + seed row each.`
- `shortcut: closure is not inferred from absence; a source must explicitly expire or an operator must mark it closed.`
- `shortcut: no semantic embeddings; ranking is deterministic. Add pgvector only if Aiven supports it and a measured recall gap justifies it.`
- `shortcut: Upwork rows are not migrated into `jobs`; the Jobs workspace currently reads discovery jobs only.`
- `shortcut: discovery applications keep screening answers in the free-text notes field; add a structured answers table when application volume justifies it.`

---

## 14. Checkpoint

Everything above is committed on `feat/relay-job-intelligence-v2`. Nothing is deployed and nothing is merged. The next run should: apply the migration to a staging database, enable one ATS slug, run two timer ticks, and confirm `Sources & Health` shows one verified source and no auto-closed jobs.
