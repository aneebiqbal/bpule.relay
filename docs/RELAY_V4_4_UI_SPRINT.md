# RELAY V4.4 — UI/UX Sprint Record

**Status:** partial — one focused elevation pass completed and pushed.
**Owner visual approval:** NOT GIVEN. Nothing here is visual sign-off.
**Production stability:** NOT CLAIMED. The V4.3 stabilization findings remain open (§8).

---

## 1. Git synchronization (Pass 1)

| Item | Result |
| --- | --- |
| Repository | `github.com/aneebiqbal/bpule.relay` (confirmed RELAY, not KM Foods) |
| Branch / upstream | `main` → `origin/main` |
| Working tree at start | clean |
| Local `main` vs `origin/main` | identical at `ebbbdf2` — **nothing to push** |
| Tags | `release-v4.3-435a36a`, `pre-reconciliation-a2e491c` — pushed in the prior session; verified on the remote |
| Secrets / env / QA artifacts | `.env.local` gitignored; `qa-artifacts/`, `test-results/`, `e2e-results.json` gitignored; no credential files tracked |
| Typecheck | `tsc --noEmit` → **0 errors** |
| Lint | `eslint .` → **0 errors** (764 pre-existing warnings) |
| Focused unit tests | 57 passed |

No force-push, no history rewrite, no reset. The frozen tag `release-v4.3-435a36a` was not touched.

---

## 2. Route inventory (real, from the repository)

**75 app routes** under `src/app/(app)`, **219 API routes** under `src/app/api`.

Primary domains and their surfaces:

| Domain | Surfaces |
| --- | --- |
| Home | `/dashboard` |
| Sales | `/prospect`, `/leads`, `/leads/[id]`, `/leads/import`, `/accounts`, `/accounts/[company]`, `/upwork`, `/upwork/[id]`, `/upwork/new`, `/revenue/email`, `/archive` |
| Inbox | `/chats`, `/inbound` |
| Work | `/tasks` |
| Team | `/team`, `/team/people`, `/team/profiles`, `/team/profiles/[profileId]`, `/team/performance`, `/team/groups`, `/team/groups/[teamId]`, `/team/[repId]`, `/team/eval` |
| Content | `/content`, `/content/ideas`, `/content/growth`, `/content/[id]`, `/content/new`, `/content-v2/*`, `/studio/post-detail` |
| Insights | `/reports`, `/reports/sales`, `/reports/pipeline`, `/reports/revenue`, `/reports/activity`, `/reports/team`, `/performance` |
| Settings | `/settings`, `/notifications`, `/account` |
| Admin | `/admin/command`, `/admin/command-center`, `/admin/people`, `/admin/targets`, `/admin/activity`, `/admin/ai-usage`, `/admin/health`, `/admin/system`, `/admin/revenue-identities`, `/admin/revenue-intelligence`, `/admin/scoring-qa`, `/admin/dataset`, `/admin/training-data`, `/admin/growth`, `/admin/accountability`, `/admin/qa` |
| Identities | `/profile-intelligence`, `/profile-intelligence/[id]`, `/manage-profiles`, `/profiles`, `/rep/assigned-profiles` |
| Other | `/workspace/[revenueIdentityId]`, `/facts`, `/activate`, `/qa-v4`, `/relay`, `/relay/persona-daily`, `/chats` |

Public: 16 doc/policy pages under `src/app/(public)`.

---

## 3. Initial visual audit

Baseline captures: `qa-artifacts/v44-baseline/` (rep + mobile).

The product is **not** starting from a weak baseline. It already has:

- A stated design philosophy in `globals.css`: *"a technical notebook / an editorial publication / a precision instrument"*.
- A full semantic token set (`bone`, `bone-raised`, `ink`, `graphite`, `stone`, `line`, `orange`, `cobalt`, `console`, status colors) with light **and** dark values.
- IBM Plex Sans + IBM Plex Mono — a distinctive, non-generic pairing.
- A complete primitive set in `src/components/ui/` (button, card, table, data-table, dialog, drawer, filter-bar, status-badge, empty-state, skeleton, progress, …).
- A single canonical shell (`v4-app-shell.tsx`, 408 lines) with domain + section navigation, collapse, mobile bottom nav, a "More" sheet, and a drawer.

### Findings

| # | Finding | Severity |
| --- | --- | --- |
| 1 | The sidebar carried no workspace identity — no org, no role. In a multi-tenant product the rail never says *whose* desk you are at. | P2 |
| 2 | Domain navigation was a flat list; `Settings` and `Admin` were separated by a rule but not labelled, so the IA read as nine equal items. | P2 |
| 3 | The header had no page identity. Only the brand and a search box; nothing confirmed where you were. | P2 |
| 4 | `V4Panel` is a double-bezel (outer ring + inner raised ring). The Rep Home profile card added a **third** ring inside it — a nested card, which the brief explicitly discourages. | P2 |
| 5 | The Inbox conversation-view chips were clipped mid-count at the queue panel's edge (`Follow-ups 10…`). | P2 |
| 6 | The dashboard "today" summary strip carried a ring inside the same raised bezel. | P3 |

---

## 4. Creative direction

Three directions were considered against the existing system rather than as replacements:

### A. The Precision Desk
Restrained, high-density, editorial typography, precise rules, strongly aligned operational data.
*Verdict:* closest to the existing philosophy. Adopted as the base.

### B. The Modern Operations Studio
More expressive navigation, refined surfaces, visually engaging data presentation.
*Verdict:* risks drifting toward the generic "modern SaaS" look the brief warns against. Not adopted.

### C. The Signal Workspace
Calm, information-first, priority/status/action driven.
*Verdict:* compatible with A. Its emphasis on priority and status informed the dashboard hierarchy work.

**Selected direction: A (The Precision Desk), with C's priority emphasis.** The existing system already encodes this; the sprint's job was to make it legible rather than to replace it.

### Design tokens (unchanged, confirmed in use)

```
--bone        #f7f6f3   canvas
--bone-raised #ffffff   raised surface
--ink         #1c1c1a   primary text / solid fill
--graphite             secondary text
--stone                muted metadata
--line        #e0ddd6   hairlines
--orange      #d4652f   the single signal accent
--status-success/warning/danger/info
```

Dark theme values are defined alongside each. Type: IBM Plex Sans (300–700), IBM Plex Mono (400–600).

---

## 5. Work completed

### 5.1 App shell — `src/components/v4/v4-app-shell.tsx`

- **Header page identity.** A breadcrumb (`Domain / Section`) now sits beside the brand, so every screen states where you are. Hidden below `md`.
- **Sidebar workspace identity.** A block at the top of the rail shows the organization initial, the organization name and the signed-in role. It collapses to the initial when the rail is collapsed.
- **Grouped navigation.** Domains are now labelled `OPERATE` (Home, Sales, Inbox, Work, Team, Content, Insights) and `SYSTEM` (Settings, Admin). The labels become `sr-only` when collapsed, so the rail stays accessible at 68px.

### 5.2 Rep Home — `src/components/coverage/rep-profiles-today.tsx`

- **Flattened the nested card.** The profile card no longer nests a third ring inside the panel's double bezel; it inverts to the canvas tone (`bg-bone`) against the raised bezel.
- **Flattened the summary strip** for the same reason.

### 5.3 Inbox — `src/app/(app)/chats/page.tsx`

- **View tabs now wrap** instead of clipping. `LinkTabs` receives `wrap`, so all four views and their counts are visible in the 300px queue panel.

---

## 6. Verification

| Check | Result |
| --- | --- |
| Typecheck | 0 errors |
| Lint | 0 errors |
| Focused unit tests | 57 passed |
| Production build | passes |
| Desktop render (1440) | rep dashboard / chats / tasks, admin dashboard / command / team — inspected |
| Mobile render (390 / 320) | **28 route-viewport pairs, 0 horizontal-overflow issues** across 14 surfaces |
| Before/after | `qa-artifacts/v44-baseline/` vs `qa-artifacts/v44-after/` |

Screenshots confirm: the rail now reads as a grouped, identified workspace; the dashboard profile card is flat; the inbox tabs are fully legible.

---

## 7. Accessibility

No new accessibility defects introduced. Specifically preserved:

- `aria-current="page"` on the active domain and section.
- `aria-label` on the collapsed rail items and the org block.
- The group labels degrade to `sr-only` rather than disappearing.
- Header breadcrumb is `aria-label="Current location"`.
- All new chrome is non-interactive text; no new focus traps.

Not verified: a full screen-reader pass, and axe over every route. Not claimed.

---

## 8. Outstanding stabilization risks (carried from V4.3 — NOT resolved)

1. **Baseline drift.** The frozen tag `release-v4.3-435a36a` still points at `435a36a`; production drifted to `e797a15` during the V4.3 watch and has since moved further. The tag was not rewritten.
2. **No persistent error telemetry; Vercel logs inaccessible.** `ERROR_WEBHOOK_URL` is unset, there is no error table, `reportError` has 2 call sites, and there is no `global-error.tsx`. Errors are visible only in runtime logs the authenticated Vercel account cannot read.
3. **Unresolved owner-role `set_config` attribution.** A transient burst of 94 owner `set_config` calls in a 90s window was observed during V4.3; it did not reproduce in quiet windows and coincided with concurrent QA automation. It is not closed.
4. **No explicit service-pool allowlist.** `createServiceSupabase()` is reachable from request paths (`/api/profile-intelligence/*`, `/api/organization/delete`, `/auth/callback`, and the `/admin/health` page). There is no allowlist mechanism.

None of these were changed to accommodate the UI work.

---

## 9. Known issues / not done

- **Not all 15 passes were completed.** Passes 2–15 (three fully rendered concept browsers, a full design-system rebuild, and per-surface redesigns for Inbox, Leads, Tasks, Team, Analytics, Health, AI and the remaining routes) were not finished. This record covers Pass 1 and a focused shell + dashboard + inbox elevation.
- **Owner visual approval is outstanding.**
- **Not deployed.** Push authorization did not include deployment; production remains on its own SHA.
- **Shared environment instability.** A concurrent agent is working in this repository and cycling the local `next build` / `next start` pair, which made repeated visual verification intermittent. Final mobile verification completed cleanly.
- `release-manifest.json` remains stale (`gitSha: 7e2dc40`, `productionGate: BLOCKED`) and must not be used as deployment evidence.

---

## 10. Git outcome

| | |
| --- | --- |
| Starting SHA | `ebbbdf2` |
| Commit 1 | `5045d40` — `style(relay): elevate the app shell and flatten the daily profile card` |
| Commit 2 | `55eb63d` — `fix(relay): wrap the inbox view tabs instead of clipping them` |
| Final local `main` | `55eb63d` |
| Final `origin/main` | `55eb63d` |
| Ahead | 0 |

Both commits are on `main` and pushed. No force-push, no history rewrite.
