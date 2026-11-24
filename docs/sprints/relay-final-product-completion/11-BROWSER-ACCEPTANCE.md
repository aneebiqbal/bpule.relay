# Browser acceptance

## Environments

| Environment | State | Used |
|---|---|---|
| Local Next 16 dev + Chromium (Playwright 1.63) | available | **yes** — deterministic fixture + unauthenticated crawl |
| Staging app | `relay_staging` reachable, **0 tables**; no app URL | no |
| Production | reachable; off-limits for testing | no |
| Vercel previews | **account blocked** (external) | no |

Local bootstrap blocker: `scripts/qa/bootstrap-probe.sh` → 174/201 migrations with Supabase stubs;
see `09-SECURITY-AND-RLS.md`.

## Results at final code state

| Suite | Command | Result |
|---|---|---|
| Inbox interactions + axe | `node scripts/qa/inbox-interactions.mjs` | **18 passed / 0 failed**; axe 0 critical / 0 serious at 1440, 1024, 375 |
| Queue states × roles | `node scripts/qa/inbox-states.mjs` | all sweeps clean |
| Route crawl (112 pages) | `node scripts/qa/sprint-route-crawl.mjs` | **81 redirect to `/login`, 31 render, 0 hard failures, 0 crashes** (`artifacts/route-crawl.json`) |
| Internal href audit | `node scripts/qa/sprint-link-audit.mjs` | 2 unresolved, both `/icon.svg` |

Browser binary note: Playwright 1.63 expects headless-shell r1243 while the machine has r1255; a
local cache symlink was created so the existing scripts run unmodified. Tooling only.

## Required follow-up (blocked)

- OWNER / ADMIN / MANAGER / MEMBER authenticated journeys over every nav entry.
- Cross-organization denial across two organizations.
- Suspended user and revoked-permission behaviour.
- Mobile/tablet on management surfaces (only the Inbox fixture covers 375/768/1024/1280/1440).
- Screenshots for every route: not captured beyond the Inbox artifact set inherited from prior
  sprints.

Every row above is marked **blocked**, not passed.
