import type { RelayTodayAction } from '@/lib/tasks/relay-today-action'
import {
  TODAY_FOLLOWUP_KINDS,
  TODAY_REPLY_KINDS,
} from '@/lib/relay/today-counts'

export type RepWorkTab = 'today' | 'overdue' | 'upcoming' | 'completed'

export type OverdueSeverity = 'none' | 'mild' | 'attention' | 'critical'

const REPLY_SET = new Set<string>(TODAY_REPLY_KINDS)
const FOLLOWUP_SET = new Set<string>(TODAY_FOLLOWUP_KINDS)

export function leadIdFromAction(action: RelayTodayAction): string | null {
  if (action.href.includes('/leads/')) {
    const match = action.href.match(/\/leads\/([^/?]+)/)
    if (match) return match[1]
  }
  if (action.id && !action.id.includes('-')) return action.id
  const stripped = action.id.replace(/^(reply-|followup-|highfit-|opportunity-|connection-dm-)/, '')
  return stripped && stripped !== action.id ? stripped : action.id
}

export function primaryCtaLabel(action: RelayTodayAction): string {
  switch (action.humanAction) {
    case 'REPLY_NOW':
      return 'Reply'
    case 'SEND_FOLLOWUP':
      return 'Follow up'
    case 'SEND_CONNECTION':
      return 'Connect'
    case 'SEND_FIRST_DM':
      return 'Send message'
    case 'RESEARCH':
      return action.kind === 'high_fit_lead' ? 'Research' : 'Open lead'
    case 'REVIEW_REFERRAL':
      return 'Review'
    case 'APPLY_UPWORK':
      return 'Apply'
    case 'RESUME_DRAFT':
      return 'Prepare proposal'
    default:
      break
  }
  switch (action.kind) {
    case 'reply_needed':
    case 'inbound_opportunity':
      return 'Reply'
    case 'followup_due':
      return 'Follow up'
    case 'proposal_ready':
      return 'Prepare proposal'
    case 'job_worth_apply':
      return 'Apply'
    case 'high_fit_lead':
      return 'Research'
    default:
      return 'Open lead'
  }
}

export function humanWhyNow(action: RelayTodayAction): string {
  const raw = (action.whatHappened || action.whyItMatters || '').trim()
  if (raw) {
    const normalized = raw.toLowerCase()
    if (normalized.includes('positive') && normalized.includes('reply')) return 'Positive commercial reply'
    if (normalized.includes('follow-up') || normalized.includes('follow up')) return 'Follow-up due'
    if (normalized.includes('high intent') || normalized.includes('verified buyer')) return 'Verified buyer opportunity'
    if (normalized.includes('missing evidence') || normalized.includes('research')) return 'More research needed'
    if (normalized.includes('thread') && normalized.includes('review')) return 'Conversation needs review'
    return raw
  }
  if (action.kind === 'reply_needed') return 'Client replied — your turn'
  if (action.kind === 'inbound_opportunity') return 'Inbound message waiting'
  if (action.kind === 'followup_due') return 'Follow-up due'
  if (action.kind === 'connection_dm_due') return 'Send the first message'
  if (action.kind === 'high_fit_lead') return 'High-fit opportunity'
  return 'Needs your attention'
}

export function actionDeepLink(action: RelayTodayAction): string {
  const leadId = leadIdFromAction(action)
  if (
    action.humanAction === 'REPLY_NOW'
    || REPLY_SET.has(action.kind)
  ) {
    return leadId ? `/leads/${leadId}?tab=conversation` : action.href
  }
  if (action.humanAction === 'SEND_FOLLOWUP' || FOLLOWUP_SET.has(action.kind)) {
    return leadId ? `/leads/${leadId}?tab=conversation` : action.href
  }
  if (action.humanAction === 'RESEARCH' && leadId) {
    return `/leads/${leadId}`
  }
  if (leadId) return `/leads/${leadId}`
  return action.href
}

export function isHighPriorityOpportunity(action: RelayTodayAction): boolean {
  if (REPLY_SET.has(action.kind) || FOLLOWUP_SET.has(action.kind)) return false
  if (action.priority === 'urgent' || action.priority === 'high') return true
  return action.kind === 'high_fit_lead' || action.kind === 'new_opportunity'
}

export function taskCategoryLabel(action: RelayTodayAction): string {
  if (REPLY_SET.has(action.kind)) return 'Reply'
  if (FOLLOWUP_SET.has(action.kind)) return 'Follow-up'
  if (action.kind === 'high_fit_lead' || action.humanAction === 'RESEARCH') return 'Research'
  if (action.kind === 'connection_dm_due') return action.humanAction === 'SEND_CONNECTION' ? 'Connection' : 'Message'
  if (action.kind === 'proposal_ready') return 'Proposal'
  if (action.kind === 'admin_review') return 'Review'
  if (action.kind === 'job_worth_apply') return 'Admin task'
  return 'Review'
}

export function overdueSeverity(iso: string | null | undefined, now = Date.now()): OverdueSeverity {
  if (!iso) return 'none'
  const due = new Date(iso).getTime()
  if (Number.isNaN(due) || due >= now) return 'none'
  const hours = (now - due) / 3_600_000
  if (hours < 4) return 'mild'
  if (hours <= 24) return 'attention'
  return 'critical'
}

export function relativeWait(iso: string | null | undefined): string {
  if (!iso) return ''
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.round(hrs / 24)} days ago`
}

export function classifyWorkTab(action: RelayTodayAction, now = Date.now()): Exclude<RepWorkTab, 'completed'> {
  const severity = overdueSeverity(action.createdAt, now)
  if (severity !== 'none') return 'overdue'
  if (action.priority === 'urgent' || action.priority === 'high' || REPLY_SET.has(action.kind) || FOLLOWUP_SET.has(action.kind)) {
    return 'today'
  }
  return 'upcoming'
}

export function rankActions(actions: RelayTodayAction[]): RelayTodayAction[] {
  const priorityValue = (p: string) => (p === 'urgent' ? 0 : p === 'high' ? 1 : p === 'medium' ? 2 : 3)
  return [...actions].sort((a, b) => priorityValue(a.priority) - priorityValue(b.priority))
}
