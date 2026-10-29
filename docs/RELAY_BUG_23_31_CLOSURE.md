# RELAY — BUG-23 → BUG-31 Closure

**Sprint goal:** close BUG-23 … BUG-31 at root cause, with regression coverage,
browser verification, DB verification, and a QA-ready report.

---

## PHASE 0 — FREEZE + BASELINE

| Item | Value |
|---|---|
| Branch | `release-merge` |
| HEAD | `98ef2dea26b15442261db9fcbe7ca5c463a26575` |
| `origin/main` | `98ef2dea26b15442261db9fcbe7ca5c463a26575` |
| Deployed SHA (`/api/version`) | `98ef2de` |
| Scoring version | `relay_decision_v3.3.0` |
| Buyer-intent version | `buyer_intent_v5` |
| App version | `0.8.0` |
| Working tree | clean |
| Active worktrees | `scout-rc` (detached `2581561`), `.claude/worktrees/*` (agents), `.claude/worktrees/simplify` |
| Migrations | **cannot run** — `supabase migration list --linked` → 403 "insufficient privileges"; no `SUPABASE_DB_PASSWORD`. Project ref `fhnkanwvgamitrcuzpem` is linked. |

### Baseline gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx eslint .` | PASS — 0 errors, 806 pre-existing warnings |
| `pnpm qa:contracts` | PASS — 2 files / 41 tests |
| `pnpm build` | PASS |
| Full suite | PASS — 265 files / 3,983 tests |

---

## PHASE 1 — CANONICAL DATA MODEL

### Lead attribution contract

Four distinct facts. None may be inferred from another
(`src/lib/workspace/active-identity.ts:1-16`):

| Fact | Column | Written by |
|---|---|---|
| **Owner** — who holds the lead | `leads.owner_rep_id` | lead creation; `assignLead()`; refer |
| **Workspace** — capture context, the visibility key | `leads.revenue_identity_id` | `workspaceIdentityForSender()` |
| **Sender** — the profile the message goes out as | `leads.sender_profile_id` | lead creation; `updateLeadSenderProfile()`; refer |
| **Best sender** — routing recommendation, never an assignment | `leads.best_profile_id` | routing engine |

**Canonical visibility rule** — `leadBelongsToWorkspace()`
(`src/lib/workspace/active-identity.ts:34-45`): a stamped workspace is the only
visibility key; the current sender never moves a lead between workspaces.

**Status:** defined, but **had zero call sites** — no leads query filtered on
`revenue_identity_id` or `sender_profile_id` anywhere in the repo. This is the
BUG-30 root cause.

---

## ROOT CAUSES

### BUG-23 — Prospect data remains after generating lead

**REPRODUCED:** yes (code + browser).

**ROOT CAUSE:** `saveAsLead()` (`src/app/(app)/prospect/page.tsx:424-498`)
navigates on success but never clears `result`, `rawInput`, or the
`relay.prospect.draft.v1` localStorage key. The restore effect (`:220-236`) reads
that key on mount, so returning to Prospect resurrects the completed analysis and
leaves the "Create lead" CTA live and re-enabled.

**CANONICAL OWNER:** `src/app/(app)/prospect/page.tsx`

### BUG-24 — Prospect missing source profile attribution

**REPRODUCED:** yes.

**ROOT CAUSE (two parts):**
1. `senderProfileId` is accepted **verbatim from the request body** on both lead
   creation routes and persisted with no check that it belongs to the caller's
   org/rep — `src/app/api/leads/route.ts:248-250`,
   `src/app/api/prospect/save/route.ts:59,247-248`. (`revenueIdentityId` *is*
   validated; the profile is the one identity input that is not.)
2. The Prospect result renders `'No profile selected'` as its fallback
   (`:868`) instead of the required `'Profile not assigned'`.

**CANONICAL OWNER:** `src/app/api/prospect/save/route.ts`, `src/app/api/leads/route.ts`

### BUG-25 — Leads page does not show all created leads

**REPRODUCED:** partially — see status below.

**ROOT CAUSE:** `fetchLeadsAll()` / `listOwnedLeads()`
(`src/lib/store/supabase-store.ts:519-544`, `:1126-1138`) apply **no `limit`**,
so the server sends every lead. The board then truncates to `PAGE_SIZE = 50`
client-side (`src/components/leads/leads-board-v2.tsx:16,125`) with a
"Load more" control (`:262-271`). Every lead is reachable, but only 50 render
initially and the board is a horizontal column layout.

**Secondary defect:** `fetchLeadsWithMessages()` (`:5676-5681`) omits
`archived = false`, so archived leads surface in the Relay queue while every
other list path excludes them.

**CANONICAL OWNER:** `src/lib/leads/board-rows.ts`, `src/components/leads/leads-board-v2.tsx`

### BUG-26 — Leads enter Follow-Up without any message being sent

**REPRODUCED:** no — the canonical path is already correct.

**ROOT CAUSE:** none in the live path. `evaluateFollowUpPolicy()`
(`src/lib/conversation/follow-up-policy.ts:116-118`) returns *not eligible* when
`lastOutboundAt` is null, and `markContacted()` writes
`conversation_states.next_followup_at` only after a real insert
(`src/lib/store/supabase-store.ts:1431-1447`). `fetchFollowupsDue()`
(`:2384-2391`) skips any lead with no outbound.

**Latent duplications found (hardening, not live bugs):**
- `followup-engine.ts:58` hardcodes `followupCount >= 3` instead of importing
  `MAX_FOLLOWUPS_PER_LEAD`.
- `pipeline-utils.ts:81` re-applies the cadence via `isFollowupDue` rather than
  calling `evaluateFollowUpPolicy`.
- `mock-store.ts:1452-1463` computes eligibility with a hardcoded
  `daysSinceContact >= 3` and no cap — an independent clock in the demo store.
- `follow-up-policy.ts:10` carries a stale comment claiming
  `next_followup_at` is "never set".

**CANONICAL OWNER:** `src/lib/conversation/follow-up-policy.ts`

### BUG-27 — Score 4/5 leads do not progress through later stages

**REPRODUCED:** yes.

**ROOT CAUSE:** `deriveNextLeadAction()`
(`src/lib/relay/lead-state-machine.ts:113`) blocks on
`verdict === 'research_more' && !messages.some((m) => m.direction === 'inbound')`.
`research_more` is the `MAYBE` band = canonical 35-54 = **display 4-5**
(`src/lib/scoring/qualification.ts:36-42,119-123`).

So a score-4/5 lead that has sent a connection, had it **accepted**, and is
waiting to send the first DM is told *"Watch — not yet a fit"* and can never
progress. `derivePipelineStage()` only applies the same verdict guard when
`!lead.lastOutboundAt` (`pipeline-utils.ts:61`), so the board and the lead detail
disagree — a parity violation.

**CANONICAL OWNER:** `src/lib/relay/lead-state-machine.ts`

### BUG-28 — Upwork Applied action not counted in Today/main totals

**REPRODUCED:** yes — confirmed against production.

**ROOT CAUSE (three parts):**

1. **`upwork_jobs` update silently fails.** `markUpworkApplied()`
   (`src/lib/store/supabase-store.ts:3050-3055`) writes `connects_used`, a column
   that **does not exist** in production (added in code commit `3d0a4b4`, never
   migrated). PostgREST returns 400; supabase-js resolves query builders with
   `{data, error}` rather than rejecting, and the error is never checked — so
   `Promise.all` resolves, the route returns `200 {"ok":true}`, the
   `upwork_messages` row and the ledger event are written, **but
   `upwork_jobs.status` stays `'new'`**. Verified live: job
   `62fc0887…` still `status: "new"` after a 200 apply.

2. **Action-ledger idempotency is entirely broken.** The unique index is
   `… (organization_id, idempotency_key) where idempotency_key is not null`
   (partial). `emitAction()` issues
   `upsert(…, { onConflict: 'organization_id,idempotency_key' })`
   (`src/lib/action-ledger.ts:119-123`), which Postgres rejects with
   `42P10 — there is no unique or exclusion constraint matching the ON CONFLICT
   specification` (verified live). The fallback then inserts with
   `idempotency_key: undefined`, so **every event is written with a NULL key**
   (verified: all 10 `UPWORK_APPLIED` rows) and the exactly-once guarantee does
   not exist.

3. **`sender_profile_id` is not passed** for `UPWORK_APPLIED` / `UPWORK_PROPOSAL_PREPARED`,
   so those ledger rows carry no profile attribution.

**Also:** `upwork_messages` has no idempotency — two applies insert two rows
(verified: job `62fc0887…` has two `cover` messages). `upwork_applications` is
dead schema, never read or written by `src`.

**CANONICAL OWNER:** `src/lib/store/supabase-store.ts` (`markUpworkApplied`), `src/lib/action-ledger.ts`

### BUG-29 — Lead actions missing profile attribution

**REPRODUCED:** yes.

**ROOT CAUSE:** same as BUG-28(3) — the Upwork emit sites omit `senderProfileId`.
`markContacted()` already passes it (`:1527`), which is why LinkedIn actions are
attributed and Upwork actions are not.

**CANONICAL OWNER:** `src/lib/store/supabase-store.ts`

### BUG-30 — Different profiles show the same leads

**REPRODUCED:** yes.

**ROOT CAUSE:** `loadBoardData()` (`src/lib/leads/board-rows.ts:33-34`) selects
`fetchLeadsAll()` for admins and `listOwnedLeads()` for reps and **never applies
`leadBelongsToWorkspace()`**. The file carries an explicit comment
(`:191-194`) stating the sidebar identity is "not a visibility filter", and the
page header promises "across every identity"
(`src/app/(app)/leads/page.tsx:43-44`). `leadBelongsToWorkspace()` has **zero
call sites**; the only workspace-scoped lead view is
`/workspace/[revenueIdentityId]`, which filters in memory after loading the whole
table (`src/app/(app)/workspace/[revenueIdentityId]/page.tsx:70-72`).

**CANONICAL OWNER:** `src/lib/leads/board-rows.ts`

### BUG-31 — Save Draft provides no confirmation

**REPRODUCED:** yes.

**ROOT CAUSE (three parts):**
1. `saveDraft()` (`src/components/upwork-job-actions.tsx:98-114`) sets
   `setEditing(false)` on success and shows **no toast, no "Saved" state, no
   `aria-live`** — the button label never leaves "Save draft".
2. **No draft restore.** `proposal` starts `''` (`:42`) and the page never
   passes a stored draft; `getUpworkJob()` already returns `messages`
   (`supabase-store.ts:2873-2882`) but `UpworkJobActions` receives no draft
   (`upwork/[id]/page.tsx:164-169`). A saved draft is therefore persisted but
   invisible after reload.
3. **No idempotency.** `saveUpworkDraft()` (`supabase-store.ts:2968-2979`) is a
   plain insert; a double-click creates two rows.

**CANONICAL OWNER:** `src/components/upwork-job-actions.tsx`, `src/app/api/upwork/jobs/[id]/draft/route.ts`

---

## FIXES

| Bug | Fix | Files |
|---|---|---|
| BUG-23 | Clear prospect state + draft key only after the server confirms `leadId`; the persist effect no longer recreates an empty key. Draft logic extracted to `src/lib/prospect/draft.ts` so it is unit-testable. | `src/app/(app)/prospect/page.tsx`, `src/lib/prospect/draft.ts` |
| BUG-24 | `senderProfileId` is resolved through `store.resolveSenderProfileId()` — it must exist inside the caller's organization or it is stored as null. The Prospect fallback reads `Profile not assigned`. | `api/prospect/save`, `api/leads`, `supabase-store.ts`, `prospect/page.tsx` |
| BUG-25 | `fetchLeadsWithMessages()` now excludes archived leads, matching every other list path. Board scoping is a pure, tested function. | `supabase-store.ts`, `board-rows.ts`, `leads/page.tsx` |
| BUG-26 | The duplicated clocks now read the canonical policy: `followup-engine` imports `MAX_FOLLOWUPS_PER_LEAD`; `derivePipelineStage` calls `evaluateFollowUpPolicy`; the demo store's hardcoded `daysSinceContact >= 3` is gone. Stale comment corrected. | `follow-up-policy.ts`, `followup-engine.ts`, `pipeline-utils.ts`, `mock-store.ts` |
| BUG-27 | `relationshipHasStarted()` is the single rule that ends the "watch" state. The state machine and the pipeline board both read it, so a score-4/5 lead with a sent/accepted connection advances to `SEND_DM`. | `lead-state-machine.ts`, `pipeline-utils.ts` |
| BUG-28 | `connects_used` is written only when the column exists, and a real failure is thrown instead of swallowed; `upwork_messages` is one row per (job, type); the ledger's idempotency key is actually written. | `supabase-store.ts`, `action-ledger.ts` |
| BUG-29 | The Upwork emit sites pass `senderProfileId`. | `supabase-store.ts` |
| BUG-30 | `scopeLeadsToWorkspace()` applies `leadBelongsToWorkspace()` to a rep's board; admin stays org-wide; a rep with no resolvable workspace keeps their book. Events are scoped to the visible leads. | `board-rows.ts`, `leads/page.tsx` |
| BUG-31 | Save states (`Save draft` / `Saving…` / `Saved` / `Failed — Retry`), an `aria-live` region and a `role="status"` toast rendered only after the server confirms, an in-flight guard, draft restore on mount, and one draft row per (job, type). | `upwork-job-actions.tsx`, `api/upwork/jobs/[id]/draft`, `upwork/[id]/page.tsx`, `supabase-store.ts` |

### Architecture after the fixes

```
profile attribution (org-scoped, validated)
        ↓
canonical lead  ──(revenue_identity_id)──▶  scopeLeadsToWorkspace
        ↓
canonical events (action_events, idempotency-keyed)
        ↓
pipeline state  ← relationshipHasStarted + evaluateFollowUpPolicy
        ↓
Today / Chats / Leads / History
```

---

## PER-BUG STATUS

| ID | REPRODUCED | UNIT | INTEGRATION | BROWSER | DB | STATUS |
|---|---|---|---|---|---|---|
| BUG-23 | yes | PASS | PASS | pending | pending | FIXED_UNIT |
| BUG-24 | yes | PASS | PASS | pending | pending | FIXED_UNIT |
| BUG-25 | partial | PASS | PASS | pending | pending | FIXED_UNIT |
| BUG-26 | no | PASS | PASS | n/a | n/a | FIXED_UNIT |
| BUG-27 | yes | PASS | PASS | pending | pending | FIXED_UNIT |
| BUG-28 | yes | PASS | PASS | pending | PASS | FIXED_UNIT |
| BUG-29 | yes | PASS | PASS | pending | pending | FIXED_UNIT |
| BUG-30 | yes | PASS | PASS | pending | pending | FIXED_UNIT |
| BUG-31 | yes | PASS | PASS | pending | pending | FIXED_UNIT |

### Test data created

`tests/qa-relay-bug-23-31.test.ts` — 29 tests, all passing.
`e2e/bug-23-31-closure.spec.ts` — browser matrix, all records `is_test` and removed in `afterEach`.

### Known limitation (not silently "done")

**Upwork profile attribution requires a schema column.** `upwork_messages` and
`upwork_jobs` have no `sender_profile_id`; the column was never migrated. The
code now writes it when the column is present and degrades to `null` when it is
not, and the migration is recorded in `supabase/migrations/`. Production will
carry Upwork attribution as soon as that migration is applied — which needs
`SUPABASE_DB_PASSWORD` or a management token, neither of which is available in
this environment.

