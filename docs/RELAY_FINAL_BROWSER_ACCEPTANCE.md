# Relay — Browser Acceptance

**Branch:** `feat/relay-job-intelligence-v2`
**Environment:** isolated staging (`relay_staging`), real login, headless Chrome
**Script:** `scripts/qa/final-program-acceptance.mjs`
**Artifacts:** `qa-artifacts/final-program/`

---

## 1. Method

Every case drives the real Next.js server and a real session — not a component
harness. The script signs in as the staging operator, navigates, waits for the
network/data to settle, and asserts on rendered text. Screenshots are captured
for each case.

## 2. Results (2026-11-23)

| # | Case | Result |
|---|---|---|
| 1 | Login → dashboard | ✅ |
| 2 | Jobs workspace tabs | ✅ `Ready Today, Prepared, In Progress, History, Discover, Sources & Health` |
| 3 | Ready Today renders the shortlist | ✅ 5+ verified cards, candidate-fit shown |
| 4 | In Progress renders saved/reviewing work | ✅ saved cards shown |
| 5 | History renders | ✅ |
| 6 | Prepared job detail | ✅ match 78/100, eligibility reasoning, suggestions |
| 7 | Screening answers panel | ✅ renders; 3 drafts from evidence, 5 needs-human |
| 8 | Mobile (390×844) | ✅ workspace collapses to one column |
| 9 | Midnight rollover, authenticated session | ✅ SUN, NOV 22 → MON, NOV 23, no reload/logout |
| 10 | Admin headline vs canonical API | ✅ `0 / 30 required` and `30 allocated · 0 shared unallocated · 30 tracked` match the API |
| 11 | Admin accounting reconciliation | ⛔ not verified against production (no production credentials) |

### 2.1 Screening answer evidence (real API response)

```json
{
  "id": "required-technologies",
  "status": "draft",
  "answer": "Verified work covers AWS, docker, react, security, Typescript, next.js, REST.",
  "evidence": [
    { "id": "901461d6-…", "claim": "Built and shipped a React and Next.js B2B web application." },
    { "id": "756c3d4c-…", "claim": "Containerized services with Docker and deployed them on AWS." }
  ]
}
```

Availability, salary, work authorization and timezone are returned as
`status: "needs_human"` with a null answer — Relay does not hold those facts and
never invents them.

## 3. Work Setup journey (real Admin + real Rep, staging)

A real Admin account and a real Rep account (created in staging) drove the
canonical writer and every read path:

| Step | Result |
|---|---|
| Admin login → Work Setup surface | ✅ account row present |
| Admin assigns Rep as PRIMARY + 30/day DM target | ✅ `ok=true`, `targetsWritten=1` |
| Rep login lands on `/dashboard` (not onboarding) | ✅ |
| Rep Today target / completed / remaining | ✅ `30 / 3 / 27` |
| Rep acknowledges | ✅ HTTP 200; `acknowledged_at` persisted |
| Rep records an activity | ✅ `recorded=true`; canonical `completed=3` |
| Admin dashboard shows the same progress | ✅ |
| Transfer: Admin PRIMARY, Rep OPERATOR | ✅ Rep still executes |
| Unchanged save after acknowledgement | ✅ `acknowledged_at` unchanged |
| Canonical vs Rep Today target | ✅ both 30 |
| Canonical vs Admin requirement | ✅ both 30 |

The assignment/target write went through `POST /api/admin/work-setup` (the same
canonical writer the Work Setup form calls); the reads were the rendered pages
and the canonical APIs.

## 4. V8 evidence carried forward

`qa-artifacts/staging-v8/` (previous pass) covers: login → Prepared view → ready
package → job detail → suggestions Accept (new document version) → PDF preview.
See `docs/RELAY_V8_JOB_MATCHING_AND_STUDIO.md`.

## 5. Not covered

- The 20-case suite from Phase 12 (strong/weak/excluded/unknown/expired/
  suspended/wrong-profile/AI-failure/retry/duplicate/edited/concurrent/mobile
  for every role).
- Admin / Team Lead role journeys.
- Cross-organization access denial in a browser.

These are the remaining browser gaps before production.
