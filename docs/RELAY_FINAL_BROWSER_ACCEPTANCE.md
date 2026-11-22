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
| 10 | Admin accounting reconciliation | ⛔ not browser-verified (no production credentials) |

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

## 3. V8 evidence carried forward

`qa-artifacts/staging-v8/` (previous pass) covers: login → Prepared view → ready
package → job detail → suggestions Accept (new document version) → PDF preview.
See `docs/RELAY_V8_JOB_MATCHING_AND_STUDIO.md`.

## 4. Not covered

- The 20-case suite from Phase 12 (strong/weak/excluded/unknown/expired/
  suspended/wrong-profile/AI-failure/retry/duplicate/edited/concurrent/mobile
  for every role).
- A **Rep**-role midnight session. The staging workspace has only an admin
  user, so the Rep rollover was not browser-driven; the same `BusinessDayRefresh`
  shell component wraps the Rep home, and the boundary arithmetic is unit-tested.
- Admin / Team Lead role journeys.
- Cross-organization access denial in a browser.

These are the remaining browser gaps before production.
