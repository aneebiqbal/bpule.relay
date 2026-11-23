# Relay — Browser Regression

**Not run in this session.** No staging environment or staging credentials were
available; the production database must not be used for adversarial browser
testing. This file records the executable method and the prior results so the
next pass can resume.

## 1. Method (from prior passes)

- Script: `scripts/qa/final-program-acceptance.mjs` (real Next.js server, real
  session, headless Chrome, asserts on rendered text, screenshots per case).
- Environment: isolated staging clone (`relay_staging`), real login.
- Config: `playwright.config.ts`, `playwright.synthetic.config.ts`.

## 2. Prior results (2026-11-23)

See `08-UI-UX-AND-ACCESSIBILITY.md` §1. 10 of 11 cases passed; the 11th
(production reconciliation) was not verified against production.

## 3. Required next-pass matrix (not executed)

| Role | Routes |
|---|---|
| Owner | all admin + team + rep surfaces |
| Admin | admin surfaces, Work Setup, command center |
| Manager | team surfaces, coverage approval, no admin |
| Rep | Today, tasks, profiles, jobs, own leads |
| Unauthenticated | deep links → `/login` |
| Cross-org user | other org's IDs → 403/404/empty |

Each route: navigation, authorized data, permitted action, denied action,
refresh persistence, empty/loading/error state, mobile layout.

## 4. Rep day stress (not executed)

Check-in → Today → acknowledge → accept/start/update/complete task → record
LinkedIn/Upwork actions → follow-up → blocker → close → check-out, plus invalid
sequences (complete before start, duplicate completion, archived profile,
another rep's task, backdate, double-click save, refresh mid-submit, tab switch,
session past midnight).

## 5. Evidence artifacts

- `qa-artifacts/final-program/`, `qa-artifacts/staging-v8/`,
  `qa-artifacts/work-setup-journey/`.
- `docs/RELAY_FINAL_BROWSER_ACCEPTANCE.md`.
