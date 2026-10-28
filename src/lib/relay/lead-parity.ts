import type { LeadDetail } from '@/lib/store/types'
import type { ScoutStore } from '@/lib/store/types'
import { buildThread } from '@/lib/conversation/thread'
import { getLeadDisplayScore } from '@/lib/scoring/display-score'
import { qualifyCanonicalScore } from '@/lib/scoring/qualification'
import { deriveNextLeadAction, LEAD_ACTION_META, type LeadAction } from './lead-state-machine'
import {
  deriveConversationPresence,
  deriveRelationshipDisplayState,
  type ConversationPresence,
  type RelationshipDisplayState,
} from './conversation-presence'
import { derivePipelineStage, type LeadRow, type PipelineStage } from '@/components/leads/pipeline-utils'
import { recordParityViolations } from './contract-violations'
import { findDuplicateOpeningTurns } from '@/lib/conversation/canonical-message'
import { recordContractViolation } from './contract-violations'

/**
 * Cross-surface parity for one lead.
 *
 * Today, Leads, Conversation, Archive, My Numbers and the follow-up surfaces all
 * read this lead. They must not disagree. This computes every surface's view from
 * the same canonical state and reports any divergence, so a regression in one
 * surface is caught without a browser.
 */

export interface LeadParityReport {
  leadId: string
  canonicalScore: number | null
  displayScore: number | null
  displayText: string
  qualification: string | null
  action: LeadAction
  actionLabel: string
  requiresAction: boolean
  pipelineStage: PipelineStage
  relationshipDisplay: RelationshipDisplayState
  relationshipLabel: string
  conversationPresence: ConversationPresence
  messageCount: number
  threadTurnCount: number
  followUpDue: boolean
  consistent: boolean
  divergences: string[]
}

/** Pipeline columns that legitimately correspond to each display state. */
const STAGE_FOR_DISPLAY: Record<RelationshipDisplayState, PipelineStage[]> = {
  TO_CONTACT: ['to_contact'],
  WAITING_ON_CONNECTION: ['waiting'],
  SEND_FIRST_MESSAGE: ['to_contact'],
  WAITING_ON_CLIENT: ['waiting'],
  NEEDS_REPLY: ['needs_reply'],
  FOLLOW_UP_DUE: ['follow_up_due'],
  CONNECTED: ['done'],
  CLOSED: ['done', 'cold'],
  REVIEW: ['observe', 'to_contact'],
}

/**
 * The board (Leads) reads denormalized `lastOutboundAt` / `lastInboundAt`
 * columns; the lead detail reads `messages`. Derive the board's view from the
 * same canonical messages so the parity check compares one truth, not two
 * columns that could drift.
 */
function toBoardLead(lead: LeadDetail): LeadRow {
  const messages = lead.messages ?? []
  const lastOutboundAt =
    messages.filter((m) => m.direction !== 'inbound' && m.sentAt).map((m) => m.sentAt as string).sort().at(-1) ?? null
  const lastInboundAt =
    messages.filter((m) => m.direction === 'inbound' && m.sentAt).map((m) => m.sentAt as string).sort().at(-1) ?? null
  const hasDmSent = messages.some((m) => m.type === 'dm' && m.direction !== 'inbound' && Boolean(m.sentText))
  return { ...lead, lastOutboundAt, lastInboundAt, hasDmSent } as LeadRow
}

export function buildLeadParityReport(lead: LeadDetail, now: number = Date.now()): LeadParityReport {
  const display = getLeadDisplayScore(lead)
  const action = deriveNextLeadAction(lead, now)
  const relationship = deriveRelationshipDisplayState(lead, now)
  const presence = deriveConversationPresence(lead)
  const stage = derivePipelineStage(toBoardLead(lead))
  const thread = buildThread(lead)
  const divergences: string[] = []

  // 1. Score: the number, its /10 text and the qualification come from one score.
  if (display.canonical != null) {
    const band = qualifyCanonicalScore(display.canonical)
    if (display.qualification !== band.qualification) {
      divergences.push(`score qualification "${display.qualification}" != band "${band.qualification}"`)
    }
    if (display.text !== `${display.value}/10`) {
      divergences.push(`score text "${display.text}" does not match its /10 value`)
    }
  }

  // 2. The board column and the lead-detail state must describe the same moment.
  if (!STAGE_FOR_DISPLAY[relationship.display].includes(stage)) {
    divergences.push(`pipeline stage "${stage}" vs relationship display "${relationship.display}"`)
  }

  // 3. Conversation presence must match the thread the other surfaces read.
  if (presence === 'NO_MESSAGES' && thread.length > 0) {
    divergences.push(`presence is NO_MESSAGES but the thread has ${thread.length} turn(s)`)
  }
  if (presence !== 'NO_MESSAGES' && thread.length === 0) {
    divergences.push(`presence is ${presence} but the thread is empty`)
  }

  // 4. The action label must be the canonical one. SEND_REPLY and WAIT_REPLY are
  // contextual by design ("Reply to Sarah", "Waiting for client"), so they are
  // excluded — everything else must use the canonical string.
  const CONTEXTUAL_LABEL_ACTIONS: ReadonlySet<LeadAction> = new Set(['SEND_REPLY', 'WAIT_REPLY'])
  if (!CONTEXTUAL_LABEL_ACTIONS.has(action.action)) {
    const canonicalLabel = LEAD_ACTION_META[action.action].primaryLabel
    if (action.primaryLabel !== canonicalLabel) {
      divergences.push(`action label "${action.primaryLabel}" is not the canonical "${canonicalLabel}" for ${action.action}`)
    }
  }

  // 5. The opening message must appear once (Contract 11). Telemetry only: a
  // duplicate means the canonical row and the lead-level fallback both rendered.
  for (const duplicate of findDuplicateOpeningTurns(thread)) {
    recordContractViolation({
      kind: 'DUPLICATE_OPENING_MESSAGE',
      leadId: lead.id,
      contractId: 11,
      surface: 'lead_parity',
      fields: ['inboundMessage'],
      detail: `the opening message rendered ${duplicate.ids.length} times (${duplicate.ids.join(', ')})`,
    })
  }

  return {
    leadId: lead.id,
    canonicalScore: display.canonical,
    displayScore: display.value,
    displayText: display.text,
    qualification: display.qualification,
    action: action.action,
    actionLabel: action.primaryLabel,
    requiresAction: action.requiresAction,
    pipelineStage: stage,
    relationshipDisplay: relationship.display,
    relationshipLabel: relationship.label,
    conversationPresence: presence,
    messageCount: (lead.messages ?? []).length,
    threadTurnCount: thread.length,
    followUpDue: action.followupDue,
    consistent: divergences.length === 0,
    divergences,
  }
}

/**
 * Parity plus telemetry: the same report, with every divergence recorded as a
 * contract violation. Use this on QA/admin inspection paths.
 */
export function buildLeadParityReportWithViolations(lead: LeadDetail, now: number = Date.now()): LeadParityReport {
  const report = buildLeadParityReport(lead, now)
  if (!report.consistent) recordParityViolations(lead.id, report.divergences)
  return report
}

/** Same as buildLeadParityReport, but throws when the surfaces disagree. */
export function assertLeadParity(lead: LeadDetail, now?: number): LeadParityReport {
  const report = buildLeadParityReport(lead, now)
  if (!report.consistent) {
    throw new Error(`Lead parity failed for ${lead.id}: ${report.divergences.join('; ')}`)
  }
  return report
}

/** DB-backed variant: load the lead once, then assert parity across surfaces. */
export async function assertLeadParityById(
  store: ScoutStore,
  leadId: string,
  now?: number,
): Promise<LeadParityReport> {
  const lead = await store.getLead(leadId)
  if (!lead) throw new Error(`Lead not found: ${leadId}`)
  return assertLeadParity(lead, now)
}
