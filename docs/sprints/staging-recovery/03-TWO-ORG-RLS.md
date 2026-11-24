# Two-organization security results

Fixtures: Org A (`0a000000-…-0001`) and Org B (`0b000000-…-0001`), each with
OWNER/ADMIN/MANAGER/MEMBER. Org B owns a lead that org A has no reference to.

## Tested live

| Test | Result |
|---|---|
| Org A manager queue does not contain the org B company | ok |
| Org A member requests the org B conversation id over the API | **HTTP 404** |
| Org A member cannot read an org A identity with no seat/coverage | **HTTP 404** |

Authorization is enforced in application code (`LeadAccessDeniedError`, 404) on top of
organization-scoped queries; the failure is indistinguishable from "missing".

## RLS status — honest limitation

The local staging database provisions all 201 migrations, including the RLS policies,
and the app sets `app.current_user_id` inside each transaction. However the **policy
level** adversarial suite (forged GUC, SECURITY DEFINER boundary, per-table policy
matrix, two-role connection test) was **not** executed in this pass. Unit-level RLS
contracts and the `scripts/rls-multitenant.mjs`-style checks remain unrun here.

Cross-tenant denial is therefore proven at the application layer only. That is a real
gap, recorded rather than claimed.

## Not tested

Suspended/revoked *session* behaviour beyond sign-in refusal, organization switching in
one browser session, and transaction-local organization context during concurrent
Work Setup writes (atomicity is unit/PG-harness verified, not run under forged identity).
