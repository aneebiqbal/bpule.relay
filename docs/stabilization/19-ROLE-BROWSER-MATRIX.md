# Relay — Role × Route Browser Matrix

**Status:** NOT executed in this pass. No staging environment or staging
credentials were available, and production must not be used for adversarial
browser testing. This file is the executable plan plus the prior evidence.

## 1. Required roles

`OWNER`, `ADMIN`, `MANAGER` (`organization_roles`), `MEMBER`, plus a suspended /
archived identity and an unauthenticated visitor. `RepRole` values (`rep`,
`sourcer`, `admin`, `manager`) are bootstrap-only.

## 2. Planned matrix

| Journey | Owner | Admin | Manager | Member | Unauthorized |
|---|---|---|---|---|---|
| Login / logout | ✅ | ✅ | ✅ | ✅ | redirect |
| Dashboard / Today | ✅ | ✅ | ✅ | ✅ | redirect |
| Work Setup (read) | ✅ | ✅ | 403 | 403 | redirect |
| Work Setup (save + 409 conflict) | ✅ | ✅ | 403 | 403 | redirect |
| Create assignment / transfer | ✅ | ✅ | ✅ | 403 | redirect |
| Rep acknowledgement | — | — | — | ✅ | redirect |
| Target allocation (seat-enforced) | ✅ | ✅ | ✅ | 403 | redirect |
| Activity completion | — | — | — | ✅ | redirect |
| Admin vs Rep target agreement | ✅ | ✅ | ✅ | ✅ | — |
| Concurrent admin edit → 409 | ✅ | ✅ | — | — | — |
| Suspended operator | ✅ | ✅ | ✅ | 403 | — |
| Archived identity (reject) | ✅ | ✅ | ✅ | — | — |
| Cross-org request (other org id) | 403/404 | 403/404 | 403/404 | 403/404 | redirect |
| Team Lead scope restriction | — | — | ✅ scoped | 403 | — |
| Attendance check-in/out | — | — | — | ✅ | redirect |
| Task lifecycle | ✅ | ✅ | ✅ | ✅ | redirect |
| Notification delivery | ✅ | ✅ | ✅ | ✅ | — |
| Midnight rollover | ✅ | ✅ | ✅ | ✅ | — |
| LinkedIn capture / analyze / sender | — | — | — | ✅ | redirect |
| Upwork draft / application accounting | — | — | — | ✅ | redirect |
| Jobs shortlist / eligibility / prepared | ✅ | ✅ | ✅ | ✅ | redirect |
| PDF/DOCX/resume versioning | ✅ | ✅ | ✅ | ✅ | redirect |
| Content Studio / Growth | ✅ | ✅ | 403 | 403 | redirect |
| Mobile navigation (390×844) | ✅ | ✅ | ✅ | ✅ | — |

## 3. Prior evidence (carried, not re-run)

`docs/RELAY_FINAL_BROWSER_ACCEPTANCE.md`: login, jobs tabs, shortlist,
prepared detail, screening panel, mobile single column, midnight rollover
(NOV 22 → NOV 23), Admin headline vs canonical API, Work Setup journey
(assign → acknowledge → activity → transfer → unchanged-save).

## 4. Execution method (for the next pass)

```bash
cp .env.test.example .env.test      # relay_staging
RELAY_TEST_DATABASE=1 npm run test:live
node scripts/qa/final-program-acceptance.mjs   # staging BASE_URL
```

Script: `scripts/qa/final-program-acceptance.mjs` drives real sessions and
asserts rendered text; artifacts under `qa-artifacts/`.

## 5. Blocker

Staging credentials/environment required. Reported as an external blocker, not
marked complete.
