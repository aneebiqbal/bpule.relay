# Complete UI inventory

Generated from `src/app/**/page.tsx` at base SHA `5bcb0f9d`. 112 pages.
Machine-readable: `artifacts/route-inventory.json`.

Classification key: **Fixture** = deterministic, browser-verified; **Guarded** = explicit server guard found; **Auth-gated** = no page-level guard (layout-level auth); **UX issue** = defect recorded in the register.

## Home / rep workspace (6)

| Route | Server guard | Classification |
|---|---|---|
| `/activate` | `public/none` | Auth-gated |
| `/dashboard` | `public/none` | Auth-gated |
| `/home` | `public/none` | Auth-gated |
| `/inbox-fixture` | `public/none` | Fixture · browser-verified |
| `/onboarding` | `public/none` | Auth-gated |
| `/qa-v4` | `public/none` | Auth-gated |

## Sales & prospecting (12)

| Route | Server guard | Classification |
|---|---|---|
| `/accounts` | `AdminOps` | Guarded: AdminOps |
| `/accounts/*` | `Ops` | Guarded: Ops |
| `/archive` | `public/none` | Auth-gated |
| `/leads` | `public/none` | Auth-gated |
| `/leads/*` | `public/none` | Auth-gated |
| `/leads/import` | `public/none` | Auth-gated |
| `/leads/new` | `public/none` | Auth-gated |
| `/prospect` | `public/none` | Auth-gated |
| `/revenue/email` | `public/none` | Auth-gated |
| `/upwork` | `public/none` | Auth-gated |
| `/upwork/*` | `public/none` | Auth-gated |
| `/upwork/new` | `public/none` | Auth-gated |

## Jobs (2)

| Route | Server guard | Classification |
|---|---|---|
| `/jobs` | `public/none` | Auth-gated |
| `/jobs/*` | `public/none` | Auth-gated |

## Inbox (1)

| Route | Server guard | Classification |
|---|---|---|
| `/chats` | `Ops` | Guarded: Ops |

## Work / tasks (1)

| Route | Server guard | Classification |
|---|---|---|
| `/tasks` | `public/none` | Auth-gated |

## Team (14)

| Route | Server guard | Classification |
|---|---|---|
| `/manage-profiles` | `public/none` | Auth-gated |
| `/profile-intelligence` | `public/none` | Auth-gated |
| `/profile-intelligence/*` | `public/none` | Auth-gated |
| `/profiles` | `public/none` | Auth-gated |
| `/team` | `Team` | Guarded: Team |
| `/team/*` | `Team` | Guarded: Team |
| `/team/eval` | `public/none` | Auth-gated |
| `/team/groups` | `Team` | Guarded: Team |
| `/team/groups/*` | `Team` | Guarded: Team |
| `/team/people` | `Team` | Guarded: Team |
| `/team/performance` | `Team` | Guarded: Team |
| `/team/profiles` | `public/none` | Auth-gated |
| `/team/profiles/*` | `public/none` | Auth-gated |
| `/team/tasks` | `public/none` | Auth-gated |

## Content (10)

| Route | Server guard | Classification |
|---|---|---|
| `/content` | `public/none` | Auth-gated |
| `/content-v2/*/today` | `public/none` | Auth-gated |
| `/content-v2/growth` | `public/none` | Auth-gated |
| `/content/*` | `public/none` | Auth-gated |
| `/content/growth` | `public/none` | Auth-gated |
| `/content/ideas` | `public/none` | Auth-gated |
| `/content/new` | `public/none` | Auth-gated |
| `/studio/drafts/*` | `public/none` | Auth-gated |
| `/studio/drafts/new` | `public/none` | Auth-gated |
| `/studio/post-detail` | `public/none` | Auth-gated |

## Insights (7)

| Route | Server guard | Classification |
|---|---|---|
| `/performance` | `public/none` | Auth-gated |
| `/reports` | `public/none` | Auth-gated |
| `/reports/activity` | `Ops` | Guarded: Ops |
| `/reports/pipeline` | `Ops` | Guarded: Ops |
| `/reports/revenue` | `Ops` | Guarded: Ops |
| `/reports/sales` | `Ops` | Guarded: Ops |
| `/reports/team` | `public/none` | Auth-gated |

## Settings (4)

| Route | Server guard | Classification |
|---|---|---|
| `/account` | `public/none` | Auth-gated |
| `/accountability` | `public/none` | Auth-gated |
| `/notifications` | `Ops` | Guarded: Ops |
| `/settings` | `public/none` | Auth-gated |

## Admin (20)

| Route | Server guard | Classification |
|---|---|---|
| `/admin` | `public/none` | Auth-gated |
| `/admin/accountability` | `public/none` | Auth-gated |
| `/admin/activity` | `public/none` | Auth-gated |
| `/admin/ai-usage` | `public/none` | Auth-gated |
| `/admin/command` | `public/none` | Auth-gated |
| `/admin/command-center` | `public/none` | Auth-gated |
| `/admin/command/*` | `public/none` | Auth-gated |
| `/admin/control-center` | `AdminOps` | Guarded: AdminOps |
| `/admin/dataset` | `public/none` | Auth-gated |
| `/admin/growth` | `public/none` | Auth-gated |
| `/admin/health` | `public/none` | Auth-gated |
| `/admin/people` | `public/none` | Auth-gated |
| `/admin/providers` | `public/none` | Auth-gated |
| `/admin/qa` | `public/none` | Auth-gated |
| `/admin/revenue-identities` | `public/none` | Auth-gated |
| `/admin/revenue-intelligence` | `public/none` | Auth-gated |
| `/admin/scoring-qa` | `public/none` | Auth-gated |
| `/admin/system` | `public/none` | Auth-gated |
| `/admin/targets` | `public/none` | Auth-gated |
| `/admin/training-data` | `public/none` | Auth-gated |

## Public / auth (29)

| Route | Server guard | Classification |
|---|---|---|
| `/acceptable-use` | `public/none` | Auth-gated |
| `/ai-policy` | `public/none` | Auth-gated |
| `/docs` | `public/none` | Auth-gated |
| `/docs/account` | `public/none` | Auth-gated |
| `/docs/analytics` | `public/none` | Auth-gated |
| `/docs/bd-workflow` | `public/none` | Auth-gated |
| `/docs/faq` | `public/none` | Auth-gated |
| `/docs/follow-ups` | `public/none` | Auth-gated |
| `/docs/founder-setup` | `public/none` | Auth-gated |
| `/docs/getting-started` | `public/none` | Auth-gated |
| `/docs/identities` | `public/none` | Auth-gated |
| `/docs/jobs` | `public/none` | Auth-gated |
| `/docs/leads` | `public/none` | Auth-gated |
| `/docs/outreach` | `public/none` | Auth-gated |
| `/docs/oversight` | `public/none` | Auth-gated |
| `/docs/prospect-check` | `public/none` | Auth-gated |
| `/docs/studio` | `public/none` | Auth-gated |
| `/docs/team` | `public/none` | Auth-gated |
| `/docs/usage` | `public/none` | Auth-gated |
| `/forgot-password` | `public/none` | Auth-gated |
| `/login` | `public/none` | Auth-gated |
| `/pricing` | `public/none` | Auth-gated |
| `/privacy` | `public/none` | Auth-gated |
| `/reset-password` | `public/none` | Auth-gated |
| `/security` | `public/none` | Auth-gated |
| `/signup` | `public/none` | Auth-gated |
| `/terms` | `public/none` | Auth-gated |
| `/trust` | `public/none` | Auth-gated |
| `/verify-email` | `public/none` | Auth-gated |

## Other in-shell (6)

| Route | Server guard | Classification |
|---|---|---|
| `/` | `public/none` | Auth-gated |
| `/facts` | `public/none` | Auth-gated |
| `/relay` | `public/none` | Auth-gated |
| `/relay/persona-daily` | `public/none` | Auth-gated |
| `/rep/assigned-profiles` | `public/none` | Auth-gated |
| `/workspace/*` | `public/none` | Auth-gated |

Remainder: `/`, `/facts`, `/relay`, `/relay/persona-daily`, `/rep/assigned-profiles`, `/workspace/*`.
