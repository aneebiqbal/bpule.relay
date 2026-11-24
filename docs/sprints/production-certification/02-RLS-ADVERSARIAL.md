# RLS adversarial certification (real PostgreSQL)

Evidence: `artifacts/rls-adversarial.txt` — **31 checks, 0 failures**, exit 0.
Runner: `scripts/qa/rls-adversarial-staging.mjs` (use `npx tsx`).

## Method

Connections are made as the **runtime role** `relay_app` (member of `authenticated`), not a
superuser, and the identity is switched through the transaction-local `app.current_user_id`
GUC inside `BEGIN … set_config(..., true)`. This is the same boundary the application uses;
application-layer HTTP 404s were explicitly **not** accepted as evidence.

## Results

| Area | Checks | Result |
|---|---|---|
| Harness sanity — runtime role, not superuser | 1 | ok |
| SELECT isolation — leads (org A 5/6, org B 1/6, disjoint), conversation states, revenue identities | 5 | ok |
| Direct cross-org lead id invisible | 1 | ok |
| UPDATE / DELETE on a foreign lead affect 0 rows | 2 | ok |
| INSERT with forged `organization_id` blocked by RLS; row absent | 2 | ok |
| Unknown user id and empty identity see nothing | 2 | ok |
| Identity switch within one transaction changes scope | 1 | ok |
| RLS enabled + policies present on leads, conversation_states, revenue_identities, daily_target_plans, profile_coverage | 5 | ok |
| SECURITY DEFINER + pinned `search_path` for `current_org_id`, `current_rep_id`, `is_org_admin`; `auth.uid` reads only request context and touches no relation | 7 | ok |
| Work Setup CAS: first write succeeds, replayed stale revision returns `CONFLICT`, account intact | 3 | ok |
| Canonical writer refuses an identity owned by another organization | 1 | ok |

## Interpretation

Tenant isolation holds at the database layer, not merely in the API: forged organisation ids
are rejected by policy, unknown identities resolve to an empty set, and cross-tenant writes are
no-ops. The three authorization functions that read tables are SECURITY DEFINER with a pinned
`search_path = public`, so they cannot be redirected by a caller-controlled search path.

## Remaining limitations

- Policies are exercised with direct SQL against two fixture organisations; not every table in
  the schema was enumerated.
- `SECURITY DEFINER` functions beyond the authorization trio were not individually audited.
- No concurrent multi-connection race on the same account was run (the CAS conflict test is
  sequential).
