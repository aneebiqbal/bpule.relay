# REPAIR OPTIONS

---

## SYSTEM A: Message Logging Contract (ISSUE-003, 003a, 008)

**Problem:** `log-relationship-update.tsx` sends empty `sentText` to `contact/route.ts` which rejects it. `followup_sent` type not in TYPES array.

### Option A1: Split the API — Status Actions vs Message Actions

**Approach:**
- Create `/api/leads/[id]/status` endpoint for status-only updates (meeting_booked, no_response, etc.)
- Keep `/api/leads/[id]/contact` for message logging with required `sentText`
- `LogRelationshipUpdate` routes to the appropriate endpoint based on selection
- Add text field modal/contact field when action involves a sent message

| Criterion | Rating |
|-----------|--------|
| Correctness | High — clean separation of concerns |
| Complexity | Medium — new endpoint + frontend routing |
| Migration Risk | Low — additive change, old endpoint preserved |
| Maintainability | High — each endpoint has clear responsibility |
| Performance | Neutral |
| Testability | High — isolated endpoints easy to test |

### Option A2: Make sentText Optional in Contact Route

**Approach:**
- Remove the `sentText` requirement from `contact/route.ts`
- If `sentText` empty, store message with `sent_text = NULL` or `sent_text = '[no text provided]'`
- Distinguish "logged action" from "logged message" via a new `log_type` field

| Criterion | Rating |
|-----------|--------|
| Complexity | Low — minimal code change |
| Correctness | Medium — conflates status update and message logging in one endpoint |
| Migration Risk | Low |
| Maintainability | Medium — one endpoint handles two concerns |
| Testability | Medium — need to test both paths |
| Risk | Future ambiguity about when sentText is required |

### Option A3: Add Conditional Text Field to LogRelationshipUpdate

**Approach:**
- Keep `contact/route.ts` validation as-is (requires sentText)
- In `LogRelationshipUpdate`, show a text field for message-type actions (connection_sent, dm_sent, followup_sent, reply)
- Hide text field for status-only actions (meeting_booked, no_response, etc.)
- For status-only actions, send `rejected: true` or a new `status_only: true` flag to bypass validation

| Criterion | Rating |
|-----------|--------|
| Correctness | High — clear UX distinction |
| Complexity | Medium — conditional UI + API flag |
| Migration Risk | Low |
| Maintainability | High — explicit about what needs text |
| Testability | High — clear test cases per action type |

### **RECOMMENDATION: Option A1**

Cleanest separation. Status actions (meeting booked, no response, etc.) are NOT message logging — they belong in a separate endpoint. Message-type actions (I sent a connection/DM/reply/followup) are message logging and require text. This eliminates the contract confusion entirely.

---

## SYSTEM B: Conversation Composer Visibility (ISSUE-002)

**Problem:** Composer area disappears in `their_move` states. `onPasteReply` is no-op.

### Option B1: Always Render Paste Area in Waiting States

**Approach:**
- Change `conversation-workspace.tsx:290` from `(draftText || canDraft)` to `(draftText || canDraft || isWaiting)`
- Wire `onPasteReply` to actual paste functionality (open paste_reply mode)
- Remove the `mode === 'waiting'` null return in `reply-composer.tsx:83-85`

| Criterion | Rating |
|-----------|--------|
| Correctness | High — paste area always available when waiting |
| Complexity | Low — 3-line change |
| Migration Risk | Low |
| Maintainability | High |
| Testability | High |

### Option B2: Dedicated WaitingComposer Component

**Approach:**
- Create a new `WaitingComposer` component specifically for `their_move` states
- Renders paste textarea + log update controls
- `conversation-workspace.tsx` renders `WaitingComposer` instead of `ConversationWaitingState` when in waiting phase

| Criterion | Rating |
|-----------|--------|
| Correctness | High — dedicated component |
| Complexity | Medium — new component |
| Migration Risk | Low — additive |
| Maintainability | High — single responsibility |
| Testability | High |

### Option B3: Render ConversationWaitingState Inside Composer Area

**Approach:**
- Move paste-reply logic into `ConversationWaitingState`
- Always render composer area when `!isTerminal`
- Composer shows either draft editor or waiting/paste state

| Criterion | Rating |
|-----------|--------|
| Correctness | High |
| Complexity | Medium — reorganize components |
| Migration Risk | Medium — moving logic between components |
| Maintainability | High |
| Testability | High |

### **RECOMMENDATION: Option B1**

Simplest fix. Three targeted changes restore functionality without component reorganization.

---

## SYSTEM C: Action Ledger Population (ISSUE-005, 006)

**Problem:** `emitAction()` only called once (referrals). 13 other action types never emitted.

### Option C1: Add emitAction Calls to Store Methods

**Approach:**
- Add `emitAction()` calls inside `markContacted()`, `createLead()`, `createUpworkJob()`, `saveUpworkDraft()`, `markUpworkApplied()`, `recordProspectReply()`, `updateLeadStatus('won')`
- Each store method emits the appropriate action type after successful DB write

| Criterion | Rating |
|-----------|--------|
| Correctness | High — events emitted at source |
| Complexity | Medium — touch ~7 store methods |
| Migration Risk | Medium — adding side effects to existing methods |
| Maintainability | High — events colocated with data writes |
| Performance | Low impact — single row insert per event |
| Testability | Medium — need to verify emission in each path |

### Option C2: Event Interceptor / Middleware Layer

**Approach:**
- Create a wrapper around `ScoutStore` that intercepts method calls and emits corresponding events
- Store methods remain unchanged
- Centralized event mapping in one file

| Criterion | Rating |
|-----------|--------|
| Correctness | Medium — may miss context-specific metadata |
| Complexity | High — proxy/wrapper layer |
| Migration Risk | High — intercepting all store calls is fragile |
| Maintenance | Medium — event mapping separated from logic |
| Testability | Medium — need to test the interceptor |

### Option C3: Domain Events from Relay Events

**Approach:**
- `relay_events` already captures some actions
- Create a reconciliation process that derives `action_events` from `relay_events` + `messages`
- Scheduled or triggered sync

| Criterion | Rating |
|-----------|--------|
| Complexity | High — reconciliation logic |
| Correctness | Medium — derived data may not capture all nuances |
| Migration Risk | Medium — async sync introduces delay |
| Maintainability | Low — two systems to keep in sync |
| Testability | Medium |

### **RECOMMENDATION: Option C1**

Direct emission at the point of action is the simplest and most reliable. Each store method knows what action it's performing. No indirection, no reconciliation, no sync delay.

---

## SYSTEM D: Follow-Up Count Accuracy (ISSUE-007)

**Problem:** `draft/route.ts` hard-codes followupCount from status instead of reading `conversation_states.followup_count`.

### Option D1: Use detail.followupCount Directly

**Approach:**
- Replace `followupCount: detail.status === 'followed_up' ? 1 : 0` with `followupCount: detail.followupCount ?? 0`
- Remove the hardcoded `followupCount: 0` in `buildFollowupPrompt` call

| Criterion | Rating |
|-----------|--------|
| Correctness | High — uses actual count |
| Complexity | Trivial — 2-line change |
| Migration Risk | None |
| Maintainability | High |
| Testability | High |

### **RECOMMENDATION: D1** (only viable option — the bug is a clear code error)

---

## SYSTEM E: Lead List Context (ISSUE-004)

**Problem:** Sender profile, due date, follow-up count not shown in list views.

### Option E1: Extend Leads Board Rendering

**Approach:**
- In `leads-board.tsx`, look up sender profile name from `lead.senderProfileId` using available profiles
- For follow-up section, show "X business days since contact" and "Follow-up N of 3"
- Pass computed data from `fetchFollowupsDue()` to the board

| Criterion | Rating |
|-----------|--------|
| Correctness | High |
| Complexity | Medium — need to pass computed data to board |
| Migration Risk | Low |
| Maintainability | High |
| Testability | High |

### Option E2: Profile Badge Component

**Approach:**
- Create reusable `<ProfileBadge profileId={lead.senderProfileId} />` component
- Use in `leads-board.tsx`, `leads-tab-view.tsx`, and follow-up queue
- Component handles profile lookup, loading, and fallback

| Criterion | Rating |
|-----------|--------|
| Correctness | High |
| Complexity | Medium — new component + data plumbing |
| Migration Risk | Low |
| Maintainability | High — DRY profile rendering |
| Testability | High — component-level tests |

### **RECOMMENDATION: E2**

Reusable component ensures consistency across all list views. Single source of truth for profile display.

---

## SYSTEM F: Score Display Clarity (ISSUE-001)

**Problem:** Users confuse opportunity score with profile match. Board sorts mixed scales.

### Option F1: Separate Score Display + Fix Sort

**Approach:**
- Fix `leads-board.tsx:139` to normalize scores before comparison (canonical/100 * 12, or legacy/12 * 100)
- On lead detail page, show Opportunity Score prominently
- Show "Recommended for [profile name] (match: 85)" only when a referral recommendation exists
- Never show per-profile score as "the score" for the lead

| Criterion | Rating |
|-----------|--------|
| Correctness | High |
| Complexity | Low |
| Migration Risk | None |
| Maintainability | High |
| Testability | High |

### **RECOMMENDATION: F1**

Fixes the immediate sort bug and clarifies the semantic distinction. The per-profile match is a referral concept, not a lead score concept.

---

## PRIORITY ORDER

1. **System A (Message Logging)** — Critical, breaks 8/9 manual update paths
2. **System B (Composer Visibility)** — Critical, breaks conversation workflow
3. **System C (Action Ledger)** — High, admin has zero visibility
4. **System D (Follow-up Count)** — Medium, wrong AI prompt context
5. **System E (Lead List Context)** — Medium, usability gap
6. **System F (Score Display)** — Low-Medium, semantic clarity
