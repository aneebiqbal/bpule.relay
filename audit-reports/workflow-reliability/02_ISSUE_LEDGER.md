# ISSUE LEDGER

---

## ISSUE-001: Score Inconsistency Per Profile

| Field | Value |
|-------|-------|
| **ID** | ISSUE-001 |
| **Severity** | Medium (semantic confusion, not data corruption) |
| **Reproduction** | Open a lead with profile referral recommendation. The prospect page says "Relay suggests: another profile (score 8 vs 4)". Open the lead detail page. Score shows canonical score (e.g. 72). Another rep opens same lead — sees same 72, not a per-profile score. |
| **Expected** | UI should clearly distinguish: (a) Opportunity Score (global, same for everyone) and (b) Profile Match Score (per-profile, only relevant for referral decisions). |
| **Actual** | Only Opportunity Score shown on lead detail. Profile match only shown on `/prospect` page during initial analysis. No per-profile score is displayed after lead creation. |
| **Root Cause** | The lead detail page (`lead-workspace.tsx:724`) renders only `ScoreRing` with the canonical score. The "better profile" recommendation is computed during prospect analysis (`prospect/page.tsx:650-684`) but never surfaced post-creation. There is no per-profile score stored or displayed on the lead. |
| **Files/Functions** | `src/components/lead-workspace.tsx:724` (ScoreRing), `src/components/score-ring.tsx` (display), `src/lib/profile-match.ts` (computeProfileMatch), `src/lib/prospect/intelligence.ts:525-540` (V3 profile match) |
| **DB/State** | `leads.canonical_score` (single integer, global), `leads.sender_profile_id` (set once at creation) |
| **Blast Radius** | Any team comparing profiles for a lead. Misunderstanding of which score means what. |
| **Invariant Violated** | UI must display conceptually distinct scores as separate concepts, never conflate opportunity quality with profile match quality. |
| **Adjacent Bug** | `leads-board.tsx:139` sorts by `canonicalScore ?? score`, mixing /100 and /12 scales numerically. A canonical score of 40 sorts above a legacy score of 10, even though 10/12 (83%) is stronger than 40/100 (40%). |

---

## ISSUE-002: Reply Section Disappears After Sending

| Field | Value |
|-------|-------|
| **ID** | ISSUE-002 |
| **Severity** | Critical |
| **Reproduction** | 1. Open a lead in YOUR_MOVE/REPLIED state. 2. Compose and send a reply. 3. Page refreshes or state recomputes. 4. Composer area vanishes. 5. Waiting state shows but "Paste Reply" button does nothing. |
| **Expected** | After sending a reply, the conversation should show: message history, waiting indicator, and a paste-reply affordance for when the client responds. |
| **Actual** | Composer area disappears completely. The waiting state's `onPasteReply` is a no-op `() => {}`. No way to paste a client reply from the conversation workspace. |
| **Root Cause** | Three-layer failure: (1) `conversation-workspace.tsx:290` gates composer on `(draftText || canDraft)` — both false in `their_move` state. (2) `reply-composer.tsx:83-85` returns `null` when mode is `'waiting'`. (3) `conversation-workspace.tsx:273` sets `onPasteReply={() => {}}` — explicit no-op. |
| **Files/Functions** | `src/components/conversation/conversation-workspace.tsx:273,290`, `src/components/conversation/reply-composer.tsx:83-85`, `src/lib/relay/relationship-state.ts:289-305` (sets their_move correctly) |
| **DB/State** | No DB involvement — purely a UI rendering gap. The conversation state in `conversation_states` table is correct. |
| **Blast Radius** | 100% of leads that reach `conversation` phase. Every rep loses the ability to interact with the conversation from the workspace. |
| **Invariant Violated** | Every state machine phase must render a UI surface that allows the user to perform the expected action. `their_move`/`conversation` phase must expose paste-reply capability. |

---

## ISSUE-003: "I Sent Reply" / "I Sent Follow-Up" Throws Error

| Field | Value |
|-------|-------|
| **ID** | ISSUE-003 |
| **Severity** |
| **Reproduction** | 1. Open any lead. 2. Click "Log an update". 3. Select "I sent a message" or "I followed up". 4. Click "Log this". 5. Error: "Paste the message text you actually sent." No text field appears. |
| **Expected** | Either (a) a text field appears to paste the sent message, or (b) the action is logged without requiring message text (for status-only updates). |
| **Actual** | API rejects with 400 `"Paste the message text you actually sent."` The UI provides no field to satisfy this requirement. |
| **Root Cause** | Contract mismatch: `log-relationship-update.tsx:58` sends `{ type: selected, sentText: '' }` for ALL non-connection-accepted actions. `contact/route.ts:23-27` requires non-empty `sentText` (unless `rejected === true`). The two were never reconciled. |
| **Files/Functions** | `src/components/relationship/log-relationship-update.tsx:58` (sends empty sentText), `src/app/api/leads/[id]/contact/route.ts:23-27` (rejects empty sentText), `src/app/api/leads/[id]/contact/route.ts:7` (TYPES array) |
| **DB/State** | No DB write occurs — the request is rejected at validation. |
| **Blast Radius** | 8 of 9 "Log an update" options fail. Only "They accepted my connection" works (uses separate `/connection-accepted` endpoint). |
| **Invariant Violated** | Any API-required field must be collectable from the UI. The `sentText` requirement has no corresponding UI field in `LogRelationshipUpdate`. |

---

## ISSUE-003a: Follow-Up Type Mislabelled

| Field | Value |
|-------|-------|
| **ID** | ISSUE-003a |
| **Severity** | High |
| **Reproduction** | Select "I followed up" from Log an update. The type sent is `followup_sent`. This is silently logged as `dm` because `followup_sent` is not in the TYPES array. |
| **Expected** | Follow-up is logged as `type: 'followup'`, `conversation_states.followup_count` increments, `lead.status` becomes `'followed_up'`. |
| **Actual** | Type defaults to `'dm'` (contact/route.ts:30-32). Lead status becomes `'contacted'` instead of `'followed_up'`. `followup_count` not incremented. 3-per-lead cap is bypassed. |
| **Root Cause** | `log-relationship-update.tsx:23` uses value `'followup_sent'` but `contact/route.ts:7` TYPES array has `'followup'` not `'followup_sent'`. The `TYPES.includes()` check fails, defaults to `'dm'`. |
| **Files/Functions** | `src/components/relationship/log-relationship-update.tsx:23` (value: `'followup_sent'`), `src/app/api/leads/[id]/contact/route.ts:7` (TYPES array missing `'followup_sent'`) |
| **DB/State** | Wrong message type in `messages` table. `conversation_states.followup_count` not incremented. `leads.status` set to `'contacted'` instead of `'followed_up'`. |
| **Blast Radius** | Every manually logged follow-up is miscounted and misclassified. |
| **Invariant Violated** | MessageType enum must be consistent across all producers and consumers. `followup_sent` vs `followup` is a naming collision. |

---

## ISSUE-004: Lead Sections Lack Actionable Context

| Field | Value |
|-------|-------|
| **ID** | ISSUE-004 |
| **Severity** | Medium |
| **Reproduction** | Open leads board. Observe "Follow-Up" section. Each row shows: company, contact name, signal, owner. Missing: which sender profile, which rep, when due, last message, follow-up number. |
| **Expected** | Follow-up due rows should show: lead name, sender profile, assigned rep, due date/reason, last message summary, follow-up N of 3. |
| **Actual** | Only company/contact/signal/owner shown. No sender profile. No due reason. No follow-up count. |
| **Root Cause** | (1) `leads-board.tsx` renders only basic lead fields — `senderProfileId` is available on the lead but never rendered. (2) `queue-engine.ts:388-436` `buildFollowupTask()` doesn't include sender profile in evidence (unlike `buildReplyTask()` at line 210). (3) `fetchFollowupsDue()` computes `daysSinceContact` and `followupCount` but these aren't passed to list views. |
| **Files/Functions** | `src/components/leads-board.tsx` (rendering), `src/components/leads-tab-view.tsx` (rendering), `src/lib/relay/queue-engine.ts:388-436` (buildFollowupTask), `src/lib/store/supabase-store.ts:1848-1903` (fetchFollowupsDue) |
| **DB/State** | `leads.sender_profile_id` exists and is populated. `conversation_states.followup_count` exists. `messages.sent_at` exists. The data is available; the UI doesn't surface it. |
| **Blast Radius** | All reps and admins viewing lead lists. Cannot determine which profile to use for follow-up without drilling into each lead. |
| **Invariant Violated** | Sender profile context must be visible wherever a lead or follow-up is displayed. The sender is the identity under which the prospect knows the rep. |

---

## ISSUE-005: Upwork Activity Not Counted

| Field | Value |
|-------|-------|
| **ID** | ISSUE-005 |
| **Severity** | High |
| **Reproduction** | Rep extracts an Upwork job, generates a proposal, applies. Admin views `/admin/activity`. No Upwork activity shown. `getTodayCounts` returns 0 for Upwork proposals. |
| **Expected** | Upwork job extraction, proposal preparation, and application should create `UPWORK_JOB_EXTRACTED`, `UPWORK_PROPOSAL_PREPARED`, `UPWORK_APPLIED` events in `action_events`. Admin views should aggregate and display these. |
| **Actual** | Zero `action_events` rows for any Upwork action. The `action_events` table only contains `LEAD_REFERRED` events (from `lead-referral.ts:52`). |
| **Root Cause** | `emitAction()` from `action-ledger.ts` is only called ONCE in the entire codebase (referrals). `markContacted()` (the main send path) writes to `messages` and `relay_events` but never to `action_events`. Upwork paths (`createUpworkJob`, `saveUpworkDraft`, `markUpworkApplied`) also don't call `emitAction()`. |
| **Files/Functions** | `src/lib/action-ledger.ts` (emitAction defined), `src/lib/store/supabase-store.ts:1168` (markContacted — no emitAction call), `src/lib/store/supabase-store.ts:2344` (createUpworkJob — no emitAction), `src/lib/store/supabase-store.ts:2411` (markUpworkApplied — no emitAction) |
| **DB/State** | `action_events` table exists with correct schema and CHECK constraint. Almost always empty. |
| **Blast Radius** | Admin Operating Ledger (`/admin/activity`) shows no team activity except referrals. Team Live Board doesn't count Upwork in per-rep metrics. `daily_accountability` tracks applications for targets but this is a separate system. |
| **Invariant Violated** | Every meaningful user action must emit exactly one Action Ledger event. Zero of 14 defined action types are emitted during normal operation. |

---

## ISSUE-006: Action Ledger Completely Non-Functional

| Field | Value |
|-------|-------|
| **ID** | ISSUE-006 |
| **Severity** | Critical (system-wide) |
| **Reproduction** | Check `action_events` table directly. Only `LEAD_REFERRED` events exist. All other 13 action types have zero rows despite months of usage. |
| **Expected** | Every DM sent, connection sent, follow-up sent, reply received, lead extracted, Upwork job extracted, proposal prepared, and application sent should create an `action_events` row. |
| **Actual** | `emitAction()` called exactly once in codebase (referrals). All other emission points were never wired. |
| **Root Cause** | The Action Ledger was designed and the schema was created, but the emission calls were never added to the actual send/action paths. `markContacted()` (handles connection/DM/follow-up/reply), `createLead()` (handles extraction), `createUpworkJob()`, `saveUpworkDraft()`, `markUpworkApplied()` — none call `emitAction()`. |
| **Files/Functions** | `src/lib/action-ledger.ts` (emitAction, getAll defined action types), `src/lib/store/supabase-store.ts` (all action paths missing emitAction calls) |
| **DB/State** | `action_events` table is structurally correct but effectively empty. |
| **Blast Radius** | The entire admin operating view is non-functional. Admins cannot see team activity, daily execution history, or commercial event audit trail. |
| **Invariant Violated** | The Action Ledger was designed as the single source of truth for "what the team actually did." It must be populated for every meaningful action. |

---

## ISSUE-007: followupCount Under-Counted in Draft Route

| Field | Value |
|-------|-------|
| **ID** | ISSUE-007 |
| **Severity** | Medium |
| **Reproduction** | After sending 2 follow-ups, generate a 3rd. The AI prompt says "Follow-up 1 of 3 allowed" instead of "Follow-up 3 of 3". |
| **Expected** | `buildFollowupPrompt` receives the correct `followupCount` from `conversation_states`. |
| **Actual** | `draft/route.ts:180` hard-codes `followupCount: detail.status === 'followed_up' ? 1 : 0` and line 193 passes `followupCount: 0` to `buildFollowupPrompt`. The actual `detail.followupCount` from `conversation_states` is available but unused. |
| **Root Cause** | `draft/route.ts` re-derives `followupCount` from `lead.status` instead of using the already-loaded `detail.followupCount` from `conversation_states`. Status is binary (contacted/followed_up) while the count can be 0-3. |
| **Files/Functions** | `src/app/api/leads/[id]/draft/route.ts:180,193` |
| **DB/State** | `conversation_states.followup_count` is correctly maintained by `markContacted()` but ignored by the draft route. |
| **Blast Radius** | AI generates follow-ups with wrong context about how many follow-ups have been sent. May produce repetitive or incorrectly escalated messaging. |
| **Invariant Violated** | There must be exactly one source of truth for followupCount: `conversation_states.followup_count`. |

---

## ISSUE-008: followup_sent vs followup Type Collision

| Field | Value |
|-------|-------|
| **ID** | ISSUE-008 |
| **Severity** | High |
| **Reproduction** | Log "I followed up" via relationship update. Check `messages` table — the row has `type: 'dm'` instead of `type: 'followup'`. |
| **Expected** | Message type should be `'followup'`. |
| **Actual** | `log-relationship-update.tsx:23` sends `'followup_sent'`, which fails the `TYPES.includes()` check at `contact/route.ts:30`, defaults to `'dm'`. |
| **Root Cause** | The UPDATE_OPTIONS value `'followup_sent'` doesn't match the MessageType enum value `'followup'`. Two different naming conventions for the same concept. |
| **Files/Functions** | `src/components/relationship/log-relationship-update.tsx:23`, `src/app/api/leads/[id]/contact/route.ts:7,30` |
| **DB/State** | Messages table has wrong type. `conversation_states.followup_count` not incremented. |
| **Blast Radius** | Every manually logged follow-up is stored as a DM. Follow-up counts are wrong. Follow-up due logic may re-trigger incorrectly. |
| **Invariant Violated** | MessageType values must be consistent across all producers and consumers. No aliases. |
