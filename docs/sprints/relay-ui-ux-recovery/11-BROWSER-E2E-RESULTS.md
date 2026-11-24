# Browser E2E results

## Environments

| Environment | State | Used |
|---|---|---|
| Local Next 16 dev server + Chromium (Playwright 1.63) | available | **yes** — deterministic fixture surfaces |
| Staging app | `relay_staging` reachable but **0 tables**; no app URL | no |
| Production | reachable; off-limits for testing | no |
| Vercel previews | **account blocked** (external) | no |

Browser binary note: the installed Playwright 1.63 expects headless-shell revision 1243 while
the machine had 1255; a local cache symlink (`chromium_headless_shell-1243 -> 1255`) was created
so the existing QA scripts could run unmodified. This affects tooling only, not the product.

## Results

### Inbox interaction + a11y (deterministic fixture, auth-free)

`node scripts/qa/inbox-interactions.mjs` → **18 passed, 0 failed**

- 1440: filter drawer opens; Escape closes it; queue row opens the thread; composer "More"
  menu opens; Escape closes it; exactly one `aria-current` selected conversation; axe 0 critical /
  0 serious.
- 1024: context drawer opens; focus is trapped; Escape closes; axe clean.
- 375: queue visible first; row opens the thread; composer visible without scrolling; context
  drawer opens; Escape closes; back link returns to the queue; axe clean.

### Queue states × roles

`node scripts/qa/inbox-states.mjs` → **all state/role axe sweeps clean** (Needs reply, Waiting,
Follow-ups, All, Closed condition, manager view).

### Full route crawl

`node scripts/qa/sprint-route-crawl.mjs` → 112 routes, all non-authenticated renders clean;
authenticated routes redirect to `/login`. Artifact: `artifacts/route-crawl.json`.

## What these results do NOT prove

- They do not exercise authentication, organization scoping, coverage, Work Setup persistence or
  any write path. The fixture has no database.
- SR-01/SR-02 (the P0/P1 authority fix) have **unit-level** proof only.
- The browser role matrix required by the brief remains **NOT RUN**.

## Required follow-up

With a disposable populated database: OWNER/ADMIN/MANAGER/MEMBER journeys over every nav entry,
cross-org denial on two organizations, direct-URL denial for out-of-scope leads, and refresh /
multi-tab persistence for Work Setup and the Inbox.
