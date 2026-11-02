# Relay Phase 8: synthetic browser certification (2026-11-01)

**Result: 48 / 48 browser tests pass on a local, production-shaped, synthetic stack. Five defects
found here were fixed in code, and a sixth was in the certification setup.** This is runtime
evidence in a browser, but it is **not** real-data or deployed evidence. Those gates remain open
(see `docs/RELAY_PHASE8_FINAL_ACTIVATION.md`).

## 1. The stack

| Part | What |
|---|---|
| Database | Production schema-only dump (no rows), then the 10 pending migrations in order (§3 of the reconciliation doc) |
| Services | Local Supabase (Postgres, GoTrue, PostgREST, Kong) as project `relay-p8-synth` on ports 55420–55429 |
| App | Production build (`next build`, Turbopack) of this tree, served by `next start` on :3200 |
| Data | Fictional only: orgs "Northwind (synthetic)" and "Contoso (synthetic)" |

Seeded people:
- **Org A:** owner, admin, manager of team *Enterprise East*, reps Ava and Ben (East), rep Cara (*SMB West*).
- **Org B:** admin, rep.

Seeded data:
- 60 companies / 78 leads (one live lead per company, as the unique index requires).
- 56 messages, including a 1,700-character inbound reply.
- 156 action events: 13 days of history, plus today's sends and one failed send.
- 8 assigned tasks (overdue, done, cancelled), 4 notifications per org, daily targets.
- Sender profiles linked to identities, as in production.

Rebuild it:

```
scripts/synthetic-stack/setup.sh <work_dir> <schema_only_dump.sql>
SYNTH_PASSWORD="$(cat <work_dir>/stack/.synth_password)" SYNTH_TRUTH=<work_dir>/stack/truth.json \
SYNTH_CAST=<work_dir>/stack/cast.json SYNTH_AXE=<path to axe.min.js> E2E_BASE_URL=http://127.0.0.1:3200 \
  npx playwright test -c playwright.synthetic.config.ts
```

`truth.json` is computed by the seed from the rows it wrote, independently of app code. The spec
compares the UI against it.

## 2. Results (final run, rebuilt app)

| Gate | Result |
|---|---|
| Route matrix: 5 roles, 34 role routes, 123 page loads across 1440 / 1280 / 1024 / 768 / 375 | 0 status ≥ 400 · 0 error boundaries · 0 uncaught errors · 0 console errors |
| Responsive: horizontal overflow at every width | **0** pages overflow (was 14 page/width cases) |
| Accessibility: 72 axe scans (1440 + 375) | **0 critical** (was 2). Serious: `color-contrast` only (see §4) |
| Screenshots | 72 full-page captures, 1440 and 375, every role route (`test-results/phase8-synthetic/screenshots/`, not committed) |
| Scope: manager sees own team, not the other team; admin sees all; rep cannot open Team | PASS |
| Rep 360 guard: manager → rep outside team blocked; admin allowed | PASS |
| Accounts: admin/owner only (by design), reps and managers redirected | PASS |
| Cross-org: org B sees no org A people, companies or org name on Team / Accounts / Chats / Home | PASS |
| Rep Home scoreboard: today's connections = seeded executed sends (the failed send excluded) | PASS |
| Notifications: opening one marks it read (unread count −1) | PASS |
| Tasks: assignee sees their overdue task; a peer does not | PASS |
| Cmd-K: opens with ⌘K, finds a lead by company | PASS |
| Chat preview egress: the inbox never renders the full long body | PASS |
| Saved views: create / list / delete, private to the owner | PASS |

Timing (production build, local stack, 1440, single user; not a production measurement):
- **Overall:** median page-load wall time 1.9s (p95 2.9s); median time to first byte 267ms.
- **Slowest time to first byte:** `/team/groups` 1.3s, `/chats` 0.9s.

## 3. Defects found and fixed

| # | Defect | Fix |
|---|---|---|
| 1 | **`/leads` crashed for everyone** (the error boundary at every width). The server page called `isPipelineView()` from a `'use client'` module, which Next refuses at runtime. The bug is in committed code. | Moved the predicate to server-safe `pipeline-utils.ts` |
| 2 | **Profile performance used the wrong id.** Team Performance and Admin Home profile rows keyed events by `sender_profile_id` (a `profiles.id`) but looked them up by revenue identity. With real data, events with a sender profile drop out of the profile filter and Admin Home profile rows read zero. Introduced in the previous pass; unit fixtures had hidden it. | `identityResolver()`: the identity built on the sending profile owns the event, else the lead's identity. Used by both surfaces and covered by 4 new tests |
| 3 | **Horizontal overflow at 1024 / 1280** on Home, Team, Activity, Performance, Reports, Inbox and Tasks. The shell's `<main>` grid item kept `min-width: auto`, so wide tables widened the page instead of scrolling. | `min-w-0` on `<main>` |
| 4 | **Overflow at 375:** Team Performance comparison grid (implicit `auto` track) and the `/leads` saved-view tab strip | `grid-cols-1`; the header's saved-view slot scrolls inside itself |
| 5 | **Critical a11y:** the activity heatmap declared `role="grid"` with button children; the `/leads` row-actions header was an unnamed sort button. Serious: metric strips put `<a>` directly in `<dl>` (Team, Rep 360, Accounts, Performance). | `role="group"`; no sort button on header-less columns; metric tiles are `<div>` groups with a stretched link labelled "label: value" |
| 6 | Task list "Profile" column always blank: the query selected `revenue_identities.name` (the column is `identity_name`) and ignored the error | Select `identity_name` |

The seed itself needed `voice_profiles` rows: users without one are always sent to `/onboarding`.
That is expected behaviour, but the onboarding page logs React hydration error #418. The error was
observed there and has not been investigated further.

## 4. Not fixed (reported)

- **Color contrast** (72 hits): the `text-stone` token (#8a8984) on white is 3.5:1; small text needs
  4.5:1. Fixing it is a design-token change, outside "no redesign". It needs a design decision.
- **Onboarding hydration error #418** (above).
- **`next build --webpack` fails** on `node:crypto` via `training-data-center.tsx` →
  `scoring-v4/opportunity-key.ts`. This predates the current work; the default Turbopack build is
  unaffected.

## 5. What this does not prove

- Real-data values (Team / Rep 360 / Accounts / Chats / Reports against real rows), real role
  assignments, production volumes or production latency.
- Real Supabase auth flows beyond password sign-in (magic link, Google).
- Deployed-SHA parity. Every one of these remains a gate in the final activation report.
