# Security and RLS

## What was verified (code-level)

- **No `reps.role` authorization** remains in the touched surfaces. `/admin/people` uses
  `requireProductAdmin`; profile detail uses auth-context capabilities.
- **Organization boundary:** every query added in either program is
  `.eq('organization_id', …)`. The store's unscoped read branch is byte-identical to baseline, so
  widening required passing a scope explicitly.
- **Coverage/scope authority** (`LeadReadScope.identityIds`, `resolveConversationAuthz`) mirrors
  the queue; out-of-scope leads are indistinguishable from missing ones.

## What was NOT verified

| Check | Status |
|---|---|
| Live cross-organization read denial | **NOT RUN** — needs two populated orgs |
| Live cross-organization mutation denial | **NOT RUN** |
| RLS policies exercised against isolated PostgreSQL | **NOT RUN** — local bootstrap applies 174/201 migrations |
| SECURITY DEFINER function boundaries | not re-audited this pass |
| Suspended user / revoked session live behaviour | **NOT RUN** |
| Adversarial ID substitution across leads, conversations, tasks, documents | **NOT RUN** |

## Staging blocker, precisely

`scripts/qa/bootstrap-probe.sh` stubs the Supabase-only objects (`auth.users`, `auth.uid()`,
`auth.role()`, `authenticated`/`anon`/`service_role` roles) and replays all 201 migrations:

```
PASS=174 FAIL=27
```

Remaining blockers observed: `pgvector` extension absent locally (blocks eval/semantic migrations),
a migration-order cascade (`golden_set`), and later migrations referencing columns/tables that
only exist once the earlier ones apply. Beyond schema, provisioning Better Auth tables, seed
organizations and configuring the app to use them was not attempted.

This is recorded as the exact blocked step rather than "staging unavailable".

## Secrets

No secret was printed, committed or rotated. Previously exposed Aiven administrator credential and
GitHub PAT remain **owner console actions**. Vercel account remains billing-blocked. Production
was never used for testing.
