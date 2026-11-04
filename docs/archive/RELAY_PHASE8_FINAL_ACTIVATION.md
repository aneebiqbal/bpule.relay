# Relay — Phase 8 Final Activation

> **Date:** 2026-11-01 · **Branch:** `release-merge` (uncommitted work on top of `5ae9099`)
> **Verdict:** `PHASE 8 STATUS: NOT READY`. Second pass: security remediation verified on a production-schema copy, migration versions reconciled, and synthetic browser certification at 48/48. Real-data, deployed and production gates are still open (see §FINAL GATE).

How to read this report:
- **PASS** means a runtime check ran and passed.
- **CODE** means automated tests on synthetic data pass, but the runtime criterion has not run.
- **BLOCKED** means it did not run, and the blocker is named.

Nothing below is marked PASS from source inspection alone.

---

## Security escalation (read first)

A read-only schema dump of production (no row data) shows **eight public tables with RLS disabled and `GRANT ALL` to `anon` and `authenticated`**:

| Table | Approx. rows (planner estimate) |
|---|---|
| `notifications` | 0 |
| `relay_events` | ~7.6k |
| `relay_runs` | ~970 |
| `revenue_identities` | 11 |
| `identity_assignments` | 18 |
| `accountability_audit_log` | unknown |
| `activity_log` | unknown |
| `style_cards` | unknown |

Anyone holding the public anon key, which ships to every browser, can read and write these tables through PostgREST. No rows were read, so whether personal data is exposed is **unknown**.

**This needs Security/GRC review now; it does not wait for Phase 8.** `20261101135000_notifications_canonical_shape.sql` closes the `notifications` exposure and is independent of every other migration. The other seven tables need their own reviewed policies. Not written here: their access patterns are outside Phase 8.

---

## MIGRATIONS

**Production history.**
- The reconciliation is in `docs/RELAY_MIGRATION_RECONCILIATION_2026-11.md`, read-only, 2026-11-01.
- The 53 unrecorded versions cover 55 files. 47 of those files are present but unrecorded and safe to record as applied.
- Duplicate versions (`0090`, `0091`, `20261008000000`, `20261009000001`, `20261019000003`) must be resolved **before** any `migration repair` or `db push`. Re-running some of the duplicates would roll back later fixes.

**Truly needs applying, in this order:**

| # | File | Why |
|---|---|---|
| 1 | `20261023000000_scope_lead_company_uniqueness.sql` | Company-key unique index is still global; the file has its own `BEGIN`/`COMMIT` |
| 2 | `20261029120001_upwork_sender_attribution.sql` | Sender columns missing |
| 3 | `20261031120000_assigned_tasks.sql` | **`assigned_tasks` / `task_events` do not exist in production** |
| 4 | `20261101120000_operations_workspace.sql` | Manager scope, admin authority, notes, saved views |
| 5 | `20261101130000_meeting_booked_event.sql` | Constraint rejects `MEETING_BOOKED` |
| 6 | `20261101135000_notifications_canonical_shape.sql` | **New.** Canonical columns, RLS on, `anon` revoked. Nothing dropped or deleted |
| 7 | `20261101140000_notification_dedupe.sql` | Unique dedupe index (needs 6) |
| 8 | `20261101151000_lead_message_previews.sql` | **New.** Bounded preview view (`security_invoker`) |

**Applied to production:** none. Owner approval is required (Phase 44), and the security item above comes first.

## RLS

Ran on a throwaway `supabase/postgres:17.6.1.166` container with synthetic rows and production-shaped fixtures. Migrations 4–8 were applied in order, then **applied again** (idempotent).

| Harness | Before | After |
|---|---|---|
| `supabase/tests/sql/operations_workspace_rls.sql` | 8 pass / 3 fail (the 3 known bugs reproduced) | **32 / 0** |
| `supabase/tests/sql/phase8_activation_checks.sql` (new) | 2 / 0 (anon reads notifications; `MEETING_BOOKED` rejected) | **19 / 0** |

The new harness covers:
- **Notification shape:** legacy-row backfill, RLS on, a unique dedupe index.
- **Access:** anon locked out; recipient-only reads; org admin can read; nothing visible across organizations.
- **Writes:** in-org writes allowed, cross-org rejected; a replayed key is rejected; only the recipient can mark read.
- **Previews:** one 160-char preview per lead, the caller's RLS applied, anon denied.
- **Meeting constraint:** `MEETING_BOOKED` is accepted.

A harness fix was needed: the bare image's `auth.uid()` reads only `request.jwt.claim.sub`, so `supabase/tests/sql/auth_uid_shim.sql` now matches hosted GoTrue.

**Status:** RLS policies **PASS (isolated)**. RLS against real rows is **BLOCKED** (no non-production copy).

## ROLE MATRIX

BLOCKED. The REP A / MANAGER A / ADMIN A / OWNER A / REP B identities need a non-production database with auth: no Supabase branch exists, the Supabase gateway returns HTTP 402 `exceed_egress_quota`, and the Neon branch auth differs.

Admin-authority precheck (Phase 6):
- The exact counts need a read of `reps` × `organization_roles`, which is identity data.
- The aggregate count query is in `RELAY_OPERATIONS_WORKSPACE_V2.md` §10.3, for the team to run.
- About 168 production policies call `is_admin()` / `is_org_admin()` and change behaviour with migration 4.

## REAL DATA

BLOCKED. Production REST is restricted (402), and verification against production rows is a team task under the org's PII rule.

Read-only metadata used:
- Schema dump.
- `supabase migration list`.
- `inspect db table-stats`: about 814 leads, 5,179 `action_events`, 1,212 messages, 785 conversation states, 26 reps and 6 teams.

## Surfaces

The pages exist and compile. Unit, markup and contract tests pass. No browser run has happened, because there is no database serving traffic.

| Surface | Code | Browser / real data |
|---|---|---|
| TEAM, REP 360, TASKS, ACCOUNTS, CHATS, ACTIVITY, PERFORMANCE, REPORTS, TARGETS, NOTIFICATIONS, CMD-K, SAVED VIEWS | CODE | BLOCKED |

Changes in this pass:
- **TASKS:** production has no task tables. The `assignedTasks` capability probe returns false, so task surfaces show "Available after database activation" rather than erroring.
- **ACCOUNTS:** the silent 2,000-lead cap is replaced by paged reads (10,000 ceiling, stated in the UI). Tested with 2,600 leads across 650 companies.
- **PERFORMANCE / Team report:** the silent 5,000-event cap is replaced by paged reads (50,000 ceiling, stated in the UI). Tested with 7,500 events.
  - Production already holds about 5.2k events in total, so a 90-day window would have undercounted soon.
- **Profile attribution:** an event's profile is now the sending profile, falling back to the lead's profile. Team Performance and Admin Home use the same rule.
- **CHATS:** previews come from `lead_message_previews` once `messagePreviews` is on.
- **NOTIFICATIONS:** opening one from `/notifications` now marks it read (`NotificationOpenLink`, keepalive PATCH), the same as the bell. Mark all read is unchanged.
  - The capability probe now checks the canonical columns, so production's wrong-shaped table reports "unavailable" instead of failing writes.

**Notification emitters (Phase 2).** All at canonical write paths; none from UI.

| Event | Write path | Rule |
|---|---|---|
| Inbound reply | `POST /api/email/webhook` (`updateConversationOnReply`) | Owner notified; auto-replies and empty rows skipped; keyed by message id |
| Inbound reply (pasted) | `recordProspectReply` | No notice: only the owner can log here (self-skip). Documented at the call site |
| Meeting / proposal request | `loadConversation` → `notifyRequestIntent` | Only a **newly analysed** client turn with canonical intent `meeting_request` / `pricing`; keyed by turn; self-skip |
| Lead reassigned | `referLead` (the only owner-change path) | New owner actionable; previous owner informational unless they made the change; replay silent |
| Task overdue | Scheduler `EMIT_WARNING` job → `emitOverdueTaskNotifications` | `task_overdue:<taskId>:<dueAt>`; a reschedule opens a new window; skipped while task tables are absent |

Tests: `tests/notification-emitters.test.ts`, 21 tests covering INBOUND_REPLY, MEETING_REQUEST, PROPOSAL_REQUEST, LEAD_REASSIGNED, TASK_OVERDUE, REPLAY_DEDUPE, SELF_SKIP and ROLE_SCOPE.

## MEETING TRUTH

**CODE.** Nothing tests the nonexistent lead status `meeting_booked` any more; a test enforces this with a source grep.
- `training-data.ts` and `historical-outcomes.ts` use `leadReachedMeeting` (a `MEETING_BOOKED` event, or a stage at or after meeting).
- Admin Home profile rows now count `MEETING_BOOKED` events, not `daily_accountability`.
- The production `leads_status_check` confirms `meeting_booked` was never a valid status.

**Found, not fixed:** `computeHistoricalOutcomes` selects columns that `leads` does not have (`messages:id,lead_id,…`), so it errors and returns an empty map. Routing's historical bonus is therefore always empty in production. Fixing it would switch on a routing signal, which is a product decision that needs real-data review.

## SEND TRUTH

**CODE.** One definition, `src/lib/sales/send-truth.ts`: `CONNECTION_EVENTS`, `SENT_MESSAGE_EVENTS` and `isExecutedSend`.
- Reports and Targets import it.
- Rep Home's scoreboard now counts today's executed events (`aggregateMetrics`) instead of goal completions; its label is now "Replies sent".
- Admin Home profile rows count executed events.
- `tests/send-truth-contract.test.ts` feeds one synthetic day to every surface's counter: Team Performance and Rep Home, Admin profile rows, personal `/performance`, Targets, Reports and `isExecutedSend`.
  - All agree: 2 connections, 3 messages, 1 meeting, 1 win.
  - Drafts, generated copy and failures never count.
- Manager Home's team table still shows **target progress** from rep-day accountability, labelled as targets. It is not a send count.

## EGRESS

**CODE.** `docs/RELAY_OPERATIONS_EGRESS_AUDIT.md` §6:
- **Chat previews:** with the view, a 5,000-character body returns 160 bytes, 3% in the harness. Until it is applied, the fallback still reads full bodies for at most 4 × visible rows.
- **Accounts and Team report:** now paged. No byte measurements exist.

## PERFORMANCE

BLOCKED. `RELAY_PERF_LOG=1` instrumentation exists for the heavy loaders, but nothing has been measured: no database serves traffic.

## RESPONSIVE / ACCESSIBILITY / SCREENSHOTS

BLOCKED. Markup and a11y tests pass (server-rendered: list and table semantics, `aria-current`, screen-reader text for status), but the brief requires real-browser widths and keyboard runs. No screenshots were taken.

## TEST COUNTS

| Gate | Result |
|---|---|
| `tsc --noEmit` | PASS |
| eslint (changed files, errors) | PASS |
| contracts (`qa:contracts`) | PASS, 64/64 |
| vitest | PASS, **312 files / 4,568 tests** |
| `next build` | PASS |
| SQL harnesses (isolated) | PASS, 32/0 and 19/0 |

New suites:
- `notification-emitters` (21)
- `send-truth-contract` (9)
- `phase8-scale` (7)

Updated: three `slice-c` fixtures now carry the inbound text the auto-reply rule needs.

## FINAL SHA / DEPLOYED SHA / PRODUCTION SHA

None. Nothing is committed. Phase 41 requires a clean tree after **all** fixes, including those from browser QA that hasn't run, so no release-candidate SHA has been frozen. Nothing was deployed and production is unchanged.

## ROLLBACK

**Code:** revert the commits once they exist. The capability registry keeps unactivated features dark (`RELAY_DB_CAPABILITIES=none` forces that).

**Migrations:**

| Migration | Rollback |
|---|---|
| `…135000` | Additive. Rollback = drop the policies, `disable row level security`. **Do not** re-grant `anon` |
| `…140000` | Drop the index (duplicate rows it removed are not restorable; count first) |
| `…150000` | `drop view lead_message_previews` |
| `…130000` | Restore the previous check list (only if no `MEETING_BOOKED` rows exist) |
| `…120000` | Re-create the previous policies and helpers from `20260923000000` / `20261005000000` |

## DEBT

1. Seven non-notification tables with RLS off and `anon` `GRANT ALL` (Security).
2. Duplicate migration versions; 41 versions to repair after review.
3. `computeHistoricalOutcomes` broken select (routing bonus always empty).
4. Accounts and Team report: SQL rollups (company_key / GROUP BY RPC) before scopes approach the 10k / 50k ceilings.
5. `LEAD_LIST_COLUMNS` free-text columns; Account 360 task over-fetch; `/team/tasks` pagination (unchanged from the egress audit).
6. Three panes start at 1280px, not 1024 (design deviation, documented in Slice C).
7. Thread-review counts cover the visible page only.

## FINAL GATE

Updated 2026-11-01, second pass. Details are in `docs/RELAY_SECURITY_ANON_EXPOSURE_AUDIT.md` and
`docs/RELAY_PHASE8_SYNTHETIC_CERTIFICATION.md`.

| Gate | Status | Evidence |
|---|---|---|
| SECURITY / ANON EXPOSURE | **PASS on a non-production copy** · production BLOCKED (GRC sign-off + owner approval) | Production-schema copy: 15/46 before → **61/0** after; `20261101160000` |
| MIGRATION RECONCILIATION | **PASS** (repo side) · production `migration repair` not run | 0 duplicate versions left; all 10 pending files apply in order, twice, on the production schema |
| RLS 32/32 | **PASS** (isolated) | 8/3 → 32/0 |
| ACTIVATION 19/19 | **PASS** (isolated) | 2/0 → 19/0 |
| SYNTHETIC BROWSER MATRIX | **PASS** | 48/48 tests; 123 loads, 5 roles, no errors; 6 defects found and fixed |
| RESPONSIVE | **PASS** (synthetic) | 0 overflow at 1440/1280/1024/768/375 |
| ACCESSIBILITY | **PASS for critical** (synthetic) · color contrast open (design-token decision) | 72 axe scans: 0 critical |
| REAL-DATA SANITY | BLOCKED | Team task (PII rule); Supabase API was returning 402 |
| PERFORMANCE / EGRESS | CODE + synthetic timings · production `RELAY_PERF_LOG` BLOCKED | Local median wall time 1.9s; preview egress view verified in SQL and browser |
| DEPLOYED SHA PARITY | NOT STARTED | Needs commits by concern + an exact-SHA preview |
| PRODUCTION SMOKE | BLOCKED | After owner-approved activation |

**Scorecard:** not scored. Real-data, deployed and production evidence is still missing.

## FINAL VERDICT

```
PHASE 8 STATUS: NOT READY
```

What unblocks it, in order:
1. Security/GRC sign-off on `20261101135000` + `20261101160000`, and access-log review for the exposure window.
2. Non-production copy with Supabase auth: apply the 10 files in order (runbook §12), run all three SQL suites, then the role matrix with real accounts.
3. Commit by concern once tree ownership is clear (a concurrent writer was active in this tree), then freeze the SHA.
4. Deploy that exact SHA to a preview and run `playwright.synthetic.config.ts`-style checks against it.
5. With owner approval: production migrations, record them with `migration repair`, flip only verified capabilities, deploy the exact SHA, smoke test with `is_test=true`, real-data sanity and `RELAY_PERF_LOG=1`.
