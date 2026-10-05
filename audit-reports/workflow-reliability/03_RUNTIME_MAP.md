# RUNTIME MAP — Active Code Paths

---

## 1. SCORE / PROFILE MATCH

### Complete Source → Calculation → Storage → Consumer Map

| Concept | Source | Calculation | Storage | Consumers |
|---------|--------|-------------|---------|-----------|
| **Legacy Score (0-12)** | `src/lib/score/rubric.ts:computeScore()` | Arithmetic on signals (max 7) + completeness (max 5) | `leads.score`, `leads.verdict` | `lead-workspace.tsx` (via canonicalToLegacyScoreResult fallback), `leads-board.tsx:139` (sort) |
| **Canonical V2 Score (0-100)** | `src/lib/intelligence-v2/scoring-engine.ts` | 8 dimensions with hard negatives | `leads.canonical_score`, `leads.score_breakdown`, `leads.score_version` | `lead-workspace.tsx:724` (ScoreRing), `leads-board.tsx:139` (sort), `orchestrator.ts:706` (canonicalToLegacyScoreResult bridge) |
| **Prospect Score (0-100, ephemeral)** | `src/lib/prospect/intelligence.ts:scoreProspect()` | 7 dimensions + risk penalty | Not stored — computed live | `prospect/page.tsx:650-684` (display during analysis only) |
| **Profile Match (0-100)** | `src/lib/profile-match.ts:computeProfileMatch()` | Skills + industry + proof overlap | Not stored per-lead — used to pick `sender_profile_id` at creation | `prospect/analyze` route, `lead-referral.ts`, `upwork-v2.ts` analysis |
| **V3 Episode Score (0-100)** | `src/lib/intelligence-v3/scoring/score-v3.ts` | 7 dimensions on opportunity episodes | Not stored on leads — experimental | Orphaned. No active UI consumer. |

### Score Flow — Lead Detail Page

```
User opens /leads/[id]
→ page.tsx: store.getLead(id) → Lead row with canonical_score
→ page.tsx:30-39: canonicalToLegacyScoreResult(lead) ?? computeScore(...)
→ ScoreResult passed to LeadWorkspace
→ LeadWorkspace:724: <ScoreRing score={score.total} canonicalScore={currentLead.canonicalScore} />
→ ScoreRing: canonicalScore ? Math.round(canonicalScore / 10) : rawScore
→ Display: "8" (for canonicalScore=85)
→ LeadWorkspace:728: label based on raw canonicalScore >= 85 ? 'Strong' : ...
```

### Score Flow — Leads Board

```
leads-board.tsx:139:
const aScore = a.canonicalScore ?? a.score ?? 0
const bScore = b.canonicalScore ?? b.score ?? 0
return bScore - aScore  // DESC sort
```
**BUG:** Mixes /100 and /12 scales.

### Profile Match Flow

```
Prospect analysis (paste LinkedIn URL)
→ /api/prospect/analyze
→ profile-match.ts:rankProfilesForOpportunity()
→ Best profile selected → senderProfileId
→ /api/prospect/save → leads.sender_profile_id set
→ Never recomputed after creation
→ lead-referral.ts: getReferralRecommendations() (separate, for referrals only)
```

---

## 2. CONVERSATION / REPLY FLOW

### State Machine Path

```
Lead created → status: 'new'
→ computeRelationshipState() evaluates:
  Priority 1: status === 'won' → won/won
  Priority 2: status ∈ {lost,dead,no} → lost/lost
  Priority 3: connectionSent && !accepted && >14 days → lost/expired
  Priority 4: connectionSent && !accepted → their_move/connection_sent
  Priority 5: clientReplied && !replySent → your_move/replied
  Priority 6: lastClient is rejection → lost/lost
  Priority 7: replySent → their_move/conversation    ← BUG: no composer rendered
  Priority 8: dmSent && !clientReplied && followupDue && !followupMaxed → your_move/follow_up_due
  Priority 9: dmSent && !clientReplied → their_move/dm_sent
  Priority 10: connectionAccepted && !dmSent → your_move/connection_accepted
  Priority 11: default → your_move/connection_due
```

### "I Sent a Message" Flow (Manual Log)

```
Rep clicks "Log an update" → LogRelationshipUpdate component
→ Selects "I sent a message" → selected = 'dm_sent'
→ Clicks "Log this" → handleLog()
→ fetch('/api/leads/{id}/contact', { body: { type: 'dm_sent', sentText: '', direction: 'inbound' } })
→ contact/route.ts:
  - sentText.trim() === '' → TRUE
  - rejected !== true → TRUE
  - Returns 400: "Paste the message text you actually sent."
→ Error displayed in UI, no text field available
```

### "I Followed Up" Flow (Manual Log)

```
Rep selects "I followed up" → selected = 'followup_sent'
→ fetch('/api/leads/{id}/contact', { body: { type: 'followup_sent', sentText: '' } })
→ contact/route.ts:
  - sentText === '' → Returns 400 (same error as above)
→ Even if sentText were provided:
  - TYPES.includes('followup_sent') → FALSE
  - type defaults to 'dm' (line 30-32)
→ Message stored as 'dm', not 'followup'
```

### "Paste Client Reply" Flow

```
Rep pastes client message
→ PasteClientReply component
→ fetch('/api/leads/{id}/reply', { body: { text: replyText } })
→ reply/route.ts:
  - text validation → passes (has text)
  - store.recordProspectReply(leadId, replyText)
    → messages insert: { type: 'reply', direction: 'inbound' }
    → leads update: { status: 'replied' }
    → outcomes insert: { stage: 'replied' }
    → conversation_states upsert: { stage: 'replied', lastReplyAt: now }
    → relay_events emit: CLIENT_REPLIED
→ State transitions to your_move/replied ✓ (this path works)
```

### "Send Reply" Flow (From Composer)

```
Rep composes reply in ReplyComposer (edit_draft mode)
→ Clicks "Log as Sent"
→ fetch('/api/leads/{id}/contact', { body: { type: 'reply', sentText: composedText } })
→ contact/route.ts:
  - sentText valid → passes
  - type 'reply' in TYPES → passes
  - store.markContacted(leadId, 'reply', sentText)
    → messages insert: { type: 'reply', direction: 'outbound' }
    → leads update: { status: 'replied' }
    → outcomes insert: { stage: 'replied' }
    → conversation_states upsert: { stage: 'replied' }
    → relay_events emit: OUTREACH_RECORDED
    → NO action_events emit ← BUG
→ State transitions to their_move/conversation
→ Composer disappears ← BUG (conversation-workspace.tsx:290)
```

### Conversation Workspace Rendering

```
conversation-workspace.tsx render:
→ isWaiting = relationshipState.kind === 'their_move'
→ draftText = empty (no active draft)
→ canDraft = false (waiting state)
→ (draftText || canDraft) = false → Composer NOT rendered ← BUG
→ isWaiting && !draftText → ConversationWaitingState rendered
  → onPasteReply={() => {}} ← no-op, dead button ← BUG
→ Messages render if hasMessages ✓
```

---

## 3. FOLLOW-UP FLOW

### Follow-Up Generation

```
State machine detects follow_up_due → your_move/follow_up_due
→ Rep clicks "Prepare Follow-Up"
→ fetch('/api/leads/{id}/draft', { body: { type: 'followup' } })
→ draft/route.ts:
  - detail = store.getLead(id)
  - followupCount: detail.status === 'followed_up' ? 1 : 0  ← BUG: ignores actual count
  - buildFollowupPrompt(context, strategy) with wrong followupCount
→ AI generates follow-up text
→ Rep edits and sends via "Log as Sent"
→ fetch('/api/leads/{id}/contact', { body: { type: 'followup', sentText: text } })
→ store.markContacted(leadId, 'followup', text)
  → messages insert: { type: 'followup', direction: 'outbound' }
  → leads update: { status: 'followed_up' }
  → conversation_states upsert: { stage: 'followed_up', followupCount: +1 }
```

### Follow-Up Queue Derivation

```
Dashboard/queue load:
→ store.fetchFollowupsDue():
  1. Query leads WHERE status IN ('contacted', 'followed_up')
  2. Fetch messages WHERE sent_at IS NOT NULL
  3. Fetch outcomes WHERE stage = 'replied'
  4. Build lastSent timestamp per lead
  5. Bulk-fetch conversation_states.followup_count
  6. For each lead:
     - Skip if reply outcome exists
     - Skip if businessDaysBetween(lastSent, now) < 5
     - Skip if followupCount >= 3
     - Add to due list
→ Queue engine: buildFollowupTask(lead, convo, evidence)
  → Does NOT include senderProfileId in evidence ← BUG
→ leads-board.tsx: status === 'followed_up' → 'followup_due' section
  → Renders: company, contact, signal, owner
  → Missing: sender profile, due date, last message ← BUG
```

---

## 4. ACTION LEDGER

### Emission Points (Current — Almost None)

| Action Type | Should Be Emitted In | Actually Emitted? |
|-------------|---------------------|-------------------|
| LEAD_EXTRACTED | `store.createLead()` / `captureProspect()` | ❌ Never |
| CONNECTION_SENT | `store.markContacted(type='connection')` | ❌ Never |
| DM_SENT | `store.markContacted(type='dm')` | ❌ Never |
| FOLLOWUP_SENT | `store.markContacted(type='followup')` | ❌ Never |
| REPLY_RECEIVED | `store.recordProspectReply()` | ❌ Never |
| LEAD_REFERRED | `referLead()` | ✅ `lead-referral.ts:52` |
| PROFILE_RECOMMENDED | Profile recommendation logic | ❌ Never |
| UPWORK_JOB_EXTRACTED | `store.createUpworkJob()` | ❌ Never |
| UPWORK_PROPOSAL_PREPARED | `store.saveUpworkDraft()` | ❌ Never |
| UPWORK_APPLIED | `store.markUpworkApplied()` | ❌ Never |
| CLIENT_WON | `store.updateLeadStatus('won')` | ❌ Never |
| CONNECTION_PREPARED | Connection draft generation | ❌ Never |
| DM_PREPARED | DM draft generation | ❌ Never |
| OPPORTUNITY_CREATED | Opportunity creation | ❌ Never |

### Query Paths (What Admin Sees)

```
/admin/activity → getDailySummary(date)
  → action_events WHERE occurred_at BETWEEN {date}T00:00Z AND {date}T23:59Z  ← UTC boundaries
  → GROUP BY actor_id, action_type
  → Returns DailySummary[]
  → Display: per-rep breakdown of connections/dms/followups/replies/etc.
  → ACTUAL: empty except referrals

/admin/live-feed → live-feed/route.ts
  → relay_events (recent) + messages (recent) + daily_accountability
  → Does NOT use action_events at all
  → Uses local time boundaries ← timezone inconsistency with getDailySummary

/admin/team-live → load-team-live.ts
  → messages table + daily_accountability + extraction_runs + leads
  → Does NOT use action_events
  → Per-rep: outreachSent = count of non-reply messages
  → Upwork: only via daily_accountability, not per-rep visible
```

---

## 5. UPWORK FLOW

### Job Extraction

```
Rep pastes Upwork job URL
→ POST /api/upwork/extract
→ extractUpworkJob() from upwork-v2.ts
→ Structured job data
→ POST /api/upwork/jobs → store.createUpworkJob()
  → upwork_jobs table insert
  → NO action_events UPWORK_JOB_EXTRACTED emit ← BUG
```

### Proposal Generation

```
Rep clicks "Generate Proposal"
→ POST /api/upwork/jobs/{id}/generate
→ AI generates cover letter + screening answers
→ upwork_applications table insert
→ NO action_events UPWORK_PROPOSAL_PREPARED emit ← BUG
```

### Apply

```
Rep clicks "Apply"
→ POST /api/upwork/jobs/{id}/apply → store.markUpworkApplied()
  → upwork_jobs.status → 'applied'
  → upwork_messages insert (type: 'proposal')
  → record_activity_event RPC for daily_accountability (activity_type: 'application')
  → record_canonical_progress RPC
  → NO action_events UPWORK_APPLIED emit ← BUG
```

### Upwork Metrics Visibility

```
Admin views:
→ action_events table → always 0 Upwork events
→ daily_accountability → tracks 'application' for targets (works, separate system)
→ messages table → upwork_messages NOT counted in outreachSent (different table)
→ team-live per-rep rows → no Upwork count shown
```

---

## 6. LEAD QUEUES

### Contacted Section

```
Source: leads-board.tsx:123
Filter: lead.status === 'contacted'
Sub-filters:
  - awaiting_connection: status=contacted AND !connectionAcceptedAt AND lockedReason=connection_note_sent AND !locked
  - Otherwise: "Waiting for reply"
Data shown: company, contact name, signal, status badge, next action, last activity time
Missing: sender profile, message preview
```

### Replied Section

```
Source: leads-board.tsx:122
Filter: lead.status === 'replied'
Data shown: company, contact name, signal, status badge ("Replying"), next action ("Reply now")
Missing: sender profile, message preview
```

### Follow-Up Due Section

```
Source A: leads-board.tsx:124
Filter: lead.status === 'followed_up'

Source B: queue-engine.ts via fetchFollowupsDue()
Filter: status IN ('contacted','followed_up') AND no reply AND ≥5 biz days since last sent AND followupCount < 3
Data shown in board: company, contact, signal, owner
Missing: sender profile, due reason, last message, follow-up N of 3

Note: Section A shows ALL followed_up leads (even if follow-up not yet due).
Section B shows only actually-due leads. These are different sets.
```

---

## 7. DATE/TIME BOUNDARY ISSUES

```
getDailySummary (action-ledger.ts:117):
  → UTC day boundaries: `${date}T00:00:00.000Z` to `${date}T23:59:59.999Z`

load-team-live (load-team-live.ts:8):
  → Local time boundaries: new Date(now.getFullYear(), now.getMonth(), now.getDate())

Impact: Rep in UTC-5 (EST) sends message at 11pm EST = 4am UTC next day.
  → team-live (local): shows on today's date
  → operating ledger (UTC): shows on tomorrow's date
  → Same action, different dates in different views.
```
