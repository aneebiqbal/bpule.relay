# Relay Sprint 7 — Data Management + Test-Data Cleanup

Branch `feat/relay-completion-program`. Commits `ee1f2311`, `80018f2f`.
Pushed; not deployed.

## 1. Data Management view (Control Center → Data)

- **Duplicate candidates** grouped by name + platform, every account id and
  status listed. Never merged; keep-separate is the default.
- **Dependency inspection** per channel across operator assignments, leads,
  messages, tasks, targets, knowledge and audit, with blockers listed.
- **Permanent deletion** only when every count is zero. The server recomputes
  the counts at request time and refuses a protected record (`409`) with its
  blockers; archive is offered instead.
- API: `GET /api/admin/data-management[?identityId=]`, `POST { identityId,
  confirm: true }`.

## 2. Browser diagnosis (the 502)

The dev server is healthy: `curl /admin/control-center` returns 307 → login,
and an authenticated `fetch` returns the full **204 KB** server-rendered page
(title, all tabs, 29 profile entries). Top-level browser navigation is being
served an empty document by the harness egress proxy (502 on the navigation
request) — not an application fault. Client interactivity therefore could not
be click-verified in this environment; the rendered markup and the live
service are the evidence.

## 3. Production test data removed

Classification was per-record with dependency counts; only zero-dependency
records with unambiguous test markers were deleted.

- **18 deleted**: 12 `ZZ*` fixtures (Bench/Recon/Ops/Ops2/Life dbg) and 6
  `TEST JSON` profiles — all with zero identities and zero dependencies.
- **1 archived**: `V6 fixture` (had 2 assignments, 4 targets, 4 coverage rows).
- **1 more deleted**: `JSONB VERIFY`.
- **Real channels verified intact**: Fizza·Upwork, Aneeb (LinkedIn + Upwork),
  Hassan (LinkedIn + Upwork), Madiha, Mehak (×2), Zaira, plus the archived
  `Muhammad Aneeb` and `Aneeb Iqbal`.
- Final: **17 profiles, 13 active** — all real people/accounts.

Left untouched deliberately: 2 `Aleena Saman` profiles (the CV you attached)
— ambiguous, and deleting them could remove real data.

## 4. Gates

| Gate | Result |
|---|---|
| TypeScript | clean |
| ESLint (changed) | 0 errors |
| Unit | see release note |
| Standalone build | exit 0 |

## 5. Still open

- Full Control Center action set (header target/split/task controls, status in
  the table density, archive/restore from the card).
- Playwright journey (blocked by the proxy issue above).
- Fizza·Upwork missing PRIMARY — explicit approval required; not applied.
