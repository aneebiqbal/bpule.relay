# Relay — Follow-Up Policy Map (Sprint B / B1)

**Date:** 2026-10-24 · **Canonical module:** `src/lib/conversation/follow-up-policy.ts` · **Version:** `follow_up_policy_v1`

## Every place a follow-up decision existed

| # | Location | Old policy | Live? | Status |
|---|---|---|---|---|
| 1 | `src/lib/leads/followup.ts` | 3/6/6 calendar days, max 3 follow-ups | **yes** | arithmetic moved to the canonical module; this file re-exports it and keeps only the archive rule |
| 2 | `src/lib/relay/timing-engine.ts` | **24 h** follow-up window | no (only imported by dead `orchestration/next-action.ts`) | deprecated, not a live clock |
| 3 | `src/lib/timezone/resolve.ts:120` | `calculateContactWindow` = timezone overlap | yes | **not a cadence** — working-hours overlap, unrelated; unchanged |
| 4 | `src/lib/relay/followup-engine.ts` | consumes #1 | **yes** | now reads `evaluateFollowUpPolicy` |
| 5 | `src/lib/relay/lead-state-machine.ts` | consumes #1 | **yes** | now reads `evaluateFollowUpPolicy` |
| 6 | `src/lib/store/supabase-store.ts` `fetchFollowupsDue` | consumes #1, plus its own `>=3` and `daysSince` arithmetic | **yes** | now reads `evaluateFollowUpPolicy`; outbound/inbound tracked separately |
| 7 | `src/components/leads/pipeline-utils.ts:68` | `isFollowupDue` | **yes** | uses the canonical re-export |
| 8 | DB trigger `0033` | **5 business days**, 1 follow-up | yes | **replaced** by migration `20261024120001` → 3 calendar days (first follow-up) |
| 9 | `conversation_states.next_followup_at` | **never set** (dead column) | yes (read) | now written by `markContacted` from the policy |
| 10 | `src/lib/admin/command-center-v2.ts` | reads #9 | yes | now reads a real value |
| 11 | `src/app/api/admin/rep-day/route.ts` | reads #9 | yes | now reads a real value |
| 12 | `src/lib/orchestration/next-action.ts` | uses #2 | no (unreferenced) | dead |
| 13 | `src/lib/relay/next-best-action.ts:220` | `dueAt` from `followupDue` | yes | follows the lead action, which now uses the policy |

## The conflict

Three different clocks were live in spirit:
- **DB trigger:** 5 *business* days, **1** follow-up ever.
- **App JS:** 3/6/6 *calendar* days, **3** follow-ups.
- **Dead code:** 24 h.

A rep could be told a follow-up was due while the DB said it was not, and the notification cadence contradicted the queue cadence.

## The chosen canonical rule

`src/lib/conversation/follow-up-policy.ts` is the only decision maker.

| Rule | Value | Why |
|---|---|---|
| Cadence | 3 / 6 / 6 **calendar** days by follow-up count | the live product behaviour; every existing test asserts it; changing to 1 follow-up would be a product regression not authorized by Sprint B |
| Max follow-ups | 3 | same |
| Business-day arithmetic | centralised in the module (`businessDaysBetween`) | one implementation for any future working-day policy |
| Terminal | `won` / `lost` / `no` / `dead` + `DO_NOT_CONTACT` outcome → disabled | Sprint A invariant |
| Reply | cancels a pending cold follow-up | unchanged |
| Deferral | explicit date wins over the cadence | unchanged |
| Duplicates | prevented by the cadence + count cap | unchanged |

> The program's example suggested 5 business days / 1 follow-up. That was **not** adopted: it would silently remove two follow-ups the product currently allows and break the documented 3-follow-up design. The conflicting clocks were removed; the live rule was kept and made single-source.

## Contract

```ts
evaluateFollowUpPolicy(input) -> {
  eligible: boolean
  nextFollowupAt: string | null
  reason: string
  policyVersion: string   // 'follow_up_policy_v1'
  terminal: boolean
  cancelledByReply: boolean
  cancelledByOutcome: boolean
}
```

Inputs: lead status, canonical outcome, conversation stage, last outbound, last inbound, follow-up count, explicit deferral date, channel, org timezone, now.

## Consumers (all read the same object)

- `fetchFollowupsDue` (Today / queue)
- `determineFollowup` (composer)
- `deriveNextLeadAction` (lead detail next action)
- `pipeline-utils` (`isFollowupDue`)
- `markContacted` (writes `nextFollowup_at`)
- DB trigger `20261024120001` (first-follow-up notification)

No duplicated arithmetic remains. The 24 h clock is unreachable (dead code); the 5-business-day clock is replaced.
