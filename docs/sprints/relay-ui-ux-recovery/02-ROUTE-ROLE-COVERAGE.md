# Route × role coverage

Machine-readable route inventory: `artifacts/route-inventory.json`.
Nav authority source: `src/lib/navigation/relay-shell-nav.ts` (`managerUp` = MANAGER/ADMIN/OWNER,
`adminUp` = ADMIN/OWNER).

## Expected access by area

| Area | OWNER | ADMIN | MANAGER | MEMBER | Unauthenticated |
|---|---|---|---|---|---|
| Home / Today | yes | yes | yes | yes | redirect `/login` |
| Sales, Prospects, Leads | yes | yes | yes | own queue only | redirect |
| Companies (`/accounts`) | yes | yes | hidden from nav | hidden | redirect |
| Jobs | yes | yes | yes | yes | redirect |
| **Inbox** | yes | org queue | team queue (`scope=me` for own) | own executable profiles | redirect |
| Work / Tasks | yes | yes | yes (+Team Tasks) | own tasks | redirect |
| Team | yes | yes | yes | hidden | redirect |
| Content | yes | yes | yes | yes | redirect |
| Insights | yes | yes | yes | yes | redirect |
| Settings, Notifications | yes | yes | yes | yes | redirect |
| Admin | yes | yes | hidden | hidden | redirect |
| Public / auth pages | yes | yes | yes | yes | yes |

## Verified in this sprint

| Check | Result |
|---|---|
| Direct unauthenticated navigation to all 112 routes | **81 → `/login`, 31 render, 0 hard failures, 0 crashes** (`artifacts/route-crawl.json`) |
| Cross-organization isolation of the Inbox read path | covered by unit contract on the scope rule; **not** exercised against two live orgs |
| Role actions hidden in UI are rejected by API | Work Setup capability gate + CAS verified by code path and unit test; not browser-exercised |
| Deep links from notifications/reports into `/chats?lead=` | SR-01/SR-02 fix the authority; browser confirmation blocked |
| OWNER / ADMIN / MANAGER / MEMBER journeys end-to-end | **BLOCKED** — no populated disposable environment |

## Why the browser matrix is blocked

The real `/chats` needs Better Auth over a populated database. Local bootstrap applies only
26/201 migrations to plain PostgreSQL (the set references Supabase `auth.users` and other
Supabase-specific objects). `relay_staging` is reachable but has **0 tables**, there is no
staging URL, and production may not be used for this testing. Vercel previews are blocked by
an account/billing restriction.

## Static authorization audit performed instead

- Every page's server guard extracted mechanically (`scripts/qa/sprint-route-inventory.mjs`).
- Every internal `href` resolved against the real route table
  (`scripts/qa/sprint-link-audit.mjs`): 2 unresolved, both `/icon.svg`.
- Canonical guards reused rather than duplicated: `requireOpsContext`,
  `requireTeamContext`, `requireAdminOpsContext`, `isProductAdmin`,
  `resolveConversationAuthz`.
