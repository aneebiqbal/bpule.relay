# Role & permission matrix

Machine-readable: `artifacts/route-role-matrix.json`. Authority source:
`src/lib/navigation/relay-shell-nav.ts`; canonical authorization helpers:
`requireOpsContext`, `requireTeamContext`, `requireAdminOpsContext`, `isProductAdmin`,
`resolveConversationAuthz`.

| Area | OWNER | ADMIN | MANAGER | MEMBER | Unauthenticated |
|---|---|---|---|---|---|
| Today / Home | yes | yes | yes | yes | redirect |
| Inbox | org | org | team (`scope=me` = own) | executable profiles | redirect |
| Team | yes | yes | yes | hidden | redirect |
| Admin | yes | yes | hidden | hidden | redirect |
| People & Roles `/admin/people` | yes | yes | redirect `/dashboard` | redirect | redirect |
| Work Setup `/admin/targets` | yes | yes + `MANAGE_TEAM_TARGETS` | only with capability | hidden | redirect |
| Profile detail people/coverage/knowledge | yes | yes | `MANAGE_REVENUE_IDENTITIES` | hidden | redirect |
| Profile detail target editor | yes | yes | `MANAGE_TEAM_TARGETS` | hidden | redirect |
| Upwork / Content / Jobs / Reports | yes | yes | yes | yes | redirect |

## Authorization verified by code inspection

- No page or route authorizes from `reps.role` after this program; `requireProductAdmin` /
  auth-context capabilities are used.
- `LeadReadScope.identityIds` widens access only when a caller passes it explicitly; the unscoped
  store branch is unchanged.
- Store gates check `organization_id` on every read added here.

## Authenticated verification: NOT RUN

The matrix above is derived from source, not from live sessions. Cross-organization denial,
suspended users, revoked permissions and organization switching were **not** exercised. See
`09-SECURITY-AND-RLS.md`.
