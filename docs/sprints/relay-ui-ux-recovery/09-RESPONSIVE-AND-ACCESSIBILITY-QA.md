# Responsive and accessibility QA

## What was actually measured

### Browser axe sweeps (Playwright + axe-core, WCAG 2.1 A/AA tags)

| Suite | Result |
|---|---|
| `scripts/qa/inbox-interactions.mjs` — 1440 / 1024 / 375, filter drawer, queue selection, composer menu, context drawer, Escape + focus restoration, keyboard | **18 passed, 0 failed**; axe **0 critical / 0 serious** on all three viewports |
| `scripts/qa/inbox-states.mjs` — every queue state × role (rep tabs, conditions, manager view) | **all sweeps clean** |

These run against `/inbox-fixture`, a deterministic auth-free surface. They prove interaction
and contrast behaviour of the Inbox component set, **not** authorization.

### Route crawl

All 112 routes at desktop viewport: 0 non-auth hard failures, 0 page crashes
(`artifacts/route-crawl.json`). Console errors observed were HTTP 401 responses from pages
probing authenticated APIs before redirecting — expected, not render defects.

### Accessibility defects fixed

| ID | Defect | Fix |
|---|---|---|
| SR-08 | `V4Drawer`: no Escape, no Tab trap, no scroll lock, no focus restore | full modal behaviour |
| SR-09 | `Dialog`: no trap/scroll lock; unbounded height | trap + lock + `max-h-[90dvh]` |
| SR-11 | `QuickComplete` failure invisible | inline `role="alert"` |
| SR-12 | Rows announced as interactive but inert | per-row `isRowClickable` |

### Not verified

- **WCAG 2.2 AA across real authenticated workflows.** Blocked: no populated disposable
  environment. Targeted confirmation of the new modal behaviour on Work Setup / setup
  assistant / assignment drawer also remains outstanding for the same reason.
- **200% zoom and long-content cases** on authenticated surfaces: not run.
- **Tablet (768) and mobile (390) on management surfaces**: not run beyond the Inbox fixture,
  which does cover 375/768/1024/1280/1440.
- Horizontal-overflow sweep of every table at 390px: static review found wide tables wrapped in
  `overflow-x-auto` with mobile card alternatives, but no automated measurement was taken.

Responsive gaps recorded from static audit (search hidden below `sm`, no mobile badges, dialog
vertical overflow) — dialog overflow is now bounded; the rest remain open and are cosmetic.
