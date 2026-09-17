import type {
  RelayRun,
  NextAction,
  Lead,
  ConversationState,
} from '@/lib/domain/types'
import { calculateContactWindow } from '@/lib/relay/timing-engine'
import type { TimingOutput } from '@/lib/relay/timing-engine'

export interface NextActionContext {
  run: RelayRun
  lead: Lead | null
  conversationState: ConversationState | null
  followupCount: number
  followupLimitReached: boolean
  hasOutboundMessage: boolean
  hasReply: boolean
  identityAssigned: boolean
  proofMatched: boolean
}

/**
 * Deterministic Next Action projection.
 *
 * Answers: "What should happen next for this run?"
 * Uses only current domain state + run status. No AI.
 */
export function projectNextAction(ctx: NextActionContext): NextAction | null {
  const { run, lead, followupCount, followupLimitReached, hasReply, identityAssigned, proofMatched } = ctx

  if (!lead) {
    return {
      actionType: 'NO_LEAD',
      priority: 'low',
      reason: 'No lead associated with this run.',
      executionPolicy: 'MANUAL',
      entityType: 'lead',
      entityId: '',
      blockedReason: 'Lead not found.',
    }
  }

  switch (run.status) {
    case 'detected':
    case 'qualifying':
      return {
        actionType: 'QUALIFY_LEAD',
        priority: 'medium',
        reason: `Lead "${lead.company}" was detected and needs qualification.`,
        executionPolicy: 'AUTO',
        entityType: 'lead',
        entityId: lead.id,
        blockedReason: null,
      }

    case 'qualified':
    case 'routing':
      if (!identityAssigned) {
        return {
          actionType: 'ASSIGN_IDENTITY',
          priority: 'high',
          reason: `Lead "${lead.company}" is qualified but has no revenue identity assigned.`,
          executionPolicy: 'REVIEW_REQUIRED',
          entityType: 'lead',
          entityId: lead.id,
          blockedReason: null,
        }
      }
      return {
        actionType: 'PREPARE_OUTREACH',
        priority: 'high',
        reason: `Lead "${lead.company}" is qualified. Outreach can be prepared.`,
        executionPolicy: 'AUTO',
        entityType: 'lead',
        entityId: lead.id,
        blockedReason: null,
      }

    case 'preparing':
      return {
        actionType: 'PREPARE_OUTREACH',
        priority: 'high',
        reason: `Outreach is being prepared for "${lead.company}".`,
        executionPolicy: 'AUTO',
        entityType: 'lead',
        entityId: lead.id,
        blockedReason: null,
      }

    case 'awaiting_human':
      return {
        actionType: 'SEND_OUTREACH',
        priority: 'urgent',
        reason: `Outreach prepared for "${lead.company}". Awaiting human approval to send.`,
        executionPolicy: 'REVIEW_REQUIRED',
        entityType: 'lead',
        entityId: lead.id,
        blockedReason: null,
      }

    case 'action_recorded':
    case 'waiting':
      if (hasReply) {
        return {
          actionType: 'REPLY_NEEDED',
          priority: 'urgent',
          reason: `Client replied to outreach for "${lead.company}". Response needed.`,
          executionPolicy: 'REVIEW_REQUIRED',
          entityType: 'lead',
          entityId: lead.id,
          blockedReason: null,
        }
      }
      if (!proofMatched && identityAssigned) {
        return {
          actionType: 'MATCH_PROOF',
          priority: 'medium',
          reason: `No proof matched yet for "${lead.company}". Consider adding relevant proof.`,
          executionPolicy: 'AUTO',
          entityType: 'lead',
          entityId: lead.id,
          blockedReason: null,
        }
      }
      return {
        actionType: 'WAIT',
        priority: 'low',
        reason: `Waiting for client response from "${lead.company}".`,
        executionPolicy: 'AUTO',
        entityType: 'lead',
        entityId: lead.id,
        blockedReason: null,
      }

    case 'followup_due':
      if (followupLimitReached) {
        return {
          actionType: 'NO_FURTHER_FOLLOWUP',
          priority: 'low',
          reason: `Follow-up limit reached for "${lead.company}". No further follow-up allowed.`,
          executionPolicy: 'AUTO',
          entityType: 'lead',
          entityId: lead.id,
          blockedReason: 'Permanent follow-up limit reached.',
        }
      }
      return {
        actionType: 'PREPARE_FOLLOWUP',
        priority: 'high',
        reason: `Follow-up is due for "${lead.company}" (${followupCount} previous follow-ups).`,
        executionPolicy: 'AUTO',
        entityType: 'lead',
        entityId: lead.id,
        blockedReason: null,
      }

    case 'followup_preparing':
      return {
        actionType: 'SEND_FOLLOWUP',
        priority: 'urgent',
        reason: `Follow-up prepared for "${lead.company}". Awaiting human approval to send.`,
        executionPolicy: 'REVIEW_REQUIRED',
        entityType: 'lead',
        entityId: lead.id,
        blockedReason: null,
      }

    case 'response_received':
      return {
        actionType: 'REPLY_NEEDED',
        priority: 'urgent',
        reason: `Client responded to "${lead.company}". Reply needed.`,
        executionPolicy: 'REVIEW_REQUIRED',
        entityType: 'lead',
        entityId: lead.id,
        blockedReason: null,
      }

    case 'conversation':
      return {
        actionType: 'CONTINUE_CONVERSATION',
        priority: 'medium',
        reason: `Active conversation with "${lead.company}". Continue engaging.`,
        executionPolicy: 'REVIEW_REQUIRED',
        entityType: 'lead',
        entityId: lead.id,
        blockedReason: null,
      }

    case 'completed':
    case 'rejected':
    case 'cancelled':
    case 'failed':
      return null

    default:
      return null
  }
}

/**
 * Projects next actions for all active runs for a given lead.
 */
export function projectNextActionForLead(
  runs: RelayRun[],
  lead: Lead,
  conversationState: ConversationState | null,
  followupCount: number,
  followupLimitReached: boolean,
): NextAction[] {
  const hasOutboundMessage = lead.status !== 'new'
  const hasReply = lead.status === 'replied'
  const identityAssigned = !!lead.senderProfileId || !!lead.ownerRepId

  const actions: NextAction[] = []
  for (const run of runs) {
    const action = projectNextAction({
      run,
      lead,
      conversationState,
      followupCount,
      followupLimitReached,
      hasOutboundMessage,
      hasReply,
      identityAssigned,
      proofMatched: false,
    })
    if (action) actions.push(action)
  }

  // If no active runs and lead is qualified but not contacted, suggest starting one
  // Use canonicalScore (0-100); fall back to legacy score (0-12) converted
  const leadScore = lead.canonicalScore ?? (lead.score != null ? lead.score * (100 / 12) : null)
  if (actions.length === 0 && lead.status === 'new' && leadScore !== null && leadScore >= 70) {
    actions.push({
      actionType: 'START_OUTBOUND',
      priority: leadScore >= 70 ? 'high' : 'medium',
      reason: `Qualified lead "${lead.company}" (score: ${leadScore}/100) has no active outbound run.`,
      executionPolicy: 'AUTO',
      entityType: 'lead',
      entityId: lead.id,
      blockedReason: null,
    })
  }

  return actions
}

export interface NextActionWithTiming extends NextAction {
  timing: TimingOutput | null
}

export function projectNextActionWithTiming(
  ctx: NextActionContext & {
    prospectTimezone?: string | null
    repTimezone?: string
  },
): NextActionWithTiming | null {
  const { prospectTimezone, repTimezone, ...baseCtx } = ctx
  const action = projectNextAction(baseCtx)

  if (!action || !baseCtx.lead) {
    return action ? { ...action, timing: null } : null
  }

  const timing = calculateContactWindow({
    channel: (baseCtx.lead.direction === 'inbound' ? 'dm' : 'dm') as 'dm',
    prospectTimezone: prospectTimezone ?? null,
    repTimezone: repTimezone ?? 'UTC',
    lastMeaningfulActionAt: baseCtx.lead.createdAt,
    conversationStage: baseCtx.conversationState?.stage ?? 'new',
    connectionAccepted: false,
    replyReceived: baseCtx.hasReply,
    followupCount: ctx.followupCount,
    workingDay: true,
    workingHoursStart: 9,
    workingHoursEnd: 17,
    lastReplyAt: ctx.hasReply ? baseCtx.lead.createdAt : null,
    lastFollowupAt: ctx.followupLimitReached ? baseCtx.lead.createdAt : null,
  })

  return { ...action, timing }
}
