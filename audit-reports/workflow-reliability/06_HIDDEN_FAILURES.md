# HIDDEN FAILURES

Adjacent issues found during audit — confirmed through code trace.

---

## HF-001: `followup_sent` Type Collision

**Confirmed:** `log-relationship-update.tsx:23` uses `'followup_sent'` as the value, but `contact/route.ts:7` defines TYPES as `['dm', 'connection', 'upwork', 'followup', 'reply']`. The string `'followup_sent'` is not in this array, so it defaults to `'dm'`.

**Impact:** Every manually logged follow-up is stored as a DM. `conversation_states.followup_count` is not incremented. The 3-per-lead cap is silently bypassed. Follow-up due logic may re-trigger incorrectly.

**Same class as:** ISSUE-003 (contract mismatch)

---

## HF-002: Action Ledger Timezone Inconsistency

**Confirmed:** `getDailySummary` in `action-ledger.ts:117` uses UTC day boundaries (`${date}T00:00:00.000Z`). `load-team-live.ts:8` uses local timezone boundaries (`new Date(now.getFullYear(), now.getMonth(), now.getDate())`).

**Impact:** Same action can appear on different dates depending on which admin view is used. Rep in UTC-5 sending at 11pm EST appears on today's team-live but tomorrow's operating ledger.

**Same class as:** ISSUE-005/006 (Action Ledger non-functional, so currently invisible, but will surface when ledger is fixed)

---

## HF-003: `draft/route.ts` followupCount Hard-Coded

**Confirmed:** Line 180: `followupCount: detail.status === 'followed_up' ? 1 : 0`. Line 193: `followupCount: 0` passed to `buildFollowupPrompt`. The actual `detail.followupCount` (from `conversation_states`) is loaded but unused.

**Impact:** AI always thinks it's generating the 1st follow-up. After 2 follow-ups, the AI prompt says "Follow-up 1 of 3 allowed" instead of "Follow-up 3 of 3 — final attempt, make it count." Produces wrong escalation strategy.

**Same class as:** ISSUE-003a (data source confusion)

---

## HF-004: `buildFollowupTask` Missing Sender Profile

**Confirmed:** `queue-engine.ts:388-436` `buildFollowupTask()` does not include `convo.senderProfileId` in evidence. Compare with `buildReplyTask()` (line 210) which does: `convo?.senderProfileId`.

**Impact:** Follow-up tasks in the queue lack sender profile context. AI generating follow-ups doesn't know which identity to use. Queue evidence is incomplete for follow-up prioritization.

**Same class as:** ISSUE-004 (missing context)

---

## HF-005: Unknown Update Types Silently Default to 'dm'

**Confirmed:** `contact/route.ts:30-32`: `const type: MessageType = TYPES.includes(body.type as MessageType) ? body.type : 'dm'`. When `log-relationship-update.tsx` sends `'meeting_booked'`, `'proposal_sent'`, `'interested'`, `'not_interested'`, `'no_response'`, or `'other'`, these all silently become `'dm'`.

**Impact:** Non-message status updates create phantom DM records in the `messages` table. Inflates DM counts. Creates incorrect conversation history. Meeting booked becomes a "DM sent" in the timeline.

**Same class as:** ISSUE-003 (contract mismatch)

---

## HF-006: Dual Reply Recording Paths

**Confirmed:** Both `recordProspectReply()` (for inbound client messages) and `markContacted(type='reply')` (for outbound rep replies) create `outcomes` rows with `stage: 'replied'`. But the semantic meaning differs:
- `recordProspectReply`: client sent a message → inbound
- `markContacted(type='reply')`: rep sent a reply → outbound

Both create the same outcome stage. The `relationship-state.ts` logic uses `outcomes.stage === 'replied'` to detect client replies (line 145), which is correct for the inbound path. But if a rep logs a reply via markContacted, it also creates `outcomes.stage = 'replied'`, which could confuse the state machine into thinking the client replied.

**Impact:** Potential false "They replied" signal when a rep only logged their own outbound reply. The `clientReplied` derived signal checks `lastClient` (inbound messages) first, so this is mitigated. But the outcomes table has mixed semantics.

---

## HF-007: ScoreRing Display Scale Mismatch

**Confirmed:** `score-ring.tsx` displays `Math.round(canonicalScore / 10)` (so 85 → "9"). But `lead-workspace.tsx:728` uses raw `canonicalScore` for labels (`>= 85 ? 'Strong'`). A score of 84 shows ring "8" with label "Fair" — visually inconsistent (8/10 ring looks good but label says fair).

**Impact:** Minor visual confusion. Not a data bug but a presentation inconsistency.

---

## HF-008: `LogRelationshipUpdate` Shows All Phase Options

**Confirmed:** `log-relationship-update.tsx:18-29` UPDATE_OPTIONS includes phases like `'*'` for "Something else" and overlapping phases for other options. For example, "They replied" (`client_replied`) shows for phases `['dm_sent', 'waiting_for_reply', 'replied', 'follow_up_due', 'conversation']` — but in `replied` phase, the client HAS already replied. Logging it again is a no-op that would create a duplicate inbound message with empty text.

**Impact:** User can select logically impossible updates. Combined with ISSUE-003, these all fail at the API anyway, so the impact is currently hidden. Once ISSUE-003 is fixed, this becomes a real problem.

---

## HF-009: `conversation_states.senderProfileId` vs `leads.senderProfileId`

**Confirmed:** There are TWO sender profile fields:
- `leads.sender_profile_id` — set at lead creation, persists for lead lifetime
- `conversation_states.sender_profile_id` — per-conversation, could diverge

The queue engine uses `convo?.senderProfileId` (conversation-level) while the lead detail page uses `lead.senderProfileId` (lead-level). These could theoretically diverge if a lead's conversation is reset or reassigned.

**Impact:** If diverged, the queue would show the wrong profile for a follow-up task. Currently likely consistent in practice (both set from the same source at creation), but the dual-path creates maintenance risk.

---

## HF-010: `canDraft` Not Computed for All Phases

**Confirmed:** In `conversation-workspace.tsx`, `canDraft` determines whether the composer renders. But it's only set based on specific conditions. In `connection_sent` phase (waiting for acceptance), `canDraft` is likely false and `draftText` is empty — meaning no composer shows even though the rep might want to prepare a DM draft while waiting.

**Impact:** Same class as ISSUE-002. Any phase where the rep could proactively prepare a draft but the system is waiting shows no composer.

---

## SEVERITY RANKING

| ID | Severity | Fix Complexity | Blocks Other Fixes? |
|----|----------|---------------|---------------------|
| HF-001 | High | Trivial (1 line) | Related to ISSUE-003 |
| HF-002 | Medium | Medium (normalize to UTC) | Will surface when ledger fixed |
| HF-003 | Medium | Trivial (2 lines) | Independent |
| HF-004 | Medium | Low (add to evidence) | Independent |
| HF-005 | High | Medium (new endpoint) | Same fix as ISSUE-003 |
| HF-006 | Medium | Medium (outcome stage semantics) | Independent |
| HF-007 | Low | Trivial (normalize display) | Independent |
| HF-008 | Medium | Low (phase filtering) | Dependent on ISSUE-003 |
| HF-009 | Low | Medium (consolidate) | Independent |
| HF-010 | Medium | Medium (same as ISSUE-002) | Related to ISSUE-002 |
