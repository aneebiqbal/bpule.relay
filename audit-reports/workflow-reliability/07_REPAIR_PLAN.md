# REPAIR PLAN — Ordered Implementation

---

## Phase 1: Critical Contract Fixes (ISSUE-003, 003a, 008)

### Step 1.1: Create Status Action Endpoint

**File:** `src/app/api/leads/[id]/status/route.ts` (new)

**Behavior:**
```
POST /api/leads/{id}/status
Body: { status_type: string, metadata?: object }

status_type enum:
- client_replied (inbound, no text required — use /reply for text)
- meeting_booked
- proposal_sent
- interested
- not_interested
- no_response
- connection_sent (when no text needed)
- dm_sent (when no text needed)
- followup_sent (when no text needed)

Action: Update lead status / outcomes, emit action_event, NO message row.
```

### Step 1.2: Fix `contact/route.ts` Type Array

**File:** `src/app/api/leads/[id]/contact/route.ts:7`

**Change:**
```typescript
// Before:
const TYPES: MessageType[] = ['dm', 'connection', 'upwork', 'followup', 'reply']

// After: Ensure 'followup' is the canonical value (already is, but verify)
// Add comment: "For status-only updates without text, use /api/leads/[id]/status"
```

### Step 1.3: Fix `log-relationship-update.tsx` Routing

**File:** `src/components/relationship/log-relationship-update.tsx`

**Change:**
```typescript
// Before:
body: JSON.stringify({ type: selected, sentText: '', direction: 'inbound' })

// After:
// Route status-only actions to /status endpoint
// Route message actions to /contact with text field
if (['meeting_booked', 'proposal_sent', 'interested', 'not_interested', 'no_response'].includes(selected)) {
  res = await fetch(`/api/leads/${leadId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_type: selected }),
  })
} else {
  // Message-type actions: show text field, send to /contact
  // ... open inline textarea or modal
}
```

### Step 1.4: Fix `followup_sent` Type Collision

**File:** `src/components/relationship/log-relationship-update.tsx:23`

**Change:**
```typescript
// Before:
{ phase: [...], label: 'I followed up', value: 'followup_sent' }

// After:
{ phase: [...], label: 'I followed up', value: 'followup' }
```

**Acceptance Criteria:**
- [ ] "I sent a message" shows text field, sends to /contact with type=dm, succeeds
- [ ] "I followed up" shows text field, sends to /contact with type=followup, succeeds
- [ ] "Meeting booked" sends to /status endpoint, succeeds
- [ ] "No response yet" sends to /status endpoint, succeeds
- [ ] Follow-up logged via /contact increments `conversation_states.followup_count`

### Regression Tests:
1. Select "I followed up" → enter text → verify `messages.type = 'followup'`, `lead.status = 'followed_up'`, `followup_count` incremented
2. Select "Meeting booked" → verify NO message row created, `action_events` row created
3. Select "I sent a message" without text → verify error prompts for text, does not create phantom DM

---

## Phase 2: Composer Visibility (ISSUE-002)

### Step 2.1: Fix `conversation-workspace.tsx` Composer Gating

**File:** `src/components/conversation/conversation-workspace.tsx:290`

**Change:**
```typescript
// Before:
{(draftText || canDraft) && (
  <ReplyComposer mode={draftText ? 'edit_draft' : 'waiting'} ... />
)}

// After:
{(draftText || canDraft || isWaiting) && (
  <ReplyComposer mode={draftText ? 'edit_draft' : canDraft ? 'waiting' : 'paste_reply'} ... />
)}
```

### Step 2.2: Wire `onPasteReply` in Waiting State

**File:** `src/components/conversation/conversation-workspace.tsx:273`

**Change:**
```typescript
// Before:
onPasteReply={() => {}}

// After:
onPasteReply={() => setComposerMode('paste_reply')}
```

### Step 2.3: Fix `reply-composer.tsx` Waiting Mode

**File:** `src/components/conversation/reply-composer.tsx:83-85`

**Change:**
```typescript
// Before:
if (mode === 'waiting') {
  return null
}

// After:
if (mode === 'waiting') {
  return null  // Keep this but it won't be reached — mode will be 'paste_reply' now
}
```

**Acceptance Criteria:**
- [ ] After sending reply, paste-reply textarea is visible
- [ ] In `dm_sent` phase, paste-reply textarea is visible
- [ ] Pasting text and saving calls `/api/leads/[id]/reply` successfully
- [ ] Message history remains visible alongside composer

### Regression Tests:
1. Send reply → refresh page → verify paste-reply area renders
2. Open lead in `dm_sent` state → verify paste-reply area renders
3. Open lead in `follow_up_due` state → verify follow-up composer renders (not affected by this change)
4. Paste client reply → save → verify message appears in history, state transitions to `replied`

---

## Phase 3: Action Ledger Population (ISSUE-005, 006)

### Step 3.1: Add `emitAction` to `markContacted`

**File:** `src/lib/store/supabase-store.ts` (inside `markContacted` method)

**Add after successful message insert:**
```typescript
const actionType = type === 'connection' ? 'CONNECTION_SENT'
  : type === 'dm' ? 'DM_SENT'
  : type === 'followup' ? 'FOLLOWUP_SENT'
  : type === 'reply' ? 'REPLY_SENT'
  : null

if (actionType) {
  await emitAction({
    actionType,
    actorId: lead.ownerRepId,
    leadId: lead.id,
    senderProfileId: lead.senderProfileId,
    messageId: newMessage.id,
  })
}
```

### Step 3.2: Add `emitAction` to `createLead`

**File:** `src/lib/store/supabase-store.ts` (inside `createLead` method)

```typescript
await emitAction({
  actionType: 'LEAD_EXTRACTED',
  actorId: input.ownerRepId,
  leadId: newLead.id,
  senderProfileId: newLead.senderProfileId,
})
```

### Step 3.3: Add `emitAction` to `recordProspectReply`

**File:** `src/lib/store/supabase-store.ts` (inside `recordProspectReply` method)

```typescript
await emitAction({
  actionType: 'REPLY_RECEIVED',
  actorId: lead.ownerRepId,
  leadId: lead.id,
  senderProfileId: lead.senderProfileId,
  messageId: newMessage.id,
})
```

### Step 3.4: Add `emitAction` to Upwork Paths

**File:** `src/lib/store/supabase-store.ts`

```typescript
// In createUpworkJob:
await emitAction({ actionType: 'UPWORK_JOB_EXTRACTED', actorId, jobId: newJob.id })

// In saveUpworkDraft:
await emitAction({ actionType: 'UPWORK_PROPOSAL_PREPARED', actorId, jobId, messageId })

// In markUpworkApplied:
await emitAction({ actionType: 'UPWORK_APPLIED', actorId, jobId, messageId })
```

### Step 3.5: Fix Timezone Boundary

**File:** `src/lib/action-ledger.ts:117`

**Change:** Use org timezone for day boundaries instead of UTC. Or standardize all views to UTC.

**Acceptance Criteria:**
- [ ] DM sent → `action_events` row with type=DM_SENT appears
- [ ] Connection sent → row with CONNECTION_SENT appears
- [ ] Follow-up sent → row with FOLLOWUP_SENT appears
- [ ] Client reply → row with REPLY_RECEIVED appears
- [ ] Upwork job extracted → row with UPWORK_JOB_EXTRACTED appears
- [ ] Admin /activity page shows non-zero activity
- [ ] One user action creates exactly one `action_events` row

### Regression Tests:
1. Send DM → query `action_events` → verify exactly 1 row with DM_SENT for this lead
2. Send DM → refresh → verify still exactly 1 row (no duplicates)
3. Extract Upwork job → verify UPWORK_JOB_EXTRACTED event
4. Check `/admin/activity` → verify DM count matches sent count
5. Same action appears on same date in both `/admin/activity` and team-live views

---

## Phase 4: Follow-Up Count Accuracy (ISSUE-007)

### Step 4.1: Fix `draft/route.ts` followupCount

**File:** `src/app/api/leads/[id]/draft/route.ts:180,193`

**Change:**
```typescript
// Before (line 180):
followupCount: detail.status === 'followed_up' ? 1 : 0,

// After:
followupCount: detail.followupCount ?? 0,

// Before (line 193):
followupCount: 0,

// After:
followupCount: detail.followupCount ?? 0,
```

**Acceptance Criteria:**
- [ ] After 2 follow-ups, 3rd follow-up prompt says "Follow-up 3 of 3"
- [ ] After 0 follow-ups, 1st follow-up prompt says "Follow-up 1 of 3"

### Regression Tests:
1. Send 2 follow-ups → generate 3rd → verify AI prompt contains "3 of 3"
2. Fresh lead → generate follow-up → verify prompt contains "1 of 3"

---

## Phase 5: Lead List Context (ISSUE-004)

### Step 5.1: Create Profile Badge Component

**File:** `src/components/profile-badge.tsx` (new)

**Props:** `profileId: string`, `size?: 'sm' | 'md'`
**Behavior:** Looks up profile name, renders colored badge with initials or name.

### Step 5.2: Add Sender Profile to Leads Board

**File:** `src/components/leads-board.tsx`

**Add:** Profile badge next to owner name for each lead row.

### Step 5.3: Add Context to Follow-Up Section

**File:** `src/components/leads-board.tsx` and `src/components/leads-tab-view.tsx`

**Add:** For follow-up due rows, show "X days since contact" and "Follow-up N of 3".

### Step 5.4: Fix `buildFollowupTask` Sender Profile

**File:** `src/lib/queue-engine.ts:388-436`

**Add:** `convo?.senderProfileId` to evidence object.

**Acceptance Criteria:**
- [ ] Leads board shows sender profile badge for each lead
- [ ] Follow-up section shows days since contact and follow-up count
- [ ] Queue engine follow-up tasks include sender profile in evidence

### Regression Tests:
1. Lead with sender_profile_id → verify badge shows correct profile name
2. Lead without sender_profile_id → verify "No profile" fallback
3. Follow-up due lead → verify "5 days since contact · Follow-up 2 of 3" subtitle

---

## Phase 6: Score Display Clarity (ISSUE-001)

### Step 6.1: Fix Board Sort

**File:** `src/components/leads-board.tsx:139`

**Change:**
```typescript
// Before:
const aScore = a.canonicalScore ?? a.score ?? 0
const bScore = b.canonicalScore ?? b.score ?? 0

// After: Normalize to 0-12 scale for comparison
const normalizeScore = (lead) => {
  if (lead.canonicalScore != null) return lead.canonicalScore / 100 * 12
  return lead.score ?? 0
}
const aScore = normalizeScore(a)
const bScore = normalizeScore(b)
```

### Step 6.2: Clarify Score vs Profile Match on Lead Detail

**File:** `src/components/lead-workspace.tsx`

**Add:** If a referral recommendation exists, show "Best matched profile: [name] (match: X%)" separately from the Opportunity Score ring.

**Acceptance Criteria:**
- [ ] Leads board sorts correctly regardless of score system
- [ ] Lead detail shows Opportunity Score and Profile Match as separate concepts
- [ ] No confusion between "score 8" (canonical/10) and "match 80%"

### Regression Tests:
1. Lead with canonical_score=72 and lead with legacy_score=10 → verify legacy sorts higher (10/12 > 72/100)
2. Lead with profile referral → verify match score shown separately from opportunity score

---

## Implementation Order

```
Phase 1 (Critical) → Phase 2 (Critical) → Phase 3 (High) → Phase 4 (Medium) → Phase 5 (Medium) → Phase 6 (Low-Med)
```

Phases 1 and 2 are independent and can be done in parallel.
Phase 3 depends on Phase 1 (markContacted fix).
Phase 5 depends on Phase 3 context (follow-up data already available, just needs rendering).

---

## Rollback Plan

Each phase is independently reversible:
- Phase 1: Remove new endpoint, restore old behavior
- Phase 2: Revert gating logic
- Phase 3: Remove emitAction calls (events are append-only, no data corruption)
- Phase 4: Revert to hardcoded count (but don't — this is clearly a bug)
- Phase 5: Remove badge rendering
- Phase 6: Revert sort logic
