# Relay — Information Architecture V2 (Sprint 1 · Phase 0)

> **Status:** Phase 0 complete · Phase 1 shell **in progress** (`RelayAppShell`, `relay-shell-nav.ts`). No routes deleted.  
> **Date:** 2026-10-31  
> **Sources:** `src/app/**`, `src/components/app-rail.tsx`, `src/components/command-palette.tsx`, `src/lib/auth/organization.ts`, `docs/RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md` (cross-checked; counts refreshed).

---

## 1. Product principle (unchanged)

Relay is a **sales execution operating system**. Canonical hierarchy:

```text
PERSON → COMPANY → OPPORTUNITY / LEAD → CONVERSATION → TASK → OUTCOME
```

Sprint 1 reorganizes **navigation and dashboards** around this model. It does **not** replace scoring, routing, follow-up policy, RLS, or outcome taxonomy.

---

## 2. Role model for IA decisions

| Sprint role | Canonical flags | `RepRole` fallback | Notes |
|---|---|---|---|
| **OWNER** | `authCtx.isOwner` | often `reps.role === 'admin'` | Org settings, full admin surfaces |
| **ADMIN** | `authCtx.isAdmin` (OWNER ∪ ADMIN) | bootstrap only | `requireProductAdmin()` / `isProductAdmin()` |
| **MANAGER** | `authCtx.isManager` ∧ ¬admin | `reps.role === 'manager'` or team `MANAGER` membership | `/admin/command`, `/team/[repId]` (scoped) |
| **REP** | MEMBER, not manager | `rep`, `sourcer` | Default execution user |

**Capability gates (examples):** `VIEW_TEAM_ANALYTICS` on `/team`; `profileAccess.canManage` on profile intelligence; growth on owner/admin only.

**Known nav/auth drift (fix in Sprint 1 shell):**

- `AppRail` uses `isAdmin={authCtx?.isAdmin ?? false}` from layout **but** also `role === 'admin'` for some labels; team link is **admin-only in rail** while managers use `/admin/command` and manager dashboard on `/dashboard`.
- `admin/qa` is a **client page with no server `requireProductAdmin()`** — relies on API 401/403 (treat as ADMIN-ONLY with a server gate in Sprint 1).

---

## 3. Current application shell (as-is)

| Layer | Implementation | User-facing concept |
|---|---|---|
| Layout | `(app)/layout.tsx` | Auth, onboarding, identity cookie, `ActiveIdentityProvider` |
| Primary chrome | `AppRail` (left sidebar + mobile drawer + bottom tabs) | “Today / Leads / Chats / Prospect / Studio / More…” |
| Profile context | Identity picker in rail (“Workspace”) | Revenue / sending identity |
| Command palette | `CommandPaletteProvider` + Cmd-K | Quick actions (admin group filtered via `/api/me/status`) |
| Back affordance | `AppBackButton` sticky strip | Ad-hoc hierarchy, not IA-driven |
| Home | `/dashboard` | **Today** — branches Admin / Manager / Rep |

There is **no top-level section nav** (Home, Sales, Conversations, …). Operational pages are flat or buried under **More**.

---

## 4. Current navigation map (`app-rail.tsx`)

### 4.1 Always visible (primary)

| Label | Path | Roles (effective) |
|---|---|---|
| Today | `/dashboard` | All |
| Leads | `/leads` | All |
| Chats | `/chats` | All |
| Prospect | `/prospect` | All |
| My Numbers | `/accountability` | **Non-admin reps only** |
| Studio | `/content` | All |
| My Team | `/team` | **Admin only in rail** (managers: palette / direct URL) |

### 4.2 “More” drawer (grouped)

| Group | Label | Path | Gate |
|---|---|---|---|
| Work | Import CSV | `/leads/import` | All |
| Work | Jobs | `/upwork` | All |
| Work | Conversations | `/relay` | All |
| Work | Inbound | `/inbound` | All |
| Work | Archive | `/archive` | All |
| Create | Relay Growth | `/content-v2/growth` | Admin |
| Intelligence | Profiles | `/profile-intelligence` | All (admin sees identities tab) |
| Intelligence | Proof | `/facts` | All |
| Admin | Command | `/admin/command` | Admin (`MORE_NAV`; managers reach via URL) |
| Admin | Revenue | `/admin/revenue-intelligence` | Admin |
| Admin | Scoring QA | `/admin/scoring-qa` | Admin |
| Admin | QA & Trust | `/admin/qa` | Admin (nav only; **weak page gate**) |
| Admin | People | `/admin/people` | Admin |
| Admin | AI Usage | `/admin/ai-usage` | Admin |
| Admin | Dataset | `/admin/dataset` | Admin |
| Admin | Training data | `/admin/training-data` | Admin |
| Account | Settings | `/settings` | All |

### 4.3 Mobile bottom nav

`/dashboard`, `/leads`, `/content`, `/settings` — **Chats and Prospect omitted**.

### 4.4 Command palette (high-traffic shortcuts)

Maps **Today → `/dashboard`**, **Open conversations → `/relay`**, **Inbound**, filters on `/leads`, admin → `/admin/command-center` (redirect chain to `/admin/command`). Admin commands hidden unless `isAdmin` from `/api/me/status`.

---

## 5. Authenticated route inventory (90 `page.tsx`)

Categories:

- **KEEP** — Retain route; may gain redirects or new shell only.
- **MERGE** — Same user job as another route; consolidate in nav (keep URL during Sprint 1).
- **MOVE** — Place under new top/left section in V2 IA.
- **ADMIN-ONLY** — Operational / org control.
- **INTERNAL/DEBUG** — Engineering, QA, datasets, eval.
- **DEPRECATE** — Dead, stub, or legacy redirect only.

### 5.1 `(app)` — core product (57 routes)

| Path | Category | V2 section (target) | Server gate / notes |
|---|---|---|---|
| `/dashboard` | **MERGE** → **MOVE** | **Home** (`/home` alias → dashboard during migration) | Role branches: AdminDashboard, Manager+Rep workspaces |
| `/accountability` | **MERGE** | Home → Personal scorecard / Reports → Team | Admins → `/admin/accountability` → `/admin/command` |
| `/leads` | **KEEP** | Sales → Leads | — |
| `/leads/[id]` | **KEEP** | Sales → Lead detail | — |
| `/leads/new` | **KEEP** | Sales | — |
| `/leads/import` | **MOVE** | Sales → Leads (secondary action) | — |
| `/prospect` | **MOVE** | Sales → Prospects | — |
| `/upwork` | **MOVE** | Sales → Upwork | — |
| `/upwork/[id]` | **KEEP** | Sales → Upwork | — |
| `/upwork/new` | **KEEP** | Sales → Upwork | — |
| `/archive` | **MOVE** | Sales → Archive | Search / proof archive |
| `/chats` | **MERGE** | **Conversations** (primary inbox UX) | Workspace-scoped inbox |
| `/relay` | **MERGE** | **Conversations** or Home task queue | Canonical **Relay task queue** UI |
| `/inbound` | **MERGE** | **Conversations** → Inbound | Overlaps chats/reply buckets |
| `/performance` | **MERGE** | Reports → Activity (rep) | Personal heatmap; not in rail |
| `/team` | **MOVE** | **Team** → Performance / People list | `can(VIEW_TEAM_ANALYTICS)` |
| `/team/[repId]` | **MOVE** | **Team** → `/team/people/[id]` (rename later) | Owner/admin/self/team member |
| `/team/eval` | **INTERNAL/DEBUG** | Intelligence (hidden) | Eval tooling |
| `/admin/command` | **MOVE** | **Home** (admin/manager command) | Admin ∪ Manager |
| `/admin/command/[repId]` | **KEEP** | Team → Rep drill-down | Admin ∪ Manager |
| `/admin/command-center` | **DEPRECATE** | stub → `/admin/command` | Redirect only |
| `/admin/accountability` | **DEPRECATE** | stub → `/admin/command` | Redirect only |
| `/admin/activity` | **DEPRECATE** | stub → `/admin/command` | Redirect only |
| `/admin` | **DEPRECATE** | stub → command | `requireProductAdmin` |
| `/admin/revenue-intelligence` | **MOVE** | **Reports** → Revenue | `requireProductAdmin` |
| `/admin/revenue-identities` | **DEPRECATE** | → `/profile-intelligence?tab=identities` | stub |
| `/admin/scoring-qa` | **MOVE** | **Intelligence** → Scoring QA | `requireProductAdmin` |
| `/admin/qa` | **MOVE** | **Intelligence** → Routing / threads / quality | **Add server admin gate** |
| `/admin/people` | **MOVE** | **Team** → People | Admin |
| `/admin/targets` | **MOVE** | Team or Accounts (settings) | Admin; not in rail today |
| `/admin/ai-usage` | **MOVE** | **Reports** → AI Usage | `requireProductAdmin` |
| `/admin/dataset` | **INTERNAL/DEBUG** | Intelligence (admin) | ML dataset |
| `/admin/training-data` | **INTERNAL/DEBUG** | Intelligence (admin) | Training exports |
| `/admin/growth` | **DEPRECATE** | Unlinked; API used by growth UI | Redirect candidate → `/content-v2/growth` |
| `/profile-intelligence` | **MOVE** | **Accounts** or **Intelligence** | Admin: identities; all: people profiles |
| `/profile-intelligence/[id]` | **KEEP** | Accounts / Intelligence detail | `profileAccess` |
| `/profiles` | **MERGE** | **Accounts** → legacy CV profiles | Overlaps profile-intelligence |
| `/manage-profiles` | **MERGE** | **Accounts** (admin) | Onboarding link |
| `/rep/assigned-profiles` | **MERGE** | Profile switcher / Settings | Palette “Switch identity” |
| `/workspace/[revenueIdentityId]` | **KEEP** | Accounts → identity workspace | Admin view |
| `/facts` | **MOVE** | **Content** or Intelligence → Proof | — |
| `/content` | **KEEP** | **Content** → Studio hub | Redirects to v2 today |
| `/content-v2/[id]/today` | **KEEP** | Content → Studio | Persona owner or admin |
| `/content-v2/growth` | **MOVE** | **Content** → Growth | Admin-only page gate |
| `/content/new` | **KEEP** | Content | — |
| `/content/[id]/*` (5 routes) | **DEPRECATE** | Legacy stubs → content-v2 | Redirects |
| `/studio/post-detail` | **KEEP** | Content (deep) | — |
| `/relay/persona-daily` | **DEPRECATE** | Unlinked | `notFound` without persona |
| `/settings` | **KEEP** | User menu; Owner → org settings | Admin sections inside page |
| `/account` | **KEEP** | Settings / Accounts | Company key gate |
| `/activate` | **KEEP** | Onboarding-adjacent | — |
| `/revenue/email` | **MOVE** | Accounts / Sales (email channel) | Low traffic |

### 5.2 `(app)` duplicate / overlapping jobs

| User question | Competing routes today | Sprint 1 canonical surface |
|---|---|---|
| What do I do now? | `/dashboard`, `/relay`, `/chats`, `/leads?filter=*` | **Home** (rep/manager/admin variants) |
| Who replied? | `/chats` (inbox), `/leads?filter=reply`, `/relay` | **Conversations** + Home metrics |
| Team health? | `/dashboard` (admin), `/admin/command`, `/team`, `/accountability` | **Home** (manager/admin) + **Team** |
| Revenue / funnel analytics? | `/dashboard` pipeline section, `/admin/revenue-intelligence` | **Reports** (not duplicated on Home) |
| Profiles / senders? | Identity picker, `/profile-intelligence`, `/profiles`, `/manage-profiles`, `/rep/assigned-profiles` | **Top bar profile switcher** + **Accounts** |
| QA / routing / staleness? | `/admin/scoring-qa`, `/admin/qa` | **Intelligence** left rail |

### 5.3 Other authenticated routes

| Path | Category | Notes |
|---|---|---|
| `/onboarding` | **KEEP** | Pre-app |
| `/studio/drafts/[id]` | **KEEP** | Studio deep link |
| `/studio/drafts/new` | **DEPRECATE** | 0 nav refs |

### 5.4 `(public)` + landing (33 routes)

**KEEP** — marketing, auth, legal, docs. Not part of app IA refactor except post-login default remains `/dashboard` → future `/home`.

---

## 6. Proposed V2 top navigation (Sprint 1 target)

| Section | Rep | Manager | Admin | Owner |
|---|---|---|---|---|
| Home | ✓ | ✓ | ✓ | ✓ |
| Sales | ✓ | ✓ | ✓ | ✓ |
| Conversations | ✓ | ✓ | ✓ | ✓ |
| Accounts | — | — | ✓ | ✓ |
| Team | — | ✓ | ✓ | ✓ |
| Intelligence | — | — | ✓ | ✓ |
| Content | ✓ | ✓ | ✓ | ✓ |
| Reports | ✓ | ✓ | ✓ | ✓ |
| Settings (org) | — | — | partial | ✓ |

Right chrome: **Search / Cmd-K**, **Notifications**, **Working as [profile]**, **User menu**.

---

## 7. Proposed contextual left rail (by section)

### Sales

| Item | Current route |
|---|---|
| Prospects | `/prospect` |
| Leads | `/leads` |
| Pipeline | `/leads` (board view — same route, saved view) |
| Upwork | `/upwork` |
| Tasks | `/relay` or Home queue (TBD — expose unified task UX) |
| Archive | `/archive` |

### Conversations

| Item | Current route |
|---|---|
| Inbox | `/chats` |
| Task queue | `/relay` |
| Inbound | `/inbound` |

### Team

| Item | Current route |
|---|---|
| People | `/admin/people` (admin), `/team` (live board) |
| Teams | `/team` |
| Tasks | manual tasks (new UX) + `/admin/command` |
| Performance | `/team`, `/performance`, `/accountability` → consolidated |

### Intelligence

| Item | Current route |
|---|---|
| Scoring QA | `/admin/scoring-qa` |
| Routing QA | `/admin/qa` (routing section) |
| Message Quality | `/admin/qa` (messages) |
| Learning | `/admin/training-data`, `/admin/dataset` (internal) |

### Content

| Item | Current route |
|---|---|
| Studio | `/content` → `/content-v2/[id]/today` |
| Growth | `/content-v2/growth` |
| Proof | `/facts` |

### Reports

| Item | Current route |
|---|---|
| Sales | TBD / pipeline on dashboard today |
| Team | `/team` + admin tables |
| Pipeline | dashboard analytics section |
| Revenue | `/admin/revenue-intelligence` |
| Activity | `/performance` |
| AI Usage | `/admin/ai-usage` |

---

## 8. Home dashboard mapping (existing implementation)

| Role | Current entry | Primary components | Sprint 1 intent |
|---|---|---|---|
| Rep | `/dashboard` | `RepDashboard` / `RepWorkspace`, `DoThisNext`, `BdDailyDesk` | Rep Home — trim vanity analytics |
| Manager | `/dashboard` | Manager today + team tab data | Manager Home — team attention block |
| Admin/Owner | `/dashboard` | `AdminDashboard` + pipeline analytics | Split: **Command Center** vs rep-style work queue |

**Do not rewrite scoring.** Reuse `loadAccountabilityDashboard`, `buildRelayQueue`, `rankNextActions`, `loadTeamDay`, `RepWorkspaceData`.

---

## 9. Task system (existing → exposed)

Implicit tasks already flow through:

- `RelayTask` / `RelayTaskKind` on `/relay`
- `RelayTodayAction` on `/dashboard`
- Inbox buckets on `/chats` (`reply`, `followup`, `active`)

Sprint 1 **canonical categories** (UX labels):

`REPLY` · `FOLLOW_UP` · `RESEARCH` · `CONNECT` · `SEND_MESSAGE` · `PROPOSAL` · `MEETING` · `REVIEW` · `ADMIN`

Map from existing kinds in implementation phase — **no new competing state machine**.

---

## 10. Redirect plan (Phase 12 — not executed in Phase 0)

| Old path | New canonical | Action |
|---|---|---|
| `/dashboard` | `/home` (optional alias) | 302/rewrite when `/home` exists |
| `/admin/command-center` | `/admin/command` | Already redirected |
| `/admin/accountability` | `/admin/command` | Already redirected |
| `/accountability` (admin) | `/admin/command` | Already redirected |
| `/conversations` | `/chats` or `/conversations/inbox` | Route removed from tree — use `/chats` |
| Chats + Relay + Inbound | `/conversations/*` | Subpaths or query views |

---

## 11. Phase 0 decisions

1. **No route deletions** until redirect tests exist (Phase 19).
2. **Single shell** replaces `AppRail`-as-primary-IA; left rail becomes **contextual by section**.
3. **Profile switcher** moves to **top bar** (“Working as …”); cookie behavior unchanged (`ACTIVE_IDENTITY_COOKIE`).
4. **Managers** must see **Team** in top nav without pretending to be admin.
5. **Admin command** remains distinct URL (`/admin/command`) but appears as **Admin Home** in IA; owner/admin `/dashboard` analytics move toward **Reports** over time.
6. **`/team/[repId]`** evolves to **Rep Detail** (`/team/people/[id]`) — alias old path in Phase 13.

---

## 12. Related deliverables (later phases)

| Doc | Phase |
|---|---|
| `docs/RELAY_NAVIGATION_V2.md` | 21 — old → new route matrix + redirects |
| `docs/RELAY_UI_SYSTEM_V2.md` | 22 — shell, tables, typography |

---

## 13. Inventory metrics

| Metric | Value |
|---|---|
| Total `page.tsx` | 90 |
| Authenticated app pages | 57 |
| Public / landing / onboarding | 33 |
| Primary rail items | 4–6 (+ Studio) |
| “More” items | 16 |
| Admin-only pages (server-gated) | 10+ |
| Stub / redirect-only admin routes | 5 |
| Conversation surfaces | 3 (`/chats`, `/relay`, `/inbound`) |
| Home / dashboard surfaces | 1 URL, 3 role layouts |
| Profile/sender surfaces | 5+ URLs |

---

## 14. Risks to address during shell build

1. **Manager team nav** missing from rail today.  
2. **`admin/qa` page** lacks server-side admin redirect.  
3. **Pipeline analytics on every Today load** — performance target: progressive loading (Phase 17).  
4. **`AppRail` `isAdmin` prop** must always use `authCtx.isAdmin`, not `reps.role`.  
5. **Mobile bottom nav** ignores Chats/Conversations — fix in responsive pass (Phase 15).

Phase 0 complete. Proceed to **Phase 1 — global application shell**.
