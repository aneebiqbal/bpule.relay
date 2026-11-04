# Relay security audit: anonymous-key exposure (2026-11-01)

**Status: remediation written and verified on a non-production copy. NOT applied to production.**
Applying it is an access-rights change, so it needs Security/GRC sign-off and an owner approval.

Fix: `supabase/migrations/20261101160000_close_anon_exposure.sql`, together with
`20261101135000_notifications_canonical_shape.sql` (notifications).
Proof: `supabase/tests/sql/security_anon_exposure_checks.sql`.

## 1. What was exposed

Source: the production schema-only dump taken 2026-11-01 (`supabase db dump --linked`). It contains no
rows, and no production rows were read at any point. Whether personal data was actually exposed is
**unknown**. Answering that needs the access logs, which only Security can review.

The anon key ships to every browser. Anyone holding it can do the following.

| Object | What anon could do | What it holds |
|---|---|---|
| `notifications` | read / write / delete all orgs | Message previews, lead names in titles |
| `relay_events` (~7.6k rows) | read / write / delete all orgs | Workflow events; payloads can carry lead and message context |
| `relay_runs` (~970) | read / write / delete all orgs | Workflow state, strategy and result snapshots, error text |
| `revenue_identities` (11) | read / write / delete all orgs | Sender personas: positioning, claims, voice, profile URLs |
| `identity_assignments` (18) | read / write / delete all orgs | Which rep may send as which identity |
| `accountability_audit_log` | read / write / delete all orgs | The audit trail itself (could be forged or erased) |
| `activity_log` | read / write / delete all orgs | Actor activity |
| `style_cards` | read / write / delete all orgs | A rep's writing style derived from their own samples |
| `signal_events` | insert into any org | Insert policy was `WITH CHECK (true)` for every role |
| 7 `SECURITY DEFINER` functions | act on any org by passing its id | See §2 |

**Root cause.** `0088_fix_missing_tables.sql` created these tables in production without RLS. The RLS
and policies that 0081, 0085 and 0086 were meant to add never ran there. Supabase grants `ALL` to
`anon` and `authenticated` by default, so RLS was the only barrier, and it was missing.

## 2. Functions that trusted a caller-supplied organization

All of these were `SECURITY DEFINER` (they run as the table owner and bypass RLS) and executable
by `anon`. None compared `p_org_id` / `p_person_id` with the caller.

| Function | Effect without a guard |
|---|---|
| `transition_relay_run(run, org, …)` | Move any org's run (ids were readable through `relay_runs`) |
| `get_run_events(run, org)` | Read any org's run events |
| `record_canonical_progress(org, person, …)` | Write accountability progress for anyone |
| `record_activity_event(rep, …, org, …)` (both overloads) | Same, legacy accountability path |
| `ensure_day_close` / `ensure_day_closes_for_person` | Create day-close rows for anyone |
| `refresh_few_shot_wins()` (no argument) | Recompute every org's few-shot wins (expensive) |

`create_relay_run`, `emit_relay_event`, `append_*`, `archive_search` and `match_proofs_by_embedding`
already check `current_org_id()`, so anon is refused. The migration revokes anon on the relay ones
anyway. Trigger functions cannot be called through the API.

## 3. The remediation (`20261101160000`)

Policies follow the Phase 8 permission model (rep → own, manager → managed team + self,
admin/owner → organization). The service role bypasses RLS and passes every guard.

| Table | Read | Write |
|---|---|---|
| `relay_runs` | admin: org; others: runs for a rep they can see, or for a lead they can see | none (RPCs / service role) |
| `relay_events` | admin: org; others: own actions, or events of a visible run or lead | none (RPC / service role) |
| `revenue_identities` | in-org (org configuration every role's filters name) | admin |
| `identity_assignments` | `can_see_rep(rep_id)`: own / team / org | admin (insert, update for upsert, delete) |
| `accountability_audit_log` | admin: org; rep: own entries | insert as yourself only; no update or delete |
| `activity_log` | same as audit log | same as audit log |
| `style_cards` | own; admin reads org | own only |
| `signal_events` | (unchanged) | insert into your own org only |
| `notifications` | 20261101135000: recipient, org admin | in-org; recipient marks read |

- Every guarded function gets `caller_may_act_for(p_org_id, p_person_id)`. The caller must be the
  service role, or in that org and acting for themself, or an org admin acting for someone in the
  org. Bodies are production's, copied verbatim from the dump; only the guard block differs.
- `CREATE OR REPLACE` resets function settings. The three functions that
  `20261101150000_pin_security_definer_search_path.sql` pins keep `search_path = public, extensions`,
  and the checks verify it.
- Anon loses `EXECUTE` on all ten functions. The no-argument `refresh_few_shot_wins()` becomes
  service-role only.
- Applied on its own, before `20261101120000`: "admin" means `reps.role = 'admin'`, and
  `can_see_rep()` falls back to self-or-admin. `20261101120000` widens both to `organization_roles`
  and manager scope. The policies call the functions by name, so they pick that up automatically.

### Known limits (deliberate, documented)

- **Leads RLS is org-wide in production** (`leads_select`: `organization_id = current_org_id()`).
  Runs and events tied to a lead are therefore visible to every member of that org, exactly as
  visible as the lead itself. Per-rep lead scope is enforced in the app. If leads RLS is tightened
  later, these tables tighten with it, with no further change.
- **Audit log writes fail in production today, before and after this change.** All 12 app inserts
  write `rep_id` / `event_type` / `detail`, columns production's `accountability_audit_log` lacks
  (it has `actor_id` / `action` / `new_value`). None check the error, so the trail silently records
  nothing. That is a compliance gap for GRC, separate from this exposure. The new insert policy
  requires `actor_id = current rep`, so whoever fixes the drift must set `actor_id`.
- `trend_items` / `trend_sources` (read `USING (true)`) and `content_post_structures`
  (authenticated read-all) hold shared reference content and were left alone.

## 4. Verification (isolated, synthetic, never production)

Non-production copy: the production schema dump loaded into a throwaway
`public.ecr.aws/supabase/postgres:17.6.1.166` container (0 load errors), seeded with fictional
orgs A/B.

| Run | Pass | Fail |
|---|---|---|
| Raw production schema (exposure reproduced) | 15 | 46 |
| After all 10 pending migrations, applied in order, **twice** | **61** | **0** |

The checks cover the following.
- **Catalog:** no public table with RLS off; no anon grant on the 9 tables; no anon `EXECUTE` on the 10
  functions; no literal-`true` write policy open to anon/public; pinned `search_path` kept.
- **Anon:** every table and RPC denied.
- **Cross-org, as an admin of org B:** reads of org A in all 7 tables return 0, and writes and RPCs
  are refused with 42501.
- **Role scope:**
  - Rep: own assignments, audit, style cards; cannot assign, create identities, forge an audit
    entry or edit a colleague's card.
  - Manager: self + team.
  - Admin: organization.
- **Guards:** a rep may act for themself; a rep acting for a colleague is refused; an admin may act
  for an org member; the service role passes.

The same migrations also apply cleanly on the full local Supabase stack used for browser
certification (`docs/RELAY_PHASE8_SYNTHETIC_CERTIFICATION.md`), and the app runs on them with
every role's journey passing.

## 5. Asks

1. **Security/GRC:**
   - Review the exposure window and the access logs for anon reads and writes on the tables in §1.
   - Decide whether any notification is required.
   - Sign off §3.
2. **Owner:** approve applying `20261101135000` and `20261101160000` to production, after a run on a
   non-production copy with Supabase auth (runbook §12 in `docs/RELAY_OPERATIONS_WORKSPACE_V2.md`).
3. **Engineering:** fix the audit-log column drift (§3) and decide on leads-level RLS scoping.
4. **Rotate the anon key?** It is public by design, so rotating it does not undo past access. The
   fix is RLS, not the key.
