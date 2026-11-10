# RELAY V6.0 — Multi-Operator Responsibility Foundation

**Date:** 2026-11-11
**Status:** Design updated after builder check; blocked on tree freeze
**Sprint:** V6.0 (Project 1 of 5)
**Base SHA (intended):** `108f3bf`
**Freeze status:** BROKEN — see §0.

---

## 0. Freeze status

At the time of writing, the working tree is **not clean** and commits are
landing every few minutes from another writer:

```
108f3bf 01:29:47 test(relay): /inbound is retired, not a conversation destination
4e893ca 01:28:32 feat(relay): Team Today surfaces needs-setup
c3541fc 01:26:41 fix(relay): retire /inbound, restore tasks on revoke, one coverage-expiry helper
c2f51a7 01:22:03 fix(relay): close cross-org write paths and harden the task state machine
27b0ade 01:13:57 feat(relay): remove-daily-plan, target-change notifications, person-first targets, Inbox filter parity
```

Uncommitted work in the tree:

- `D src/app/(app)/inbound/page.tsx`
- `D src/components/inbound/inbound-desk.tsx`
- `M src/components/chats/chat-intelligence-panel.tsx`
- `M src/components/leads/leads-table.tsx`
- `M src/components/operations/assign-task-button.tsx`
- `M src/components/tasks/assign-task-dialog.tsx`
- `M src/lib/operations/chat-intelligence.ts`
- `M src/lib/tasks/load-unified-tasks.ts`
- `?? supabase/migrations/20261111020000_assigned_tasks_identity_ref.sql`

Two of these overlap this design directly:

- `c3541fc` already added a coverage-expiry helper and restore-on-revoke.
- `src/lib/tasks/load-unified-tasks.ts` is a parity consumer listed in §8.

**V6.0 must not start until the tree is clean and the other writer has
stopped.** This is a §0 requirement, not a preference.

---

## 1. Intent

Relay has three responsibility concepts that the product currently treats as
interchangeable: **PRIMARY OWNER**, **ACTIVE OPERATOR**, and **BACKUP**. They
are not.

- **PRIMARY OWNER** is permanent. Exactly one per profile. Changes only by an
  explicit permanent transfer.
- **ACTIVE OPERATOR** is someone allowed to execute a profile *right now*, via
  temporary coverage. There may be zero, one, or several.
- **BACKUP** is eligibility for future coverage. It grants nothing today.

The goal of V6.0 is to make those semantics **correct in the data model and in
one execution authority**, before any dashboard or target work happens. V6.0
does not redesign the Team command center, does not redesign targets, and does
not delete dead UI. Those are Projects 3–5.

The acceptance question for this sprint:

> If a profile is in REPLACE coverage, does the primary owner genuinely lose
> execution — and does he get it back automatically when coverage ends?

---

## 2. Scope

### In scope

- `SHARED` / `REPLACE` coverage mode, stored explicitly.
- One canonical execution authority, consumed by every execution surface.
- REPLACE removes the primary from execution; SHARED keeps the primary and
  adds operators.
- Multiple simultaneous active operators.
- Coverage-mode conflict rejection.
- Acknowledgement of new responsibility, separate from readiness.
- Acknowledgement escalation policy + deduped notifications.
- Access-issue reporting, separate from acknowledgement and ownership.
- Restore/expiry behaviour for both modes.
- Task handoff only for REPLACE.
- Parity across profile switcher, Rep Home, Inbox, Leads, Upwork, LinkedIn,
  Daily Actions and Tasks.
- Contracts + acceptance fixtures.

### Out of scope (later projects)

- Team command center redesign (Project 3) — V6.0 only exposes the canonical
  unacknowledged-responsibility projection Project 3 will consume.
- Target/action registry and shared profile targets (Project 2). **No
  `daily_targets` migration.**
- Profile-scoped rep work redesign (Project 4).
- Profile delete/archive/merge + dead UI removal (Project 5).

### Anti-goals

- A second coverage table.
- A second execution authority.
- Silent reclassification of historical coverage.
- Duplicate targets per operator during shared coverage.
- Temporary coverage rewriting primary ownership or historical attribution.

---

## 3. Current state (audit findings)

### 3.1 Canonical model already exists

| Concept | Where |
|---|---|
| One person, many channels | `profiles.person_id` |
| Channel identity | `revenue_identities` (`profile_id`, `channel`) |
| Eligibility | `identity_assignments` (unique `revenue_identity_id, rep_id`) |
| Ownership + backup chain | `profile_coverage` (`role` PRIMARY/BACKUP, `priority`, `active`; partial unique index enforces one active PRIMARY) |
| Temporary coverage | `coverage_assignments` (`primary_rep_id`, `covering_rep_id`, `effective_from`, `effective_until`, `status`, `reason`) |
| Coverage audit | `coverage_events` |
| Access confirmation | `profile_readiness` |
| Daily state | `rep_availability` / `rep_day` / `organization_day` |
| Targets | `daily_targets` (unique `rep_id, revenue_identity_id, activity_type`) |
| Completion | `daily_accountability` |
| Execution ledger | `action_events` |

### 3.2 The execution authority already exists — and is duplicated

`listExecutableIdentitiesForRep()` in `src/lib/coverage/access.ts` is documented
as *"THE canonical execution scope for any rep: active PRIMARY ownership plus
ACTIVE, NON-EXPIRED coverage."*

Two other implementations of the same rule exist:

- `listMyWorkableIdentities()` in `src/lib/store/supabase-store.ts`
- `getAuthorizedIdentities()` in `src/lib/auth/workspace.ts` (wraps the above)

**They are not exactly equivalent.** The builder check proved the difference:
`listMyWorkableIdentities()` includes *archived* identities on primary
profiles, while the canonical authority excludes them. The canonical rule is
the correct one (archived identities are never executable), so the old wrapper
carries a defect, not a semantic difference to preserve.

### 3.3 Defects found while auditing

1. **`src/app/api/rep/today/route.ts` reads `identity_assignments` directly.**
   A rep with backup eligibility on a profile sees that profile's targets in
   "Today" even though backups are not executable.
2. **`restorePrimaryCoverage()` and `revokeCoverage()` use `.maybeSingle()` on
   active coverage for a profile.** With more than one active operator this
   throws or silently picks one.
3. **`evaluateDailyCoverage()` maps one active coverage row per profile**
   (`activeByProfile`), so it cannot represent multiple operators.
4. **`CoverageMode` in `src/lib/coverage/engine.ts` is the *policy* mode**
   (`AUTO_COVER | APPROVAL_REQUIRED | MANUAL_ONLY`), not the execution mode.
5. **`activity_log` is dead** (0 consumers). Not removed in V6.0 (Project 5).

### 3.4 Production data (§44 classification)

```
coverage_assignments:  7 distinct rows, ALL status = COMPLETED
ACTIVE coverage rows:  0
profile_readiness:     13 rows
identity_assignments:  16 rows
revenue_identities:    4 active LinkedIn, 2 archived LinkedIn,
                       6 active Upwork, 1 archived Upwork, 1 active other
```

**Conclusion: there is no active coverage to classify.** Nothing is ambiguous.
Historical rows keep `coverage_mode = NULL` rather than being guessed.

---

## 4. Data model

### 4.1 `coverage_assignments` gains a mode

```sql
alter table coverage_assignments
  add column if not exists coverage_mode text
  check (coverage_mode in ('SHARED', 'REPLACE'));
```

Nullable, **no default**. New writes must set it explicitly. Existing rows stay
`NULL` (unknown / historical) — there are no ACTIVE rows, so nothing is
reclassified.

### 4.2 `coverage_events` records the mode

```sql
alter table coverage_events
  add column if not exists coverage_mode text
  check (coverage_mode in ('SHARED', 'REPLACE'));
```

### 4.3 New table: `responsibility_acknowledgements`

One canonical acknowledgement authority covering both permanent and temporary
responsibility. Readiness stays in `profile_readiness` and is never overloaded.

```sql
create table if not exists responsibility_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  rep_id uuid not null references reps(id) on delete cascade,

  subject text not null check (subject in ('PRIMARY', 'COVERAGE')),
  coverage_assignment_id uuid references coverage_assignments(id) on delete cascade,
  -- The ownership/coverage row this acknowledgement belongs to. Lets a genuinely
  -- new assignment episode re-arm the banner without re-nagging on every save.
  source_row_id uuid,

  assigned_at timestamptz not null,
  acknowledged_at timestamptz,

  access_issue text check (access_issue in (
    'CANNOT_LOG_IN', 'CREDENTIALS_MISSING', 'TWO_FA_BLOCKED',
    'ACCOUNT_RESTRICTED', 'OTHER'
  )),
  access_issue_note text,
  access_issue_at timestamptz,
  access_issue_reported_by uuid references reps(id) on delete set null,

  resolved_at timestamptz,
  resolved_by uuid references reps(id) on delete set null,
  resolve_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ack_primary_uniq
  on responsibility_acknowledgements (organization_id, profile_id, rep_id)
  where subject = 'PRIMARY';

create unique index if not exists ack_coverage_uniq
  on responsibility_acknowledgements (coverage_assignment_id)
  where subject = 'COVERAGE' and coverage_assignment_id is not null;

create index if not exists ack_org_unacknowledged_idx
  on responsibility_acknowledgements (organization_id, acknowledged_at)
  where acknowledged_at is null;
create index if not exists ack_profile_idx on responsibility_acknowledgements (profile_id);
create index if not exists ack_rep_idx on responsibility_acknowledgements (rep_id);

alter table responsibility_acknowledgements enable row level security;
```

Policies (all `to authenticated`, all org-scoped):

- **select** — `rep_id = current_rep_id()` OR `is_org_admin()` OR
  `is_org_manager_of(rep_id)`.
- **insert** — `rep_id = current_rep_id()` OR `is_org_admin()`.
  The admin arm is required because activation writes ack rows whose `rep_id`
  is the *recipient*, not the actor.
- **update** — `rep_id = current_rep_id()` OR `is_org_admin()` OR
  `is_org_manager_of(rep_id)`.
- **delete** — `is_org_admin()`.

`acknowledged_at` is the ack. `access_issue*` is the access flow. Neither
implies the other.

### 4.4 What does NOT change

- `profile_coverage` — still the ownership/backup authority.
- `profile_readiness` — still access confirmation only.
- `daily_targets` — **no change**.
- `identity_assignments` — still eligibility.

---

## 5. The one execution authority

### 5.1 Signature

`listExecutableIdentitiesForRep()` becomes the single source of truth:

```ts
export type CoverageExecutionMode = 'SHARED' | 'REPLACE'

export interface ExecutableIdentity {
  id: string
  profileId: string | null
  assignmentId: string | null
  assignedBy: string | null
  assignedAt: string | null
  access: 'primary' | 'coverage'
  coverageMode: CoverageExecutionMode | null
  coverageAssignmentId: string | null
  coveragePrimaryRepId: string | null
  coverageEffectiveUntil: string | null
}
```

### 5.2 The rule

```
For each active identity of interest, grouped by profile:

  activeCoverage = rows where
      organization_id = org
      AND profile_id = profile
      AND status = 'ACTIVE'
      AND revoked_at IS NULL
      AND effective_from <= businessDate
      AND (effective_until IS NULL OR effective_until >= businessDate)

  hasReplace = any(activeCoverage.mode = 'REPLACE')
  hasShared  = any(activeCoverage.mode = 'SHARED')

  coveringRepIds = distinct(activeCoverage.covering_rep_id)

  if hasReplace:   primary NOT executable; coveringRepIds executable
  else if hasShared: primary executable;      coveringRepIds executable
  else:            primary executable
```

Backups never execute. Archived identities never execute. Expired or revoked
coverage never executes.

### 5.3 One window helper

`isCoverageActiveOn()` in `src/lib/coverage/access.ts` is the only expiry logic.
Every consumer calls it. The window is date granularity
(`effective_from` / `effective_until`), reused as-is.

### 5.4 Supporting reads

- `listActiveCoverageForProfiles(client, orgId, profileIds, businessDate)` —
  all active rows for a set of profiles. Needed so a primary can be excluded
  when someone else REPLACE-covers his profile.
- `listActiveCoveredIdentities()` — refactored over the above; same return
  shape plus `mode`.

### 5.5 Collapsing the duplicates

- `listMyWorkableIdentities()` → **deleted**. Callers use the canonical
  authority plus one enrichment helper.
- `getAuthorizedIdentities()` → kept as the single enriching wrapper (adds
  identity name/title/channel/profileUrl/personId), but it calls the canonical
  authority and contains **no independent scope logic**.
- `assertRevenueIdentityAssignedToRep()` / `isRevenueIdentityAssignedToRep()`
  → unchanged signatures, backed by the canonical set.
- `listMyWorkableProfiles()` / `listMyWorkableLeads()` → canonical scope.

The parity contract asserts **the canonical set**, and separately asserts that
the deleted wrapper agreed with it *on non-archived identities* — documenting
that the archived-identity inclusion was a defect that V6.0 fixes.

---

## 6. Coverage semantics

### 6.1 SHARED

Primary remains executable. Covering reps become executable. Both see the
profile in the switcher, Rep Home, Inbox, Leads, sender selectors and Daily
Actions. Ownership is unchanged and always visible.

### 6.2 REPLACE

Covering reps become executable. The primary is **removed from execution**:
no My Day responsibility card, no sender access, no profile-scoped Inbox/Leads
queues, no Daily Actions, no target contribution expectation. He keeps
ownership, history and a non-operational **"Temporarily covered by X"** marker.

The marker renders in exactly two places:

1. Rep Home — a non-operational ownership card (no targets, no actions).
2. Admin profile detail (`src/lib/team/profile-detail.tsx`).

The primary is notified.

### 6.3 Multiple operators

Any number of active operators is supported. Mixed modes are rejected at
activation (§6.5), so a profile is always in exactly one mode.

### 6.4 Restore and expiry

- **SHARED ends** → primary still executable; covering reps lose execution.
- **REPLACE ends** → primary automatically executable again; covering reps
  lose execution. No manual repair.
- Expiry uses the same window helper, so it needs no cron.

**Revoke and restore act on ALL active coverage rows for the profile** — they
end the coverage episode, not one operator.

### 6.5 Conflict guard

Before inserting an ACTIVE coverage row for a profile, reject when another
ACTIVE, in-window coverage row for the same profile has a different
`coverage_mode`. If a conflict somehow reaches the read path, REPLACE wins
defensively (primary excluded).

### 6.6 Mode plumbing

Mode is **per activation**, not a profile default:

```
Activation UI (mode selector)
  → POST /api/team/coverage/approve  (items[].mode)
    → CoverageApprovalItem.mode
      → approveCoveragePlan
        → insert coverage_assignments (coverage_mode)
        → insert coverage_events (coverage_mode)
```

`configureCoverage` / `coverage-config-panel.tsx` configure the chain
(primary + backups) and do **not** carry a mode.

### 6.7 Task handoff

- **REPLACE** → open `OPEN`/`IN_PROGRESS`/`WAITING` profile-bound tasks move
  from the primary to the **earliest-activated covering rep**
  (`created_at ASC` among active rows; deterministic). With several
  replacements the admin reassigns individually. Personal tasks never move.
  Completed/cancelled never move.
- **SHARED** → **no task movement and no duplication.** One task, one assignee.

### 6.8 Eligibility

Temporary operators must already hold eligibility (`identity_assignments`) for
the profile's channels. `approveCoveragePlan` performs an **explicit guard**
(defence in depth — the route derives items from the plan, but the action must
not rely on that). No automatic eligibility creation.

---

## 7. Acknowledgement, escalation, access issues

### 7.1 Model

- `assigned_at` — copied from `profile_coverage.created_at` (PRIMARY) or
  `coverage_assignments.created_at` (COVERAGE).
- `source_row_id` — the `profile_coverage.id` or `coverage_assignments.id` the
  ack belongs to.
- `acknowledged_at` — set when the rep accepts.
- Access issue fields are independent; they neither clear nor set
  `acknowledged_at`.

A new PRIMARY assignment creates a `PRIMARY` acknowledgement row. A coverage
activation creates a `COVERAGE` row per covering rep.

**Re-arming:** when a *new* assignment episode begins (a different
`source_row_id` for the same profile/rep), the ack row is inserted with
`acknowledged_at = NULL`. Re-saving an unchanged chain reuses the existing row
and does not re-nag.

### 7.2 Escalation policy — one config location

`src/lib/responsibility/ack-policy.ts`:

```ts
export const ACK_ESCALATION = {
  reminderMinutes: 60,
  adminAttentionMinutes: 120,
  urgentMinutes: 240,
} as const

export function acknowledgementStage(
  assignedAt: string, now: string,
): 'NEW' | 'REMIND' | 'ADMIN_ATTENTION' | 'URGENT' | 'ACKNOWLEDGED'
```

No UI hardcodes durations.

### 7.3 Trigger — lazy emit-on-read

There is no frequent cron in this product (the operational scheduler runs
daily), and V6.0 does not add one. Instead:

- The **stage is derived** from `assigned_at` and the current time.
- The **banner is server-derived**, so it is always correct on any read.
- **Notifications are emitted lazily** when a surface that shows the
  responsibility is read (Rep Home, rep coverage panel, admin attention
  projection), via the existing `notifyOnce` with a stage-scoped dedupe key:
  `responsibility_ack:${source_row_id}:${stage}`.

Each stage emits at most once. Acknowledgement stops all future stages
immediately. No new infrastructure.

### 7.4 Rep surface

A persistent banner on Rep Home until acknowledged. Survives navigation and
reload. Actions: **Acknowledge** and **Report access issue**.

### 7.5 Access issue

Reporting an access issue:

1. Sets `access_issue`, `access_issue_note`, `access_issue_at`,
   `access_issue_reported_by`.
2. **Does not** change acknowledgement state — the ack stays pending.
3. **Does not** change execution — the rep remains executable but flagged.
4. Creates an admin attention item and notifies the admin/manager.

Resolving sets `resolved_at` / `resolved_by` / `resolve_note`.

### 7.6 Admin projection (minimal, for Project 3)

A canonical read model exposing unacknowledged responsibilities **and** open
access issues:

```
rep, profile, channel, subject, mode, assignedAt, elapsedMinutes, stage,
accessIssue
```

No Team Today redesign in V6.0.

---

## 8. Consumer parity

Every consumer must read the canonical authority.

| Consumer | File | Change |
|---|---|---|
| Rep Today | `src/app/api/rep/today/route.ts` | **Stop reading `identity_assignments` directly** — canonical scope |
| Rep workspace | `src/lib/auth/workspace.ts` | Canonical scope + mode; no independent logic |
| Rep Home / dashboard | `src/app/(app)/dashboard/page.tsx` | Inherits via workspace; verify REPLACE removal + marker |
| Store workable | `supabase-store.ts` | Delete `listMyWorkableIdentities`; rebuild profiles/leads on canonical scope |
| Inbox counts | `src/lib/operations/inbox-counts.ts` | Already parameterized — verify mode |
| Leads | `supabase-store.ts` `listMyWorkableLeads` | Canonical scope |
| Upwork sender | sender selection paths | Canonical executable identities |
| LinkedIn sender | sender selection paths | Same |
| Daily Actions | derivation path | Derived only from executable profiles |
| Tasks | `src/lib/tasks/load-unified-tasks.ts` | `executionRepByProfile` must use canonical scope |
| Chat queue | `src/lib/operations/chat-queue.ts` | Coverage context must use canonical mode |
| Admin targets | `src/app/api/admin/targets/route.ts` | Executable filter must use canonical scope |
| Assigned profiles | `src/lib/profiles/assigned-profiles.ts` | `listAssignedProfilesForRep` reads `identity_assignments` directly — canonical |
| Sender suggestion | `src/lib/relay/sender-suggestion.ts` | `accessibleToRep` must use canonical scope |
| Profile canonical | `src/lib/profiles/canonical.ts` | `getExecutableProfilesForRep` must use canonical scope |
| Coverage engine | `src/lib/coverage/engine.ts` | Multiple operators + mode |
| Coverage load | `src/lib/coverage/load.ts` | Multiple operators + mode |
| Profile operating model | `src/lib/profiles/operating-model.ts` | Multiple operators + mode |
| Profile detail | `src/lib/team/profile-detail.ts` | Multiple operators + mode + REPLACE marker |
| Coverage config UI | `src/components/coverage/coverage-config-panel.tsx` | Chain only (no mode) |
| Activation UI | coverage actions panel | Mode selector with explicit consequences |
| Rep coverage UI | `src/components/coverage/rep-coverage-panel.tsx` | Ack banner, acknowledge, access issue |
| Coverage APIs | `src/app/api/team/coverage/*`, `src/app/api/rep/coverage` | Mode validation, ack, access issue |

A parity contract asserts the same executable set across switcher, Rep Home,
Inbox, Leads, Upwork, LinkedIn, Daily Actions and Tasks for a given fixture.

### 8.1 Engine shape under multiple operators

`CoverageProfileResult` changes:

- `activeCoveringRepId` / `activeCoveringRepName` / `activeCoverageUntil`
  → `activeOperators: Array<{ repId, repName, mode, effectiveUntil }>`
- new `activeCoverageMode: CoverageExecutionMode | null`
- `status` keeps its values; `BACKUP_ACTIVE` means "coverage active" in either
  mode.
- `recommendation`:
  - **REPLACE active + primary available** → `RESTORE_PRIMARY` (the primary is
    being needlessly excluded).
  - **SHARED active** → no restore recommendation (both parties working).
  - Otherwise unchanged.

---

## 9. Migration

`supabase/migrations/20261111120000_responsibility_foundation_v60.sql`

1. Add `coverage_mode` to `coverage_assignments` (nullable, check-constrained).
2. Add `coverage_mode` to `coverage_events`.
3. Create `responsibility_acknowledgements` + indexes + RLS policies.
4. No backfill, no reclassification. Zero ACTIVE rows exist.

Idempotent and safe to run on production as-is.

---

## 10. Contracts

```
ONE_PRIMARY_MANY_ACTIVE_OPERATORS
PRIMARY_NEVER_MOVES_ON_TEMP_COVER
SHARED_PRIMARY_REMAINS_EXECUTABLE
REPLACE_PRIMARY_NOT_EXECUTABLE
REPLACE_RESTORE_REENABLES_PRIMARY
BACKUP_ONLY_NOT_EXECUTABLE
EXPIRED_COVER_NOT_EXECUTABLE
COVERAGE_MODE_CONFLICT_REJECTED
NEW_RESPONSIBILITY_REQUIRES_ACK
ACK_DOES_NOT_EQUAL_READY
ACK_STOPS_REMINDERS
UNACKNOWLEDGED_ESCALATES
ACCESS_ISSUE_DOES_NOT_CHANGE_OWNERSHIP
PROFILE_SWITCHER_EXECUTION_PARITY
REP_HOME_EXECUTION_PARITY
INBOX_EXECUTION_PARITY
LEADS_EXECUTION_PARITY
UPWORK_EXECUTION_PARITY
LINKEDIN_EXECUTION_PARITY
DAILY_ACTION_EXECUTION_PARITY
TASKS_EXECUTION_PARITY
```

Data invariants: exactly one PRIMARY per executable profile; PRIMARY ⇒
eligibility; backup-only executable = 0; expired/revoked executable = 0;
conflicting modes = 0; cross-org operator = 0; active operator without a valid
identity = 0.

---

## 11. Acceptance

Fixtures use the real org shape (`Zaira · Upwork`, primary Hassan).

- **SHARED** — Hassan + Dawood both executable across switcher, Inbox, Leads,
  sender, Rep Home, Tasks; primary stays Hassan.
- **REPLACE** — Dawood executable; Hassan not executable anywhere; ownership
  still Hassan in every admin view; marker visible.
- **Restore** — after REPLACE ends, Hassan executable again automatically.
- **Expiry** — operator executable at `end - 1m`, not after; primary
  auto-restored.
- **Multiple SHARED** — Hassan + Dawood + Madiha all executable; one PRIMARY.
- **Multiple REPLACE** — Dawood + Madiha executable; Hassan excluded.
- **Acknowledgement** — null ack, NEW state, banner, notification; +1h warning;
  +2h admin attention; acknowledge clears banner and stops reminders.
- **Readiness** — ack and readiness remain independent.
- **Access issue** — ack stays pending; admin attention; execution unchanged.
- **Conflict** — SHARED while REPLACE is active is rejected.
- **Eligibility** — a rep without eligibility cannot be activated.

---

## 12. Builder calls (my decisions, not yours)

1. **Naming.** New concept is `coverage_mode` /
   `CoverageExecutionMode = 'SHARED' | 'REPLACE'`. The existing `CoverageMode`
   is the policy enum and is not renamed.
2. **Window columns.** Reuse `effective_from` / `effective_until` (date
   granularity). One helper owns the rule.
3. **Acknowledgement storage.** One `responsibility_acknowledgements` table for
   both PRIMARY and COVERAGE, with `source_row_id` for re-arming.
4. **Historical rows.** Existing coverage rows keep `coverage_mode = NULL`.
5. **Eligibility.** Required; explicit guard in `approveCoveragePlan`.
6. **Conflicting modes.** Rejected at activation; REPLACE wins defensively on
   read.
7. **Targets.** No `daily_targets` change.
8. **Escalation trigger.** Lazy emit-on-read, derived stage, deduped. No new
   cron. This is the call most worth overriding if you want a real scheduler.
9. **Revoke/restore scope.** Acts on all active coverage rows for the profile.
10. **REPLACE task target.** Earliest-activated covering rep; admin reassigns
    when there are several.
11. **REPLACE marker surfaces.** Rep Home (non-operational card) and admin
    profile detail.
12. **Access issue effect.** Admin attention + notification; no execution
    change; ack stays pending.
13. **RLS insert.** `rep_id = current_rep_id() OR is_org_admin()` so activation
    can write rows for the recipient.

---

## 13. Left to the builder

- Component structure and file layout for the new UI.
- Test file layout and fixture helpers.
- Exact copy for the mode selector and banner.
- Batch strategy for the admin attention projection.
- Whether `coverage_events.coverage_mode` is exposed in the profile history
  view.

---

## 14. Open question for you

The design is buildable as written. The only thing standing between here and
code is the **tree freeze** (§0): another writer is actively committing and has
uncommitted changes in `src/lib/tasks/load-unified-tasks.ts`, which this design
must modify.

How do you want to handle that?
