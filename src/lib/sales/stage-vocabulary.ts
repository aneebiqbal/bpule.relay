/**
 * Canonical conversation-stage vocabulary — one definition for every surface.
 *
 * Relay has two stage vocabularies that answer different questions, and they
 * must not be confused:
 *
 *  1. Board / work-queue stages (`to_contact`, `needs_reply`, `waiting`,
 *     `follow_up_due`, `observe`, `done`, `cold`) — owned by
 *     `derivePipelineStage` in `components/leads/pipeline-utils.ts` and
 *     `pipelineStageSql` in `lib/store/pipeline-stage.ts`. These answer
 *     "what do I do next?".
 *  2. Conversation / CRM stages (`new`, `contacted`, `replied`, `qualifying`,
 *     `interested`, `meeting`, `proposal`, `negotiation`, `won`, `lost`) —
 *     owned by this module. These answer "how far along is this deal?".
 *
 * Before this module existed, the CRM vocabulary was re-declared in four
 * places (reports, performance, conversations, meetings) and had already
 * drifted. Import from here instead of listing stages again.
 */

export interface ConversationStageGroup {
  key: string
  label: string
  /** null = derived, not a raw conversation stage (Qualified = new leads with no send). */
  stages: readonly string[] | null
}

export const CONVERSATION_STAGE_GROUPS: ReadonlyArray<ConversationStageGroup> = [
  { key: 'qualified', label: 'Qualified', stages: null },
  { key: 'contacted', label: 'Contacted', stages: ['new', 'contacted'] },
  { key: 'conversation', label: 'Conversation', stages: ['replied', 'qualifying', 'interested'] },
  { key: 'meeting', label: 'Meeting', stages: ['meeting'] },
  { key: 'proposal', label: 'Proposal', stages: ['proposal', 'negotiation'] },
  { key: 'won', label: 'Won', stages: ['won'] },
]

/** Conversation stages at or past a booked meeting (current-state questions only). */
export const MEETING_OR_LATER_STAGES = ['meeting', 'proposal', 'negotiation'] as const

/** Meeting-or-later including won — used by furthest-stage classification. */
export const MEETING_AND_WON_STAGES = ['meeting', 'proposal', 'negotiation', 'won'] as const

export const PROPOSAL_OR_LATER_STAGES = ['proposal', 'negotiation', 'won'] as const

export const REPLY_STAGES = ['replied', 'qualifying', 'interested'] as const

/** Conversation stage → pipeline group key (used by `/chats?cstage=` drill-down). */
export function conversationStageGroup(stage: string | null | undefined): string | null {
  if (!stage) return null
  return CONVERSATION_STAGE_GROUPS.find((g) => g.stages?.includes(stage))?.key ?? null
}
