# RELAY WORKFLOW RELIABILITY — EXECUTIVE FINDINGS

## Summary

Five reported production issues were audited. **All five confirmed as real bugs with identifiable root causes.** The conversation/reply/follow-up system has critical contract mismatches that render core workflows non-functional. The Action Ledger is effectively dead code. The scoring confusion is a semantic misunderstanding between two unrelated systems.

## Root Causes

### 1. Score Inconsistency — SEMANTIC CONFIRMATION, NOT A BUG

The lead opportunity score is **global** per lead — it does NOT change per viewer. Aneeb and Abdullah see the same canonical score.

The reported "stronger for Aneeb" message comes from the **referral system** (`profile-match.ts` / `lead-referral.ts`), which computes a separate `matchScore` (0–100) comparing opportunity capabilities to profile skills. This match score is shown on the **prospect analysis page** (`/prospect`), NOT on the lead detail page (`/leads/[id]`).

**The confusion:** The referral system says "Aneeb's profile matches this lead better" but the lead detail page only shows the opportunity score (which is the same for everyone). The UI never surfaces per-profile match scores on the lead detail surface.

**Secondary issue:** The `leads-board.tsx` sorts by `canonicalScore ?? score`, mixing 0–100 and 0–12 scales numerically, producing wrong ordering.

### 2. Reply Chat Disappears — CONFIRMED BUG

After a rep sends a reply, the relationship state transitions to `their_move` / `conversation`. In this state:

- `conversation-workspace.tsx:290`: Composer area requires `(draftText || canDraft)` — both are false when waiting
- `reply-composer.tsx:83-85`: When mode is `'waiting'`, returns `null` (renders nothing)
- `conversation-workspace.tsx:273`: The waiting state's `onPasteReply` is a **no-op** `() => {}`
- Result: No composer, no paste affordance, no way to interact with the conversation

### 3. "I Sent Reply" / "I Sent Follow-Up" Broken — CONFIRMED CRITICAL BUG

`log-relationship-update.tsx:58` sends `{ type: selected, sentText: '', direction: 'inbound' }` to `/api/leads/[id]/contact`.

`contact/route.ts:23-27` rejects with 400 `"Paste the message text you actually sent."` when `sentText` is empty.

**8 of 9 "Log an update" options fail** because they send empty `sentText`:
- "They replied" (`client_replied`)
- "I sent a connection request" (`connection_sent`)
- "I sent a message" (`dm_sent`)
- "I followed up" (`followup_sent`)
- "Meeting booked" (`meeting_booked`)
- "Proposal sent" (`proposal_sent`)
- "Not interested" (`not_interested`)
- "No response yet" (`no_response`)

**Additionally:** `followup_sent` is not in the route's `TYPES` array `['dm', 'connection', 'upwork', 'followup', 'reply']` — it silently defaults to `'dm'`, miscounting follow-ups and bypassing the 3-per-lead cap.

### 4. Lead Sections Lack Context — CONFIRMED

- `leads-board.tsx` and `leads-tab-view.tsx` show company/contact/signal/owner but **never show sender profile**
- Follow-up queue (`queue-engine.ts:388-436` `buildFollowupTask`) doesn't include sender profile evidence, unlike `buildReplyTask` which does
- No due date shown in list views — only relative time for last activity
- No "follow-up N of 3" indicator in list views

### 5. Upwork Activity Not Counted — CONFIRMED CRITICAL BUG

The `action_events` table has **14 defined action types** but only **1 is ever emitted** (`LEAD_REFERRED` in `lead-referral.ts:52`).

`markContacted()` — the main send path for DMs, connections, follow-ups, and replies — writes to `messages` and `relay_events` but **never to `action_events`**.

Upwork paths (`createUpworkJob`, `saveUpworkDraft`, `markUpworkApplied`) emit zero `action_events`.

The admin Operating Ledger (`/admin/activity`) queries `action_events` and shows **no activity** for any day unless referrals occurred.

## Highest-Risk System

**Message Logging Contract** — the broken `log-relationship-update.tsx` → `contact/route.ts` contract makes 8 of 9 manual update actions impossible. This is the most user-visible breakage.

## Secondary Risk

**Action Ledger** — the entire commercial event history is non-functional. Admin has no operating visibility into team activity.

## Scoring System Risk

**Medium** — No runtime bug in score computation, but the coexistence of 4 scoring engines (legacy /12, canonical /100, prospect /100 ephemeral, V3 /100 experimental) with different consumers creates maintenance hazard and potential display confusion.

## Blast Radius

| Issue | Affected Users | Frequency |
|-------|---------------|-----------|
| Reply chat disappears | Every rep with active conversations | 100% after first reply sent |
| "I sent reply/follow-up" fails | Every rep who manually logs sends | 100% of manual log attempts |
| Action Ledger empty | Admins/managers viewing team activity | Always (only referrals appear) |
| Upwork not counted | Admins tracking Upwork activity | Always |
| Score confusion | All users comparing profiles | Per lead with profile referral |
| Lead sections lack context | All reps/admins viewing lead lists | Always |

## Invariants Violated

1. **Every API-required field must be collectable from the UI** — violated by `sentText` requirement with no field
2. **Generated != Sent** — maintained correctly in code but the UI makes this ambiguous
3. **One action = one event** — violated by `action_events` never being emitted
4. **Sender profile context must follow the lead** — violated in list views and follow-up queue
5. **State machine transitions must always render a surface** — violated by `their_move`/`conversation` showing no composer

## Ready for Fix Sprint

**YES** — Root causes are confirmed through code trace. The repair is well-scoped.

---

**ROOT CAUSES:**
1. `log-relationship-update.tsx` sends empty `sentText` to `contact/route.ts` which rejects it — contract mismatch
2. `followup_sent` type not in `contact/route.ts` TYPES array — silent default to `dm`
3. `action_events` table never populated — `emitAction()` only called once (referrals)
4. `conversation-workspace.tsx` composer gated by `(draftText || canDraft)` — both false in `their_move` state
5. Lead list views don't render sender profile — data available but not displayed
6. `leads-board.tsx` sorts by mixed-scale score — `canonicalScore ?? score` mixes /100 and /12

**HIGHEST-RISK SYSTEM:** Message Logging Contract (breaks 8/9 manual update paths)

**RECOMMENDED REPAIR:** See 05_REPAIR_OPTIONS.md and 07_REPAIR_PLAN.md

**FILES/SYSTEMS AFFECTED:**
- `src/components/relationship/log-relationship-update.tsx` (line 58)
- `src/app/api/leads/[id]/contact/route.ts` (lines 7, 23-27)
- `src/components/conversation/conversation-workspace.tsx` (lines 273, 290)
- `src/components/conversation/reply-composer.tsx` (lines 83-85)
- `src/lib/action-ledger.ts` (emission paths)
- `src/lib/store/supabase-store.ts` (`markContacted`, `createUpworkJob`, `markUpworkApplied`)
- `src/components/leads-board.tsx` (sender profile display, score sorting)
- `src/lib/relay/queue-engine.ts` (`buildFollowupTask` sender profile)

**BLOCKERS:** None identified for diagnosis phase. Implementation requires coordinated UI + API changes.
