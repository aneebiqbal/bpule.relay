# CONVERSATION STATE MACHINE

## Current State Machine (as implemented in `relationship-state.ts`)

### Decision Table (evaluated top-to-bottom, first match wins)

| Priority | Condition | Kind | Phase | Primary CTA | UI Renders Correctly? |
|----------|-----------|------|-------|-------------|----------------------|
| 1 | `status === 'won'` | won | won | (terminal) | ✅ |
| 2 | `status ∈ {lost,dead,no}` | lost | lost | (terminal) | ✅ |
| 3 | `connectionSent && !accepted && >14 days` | lost | lost | Archive | ✅ |
| 4 | `connectionSent && !accepted` | their_move | connection_sent | Mark Accepted | ✅ |
| 5 | `clientReplied && !replySent` | your_move | replied | Prepare Reply | ✅ |
| 6 | `lastClient is rejection` | lost | lost | Archive | ✅ |
| 7 | `replySent` | their_move | conversation | Paste Client Reply | ❌ **NO COMPOSER** |
| 8 | `dmSent && !clientReplied && followupDue && !followupMaxed` | your_move | follow_up_due | Prepare Follow-Up | ✅ |
| 9 | `dmSent && !clientReplied` | their_move | dm_sent | Paste Client Reply | ❌ **NO COMPOSER** |
| 10 | `connectionAccepted && !dmSent` | your_move | connection_accepted | Prepare DM | ✅ |
| 11 | default | your_move | connection_due | Prepare Connection | ❌ **NO COMPOSER** (if no draft) |

### Phase → UI Mapping (Current)

```
connection_due    → your_move    → "Prepare Connection" button (triggers draft generation)
connection_sent   → their_move   → "Mark Accepted" button
connection_accepted → your_move  → "Prepare DM" button (triggers draft generation)
dm_due            → your_move    → "Prepare DM" button
dm_sent           → their_move   → ❌ Empty composer area, dead paste button
replied           → your_move    → "Prepare Reply" button (triggers reply draft)
conversation      → their_move   → ❌ Empty composer area, dead paste button
follow_up_due     → your_move    → "Prepare Follow-Up" button
```

### Message Type → Lead Status Mapping

```
markContacted(type):
  type === 'reply'    → lead.status = 'replied'
  type === 'followup' → lead.status = 'followed_up'
  type === 'dm'       → lead.status = 'contacted'
  type === 'connection' → lead.status = 'contacted' (with lock if verdict=send)
  type === 'upwork'   → lead.status = 'contacted'

recordProspectReply():
  → lead.status = 'replied' (always)
```

### Derived Signals

```
clientReplied = (Boolean(lastClient) && !isRejectionOrAutoReply(lastClient))
                || lead.outcomes.some(o => o.stage === 'replied')

replySent = any outbound message with type === 'reply'
            OR lead.status === 'replied' (when reply sent via markContacted)

followupDue = isFollowupDue(lastOutbound.sentAt, clientReplied, now)
             = businessDaysBetween(lastSent, now) >= 5 AND !clientReplied

followupMaxed = followupCount >= 3
```

---

## Gaps and Impossible States

### Gap 1: `their_move` + `conversation` — No UI Surface

After a reply is sent (Priority 7), the lead is in `their_move`/`conversation`. The UI:
- Shows message history ✅
- Shows waiting indicator ✅
- Shows NO composer ❌
- Shows NO paste-reply affordance ❌ (button exists but is no-op)

**Expected:** Paste-reply textarea + "Log Update" controls should be visible.

### Gap 2: `their_move` + `dm_sent` — Same Problem

After DM sent with no reply yet (Priority 9), same issue.

### Gap 3: No "Reply Sent → Then Client Replies" Transition Visible

When `replySent=true` (Priority 7 matches first), even if `clientReplied=true`, the state remains `their_move`/`conversation`. Priority 5 (`clientReplied && !replySent`) never matches because `replySent` is already true.

**This is actually correct behavior** — the state machine prioritizes the "we sent something" signal over "they replied" when both are true, because the next action depends on whether our reply was the last message. But the UI doesn't show what the client's reply was in this state.

### Impossible State: `follow_up_due` After Reply

If `clientReplied=true`, `isFollowupDue()` returns false (followup only due if no reply). So `follow_up_due` never coexists with `clientReplied`. This is correct.

### Impossible State: `conversation` Before `replied`

The `conversation` phase (Priority 7) only triggers when `replySent=true`. A reply can only be sent after the client replied (Priority 5). So `conversation` always follows `replied`. Correct.

---

## Required Canonical State Machine

### Phases (ordered)

```
NEW → CONNECTION_PENDING → CONNECTION_SENT → CONNECTION_ACCEPTED
→ DM_DUE → DM_SENT → AWAITING_REPLY
→ REPLIED → REPLY_DRAFTING → REPLY_SENT → AWAITING_RESPONSE
→ FOLLOW_UP_DUE → FOLLOW_UP_SENT → AWAITING_RESPONSE
→ [meeting/proposal/won/lost/archived]
```

### State → Expected UI

| Phase | Kind | Composer | Waiting Indicator | Actions Available |
|-------|------|----------|-------------------|-------------------|
| NEW | your_move | Connection draft | No | Generate connection, Log connection sent |
| CONNECTION_SENT | their_move | Paste reply area | Yes | Mark accepted, Log update |
| CONNECTION_ACCEPTED | your_move | DM draft | No | Generate DM, Log DM sent |
| DM_SENT | their_move | Paste reply area | Yes | Paste client reply, Log update |
| REPLIED | your_move | Reply draft | No | Generate reply, Log reply sent |
| REPLY_SENT | their_move | Paste reply area | Yes | Paste client reply, Log update |
| FOLLOW_UP_DUE | your_move | Follow-up draft | No | Generate follow-up, Log follow-up sent |
| FOLLOW_UP_SENT | their_move | Paste reply area | Yes | Paste client reply, Log update |

**Key invariant:** `their_move` phases MUST always render a paste-reply area. The composer area must never be empty when waiting for the client.

### State Transitions (canonical)

```
NEW → (generate connection) → [draft ready, same phase]
NEW → (log connection sent) → CONNECTION_SENT
CONNECTION_SENT → (mark accepted) → CONNECTION_ACCEPTED
CONNECTION_SENT → (timeout 14 days) → LOST
CONNECTION_ACCEPTED → (generate DM) → [draft ready]
CONNECTION_ACCEPTED → (log DM sent) → DM_SENT
DM_SENT → (client replies) → REPLIED
DM_SENT → (≥5 biz days, no reply, followupCount<3) → FOLLOW_UP_DUE
REPLIED → (generate reply) → REPLY_DRAFTING
REPLY_DRAFTING → (send reply) → REPLY_SENT
REPLY_SENT → (client replies) → REPLIED (cycle)
REPLY_SENT → (≥5 biz days, no reply, followupCount<3) → FOLLOW_UP_DUE
FOLLOW_UP_DUE → (generate follow-up) → [draft ready]
FOLLOW_UP_DUE → (log follow-up sent) → FOLLOW_UP_SENT
FOLLOW_UP_SENT → (client replies) → REPLIED
FOLLOW_UP_SENT → (≥5 biz days, no reply, followupCount<3) → FOLLOW_UP_DUE (escalation)
FOLLOW_UP_SENT → (followupCount>=3) → [no more follow-ups]
Any → (mark won) → WON
Any → (mark lost/no/dead) → LOST
```

---

## Current vs Required — Divergence Points

| # | Current Behavior | Required Behavior | Severity |
|---|-----------------|-------------------|----------|
| 1 | `their_move` phases hide composer | `their_move` phases must show paste-reply | Critical |
| 2 | Composer gated by `(draftText \|\| canDraft)` | Composer gated by phase (show paste area when waiting) | Critical |
| 3 | `onPasteReply` is no-op in waiting state | `onPasteReply` must open paste textarea | Critical |
| 4 | ReplyComposer returns null in `waiting` mode | ReplyComposer must render paste area in `waiting` mode | Critical |
| 5 | Log an update sends empty sentText | Status-only updates must not require sentText | Critical |
| 6 | `followup_sent` not in TYPES | Must match MessageType enum | High |
| 7 | followupCount derived from status | Must read from conversation_states.followup_count | Medium |
| 8 | Action events not emitted | Every state transition must emit event | High |
