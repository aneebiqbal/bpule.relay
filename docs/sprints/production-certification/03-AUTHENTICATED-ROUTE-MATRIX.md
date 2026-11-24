# Authenticated route × role matrix

Evidence: `artifacts/route-role-matrix.json`, screenshots `*-inbox.png`.
Runner: `scripts/qa/staging-route-matrix.mjs` — **164 checks, 0 failures**.

## Coverage

- Roles with real sessions: OWNER, ADMIN, MANAGER, MEMBER (org A) plus an org B identity for isolation tests.
- 24 routes: dashboard, chats, tasks, leads, prospect, upwork, jobs, content (+ideas/growth),
  team (+people/profiles/performance), reports (sales/pipeline/revenue/activity), settings,
  notifications, admin (targets/people/control-center/system).
- Per route: direct navigation, expected access, final URL, HTTP status, page errors, ≥5xx responses.
- Responsive overflow sweep at **390 / 768 / 1280 / 1440** on the five most complex surfaces
  (`/chats`, `/dashboard`, `/admin/targets`, `/team`, `/tasks`).

## Result

All reachable routes render with no console/page errors and no server errors. All expected-denied
roles are refused. No horizontal overflow at any width on the swept surfaces.

## Recorded finding: denial is not a 3xx

Forbidden pages (e.g. `/admin/targets` for MANAGER/MEMBER, `/team/*` for MEMBER) return
**HTTP 200 with the destination's content streamed in place** rather than a redirect status.
Verified identically under `next dev` and a production build served with `next start`.

- The API boundary is unaffected: member and manager `GET`/`POST /api/admin/work-setup` return
  **403**.
- No data or control is exposed; the impact is a misleading URL/content mismatch and a missing
  cacheable denial signal.

Severity recorded as **P2**. Fix direction (not applied here): perform role gating in
`src/proxy.ts`, which can emit a real redirect before rendering, instead of relying on a
component-level `redirect()` during streaming.

## Not covered

- Mobile *interaction* flows (only overflow/geometry was measured).
- Form submissions on every route; Work Setup and Inbox are covered by the dedicated E2E suite.
