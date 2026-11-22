# Relay V5 — Job Quality Report

**Branch:** `feat/relay-job-intelligence-v2`
**Date:** 2026-11-20
**Commit:** `beec9093` (v5 checkpoint; production deployment still pending)

---

## 1. Problem

V4 shipped with **1,430 production jobs and zero verified recommended roles**.
The shortlist was empty. This report identifies why and what fixed it.

## 2. Root-cause analysis (production, before the fix)

| Signal | Count | Verdict |
|---|---:|---|
| Verified remote ATS jobs | 340 | all from 4 boards |
| … country-restricted | 282 | Linear, Ramp, Airbnb are NA/EU only |
| … worldwide + engineering | **0** | the 3 worldwide Stripe roles were sales / strategy |
| Feed jobs (remote, worldwide, engineering) | ~14 | stuck at `recently_seen` |

Two independent causes:

1. **Employer selection.** The only ATS boards were Airbnb, Stripe, Ramp, Linear.
   Linear / Ramp / Airbnb describe themselves as "distributed across North
   America, Europe and Australia" and restrict every role to those regions.
   Stripe's worldwide roles were non-engineering.
2. **No verification path for feeds.** RemoteOK / Remotive / Himalayas / Jobicy
   listings were permanently `recently_seen`. The V2/V3 design documented this
   as a limitation; it meant real, eligible engineering roles could never be
   recommended.

A secondary finding: the eligibility classifier ranked a "worldwide" phrase
above a named country, so marketing boilerplate such as "we help entrepreneurs
from anywhere in the world" masked real boundaries. That was fixed in V4
(country / region now outrank worldwide).

## 3. Fixes

### 3.1 Bounded employer-source verification

`src/lib/job-discovery/verify.ts`, `GET /api/cron/job-verification`,
`deploy/job-verification.{service,timer}`.

- Selects a bounded slice of fresh, remote, `recently_seen` jobs, prioritising
  `eligible_low` then recency.
- Fetches the application destination with a bounded timeout and concurrency.
- `2xx/3xx` → `verified_open`; `404/410` → `closed`; anything ambiguous
  (403 / 429 / 5xx / timeout) → left `recently_seen`.
- **A failed check never closes a job.**

### 3.2 Requirements intelligence

`src/lib/job-discovery/requirements.ts`, `jobs.requirements` jsonb,
`20261120150000_job_requirements.sql`, populated by the inventory reindex.
Separates hard requirements from preferred qualifications, extracts years,
seniority, technical stack, responsibilities, domains, languages,
certifications and portfolio expectations, each with source evidence and a
confidence level. Noisy feed tags ("marketing", "medical") are filtered out of
the technical stack.

### 3.3 Unicode repair

`repairEncoding` plus `scripts/maintenance/repair-job-encoding.ts` fixed
double-encoded UTF-8 from RemoteOK (74 rows on each database). The visible
symptom was `ML Inference Engineer â€“ Terminal-Bench…`.

## 4. Result (after the fix)

Production `relay_prod_final`, 1,430 jobs:

```text
recommended 5   eligible_low 8   included 61
location_restricted 415   not_remote 746   stale_unverified 78
duplicate 130   eligibility_unknown 48
```

Staging `relay_staging`, 1,450 jobs: `recommended 5`, `eligible_low 8`,
`included 64`.

The five verified recommended roles:

| Company | Role | Location |
|---|---|---|
| Supabase | Software Engineer AI Tooling | Remote |
| Unio Digital | Tier III Service Desk Engineer | Worldwide |
| Toptal | ML Inference Engineer – Terminal-Bench Task Designer | Anywhere in the World |
| Fluence International | Full-Stack Developer | Worldwide |
| Tether Operations | Product Engineering Lead | Remote |

Verification sweep result (both databases): `checked 100 · verified 11 ·
closed 0 · failed 89`. The 89 failures are 403 / 429 (Himalayas and Jobicy
block automated checks) — recorded as `check_failed`, never as closed.

## 5. Coverage gap (still visible)

Himalayas and Jobicy cannot be auto-verified (403). RemoteOK and Remotive can.
As a result the verified pipeline is currently limited to those two feeds plus
the ATS boards. This is reported honestly rather than papered over.

**shortcut:** aggregator pages that block automated checks stay `recently_seen`.
Upgrade when an approved verification path (employer ATS redirect or manual
verification queue) exists.
