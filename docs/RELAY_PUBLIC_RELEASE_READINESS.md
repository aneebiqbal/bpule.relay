# Relay — Public Release Readiness (V4)

> Snapshot: **2026-11-10** · source SHA `e797a15` (clean tree, LOCAL == REMOTE).
> Companion: `docs/RELAY_PRODUCT_MAP.md` (canonical routes, roles, authorities).
>
> This is the release gate. It records what was measured, what is blocked, and
> what is known debt.

---

## 1. Verdict

```
PRODUCT:                    READY
PUBLIC PRODUCTION RELEASE:  BLOCKED — OPERATOR CUTOVER + DEPLOYED-SHA PROOF
SOURCE SHA:                 e797a15 — clean, typecheck/lint/contracts/tests/build green
BROWSER GATE:               PARTIAL (machine contention; see §8)
```

The product structure is coherent: one sidebar, one Inbox contract, one task
system, one profile/coverage model, one Team IA (Today · People · Profiles ·
Performance · Structure), and a role matrix enforced from `organization_roles`.

The database security model is **implemented and verified in code**; the
remaining release step is the Vercel owner cutover and a deployed-SHA proof.

---

## 2. Database security (implemented, operator cutover pending)

| Control | Status |
|---|---|
| Application role | `relay_app` (`rolbypassrls = false`, member of `authenticated`) |
| Application `DATABASE_URL` | points at `relay_app` |
| Service role | `neondb_owner`, reached only via `SERVICE_DATABASE_URL` |
| RLS | enabled (`relrowsecurity`) on every application table with policies |
| RLS identity | `app.current_user_id` set in-transaction on every request |
| Service boundary | `service-boundary-contracts.test.ts` + `runtime-request-paths.test.ts` prove user request paths never touch the service pool |
| Cron / webhooks | opt in to the service client explicitly |

**Operator cutover** (see `docs/RELAY_OWNER_CUTOVER_CHECKLIST.md`):

1. Vercel → Production env: `DATABASE_URL` → `relay_app` pooler URL;
   `SERVICE_DATABASE_URL` → owner/service URL; keep `RELAY_DB_PROVIDER=neon`,
   `RELAY_AUTH_PROVIDER=neon`.
2. Redeploy the exact `935131d` SHA.
3. Run `scripts/qa/verify-production-rls-cutover.mjs` and confirm fresh normal
   page traffic uses `relay_app` with **0 owner-role page connections**.

---

## 3. Role model

Canonical source: `organization_roles`. `reps.role` is bootstrap-only and can
never escalate a demoted user.

| Capability | REP | MANAGER | ADMIN | OWNER |
|---|---|---|---|---|
| Home cockpit | ✅ own | ✅ personal + team | ✅ org | ✅ org |
| Sales / Inbox / Work | ✅ own | ✅ team | ✅ org | ✅ org |
| Team domain | ❌ | ✅ managed teams | ✅ org | ✅ org |
| Profiles / coverage / targets | ❌ | ✅ | ✅ | ✅ |
| Admin domain | ❌ | ❌ | ✅ | ✅ |

Verified: a rep is redirected from `/team` → `/performance`, `/admin/command` →
`/dashboard`, `/team/profiles` → `/dashboard`, `/team/coverage` → `/dashboard`,
`/admin/people` → `/dashboard`.

---

## 4. Team IA (consolidated)

| Domain | Sections |
|---|---|
| Team | Today `/team`, People `/team/people`, Profiles `/team/profiles`, Performance `/team/performance`, Structure `/team/groups` |
| Admin | Command Center `/admin/command`, People & Roles `/admin/people`, Daily Targets `/admin/targets`, Revenue Intelligence `/admin/revenue-intelligence`, System / Quality `/admin/system` |

Retired Team URLs resolve with permanent (308) config redirects:

| From | To |
|---|---|
| `/team/coverage` | `/team` |
| `/team/workload` | `/team/people` |
| `/team/activity` | `/reports/activity` |
| `/team/targets` | `/team/performance?view=targets` |
| `/reports/team` | `/team/performance` |

The profile operating center (`/team/profiles/[profileId]`) has Overview ·
Channels · Knowledge · Execution · History, with per-channel primary/backups,
readiness, targets, today and coverage.

---

## 5. Gate results (frozen SHA `e797a15`)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS (0 errors) |
| Contract tests | PASS (4 files / 80 tests) |
| Full unit suite | PASS (368 files / 5,465 tests / 0 failed, run in 4 shards) |
| `next build` | PASS |
| Rep role crawl | PASS (21 routes, 0 failures) |
| Admin role crawl | PASS (all surfaces, real data) |
| Retired-URL redirects | PASS (308) |
| RLS runtime proof | PASS (`relay-app-integration.test.ts`, `runtime-request-paths.test.ts`) |
| Responsive matrix | PASS on Team Today / People / Profiles / Rep Detail (1440/1024/768/375, 0 overflow) |
| Axe | 0 critical / 0 serious on every verified surface |
| Inbox notes | not run (browser unavailable under load) |

---

## 6. Known debt

| Level | Item |
|---|---|
| P2 | Full responsive/axe matrix incomplete — Chromium could not launch under machine contention; the verified surfaces were clean |
| P2 | Inbox notes end-to-end check not run on the final SHA |
| P3 | Coverage readiness list is channel-first (`Fizza Iqbal` appears once per channel); the directory is person-first |

---

## 7. Release procedure

1. Owner applies the Vercel cutover (§2).
2. Redeploy `e797a15`; confirm `/api/version` reports `sha == e797a15`,
   `databaseProvider == neon`, `authProvider == neon`.
3. Run the production RLS cutover verifier (§2).
4. Re-run the responsive + axe matrices and the Inbox notes check on a quiet
   machine.
5. If all green: `RELAY V4 — PUBLIC RELEASE READY`.
