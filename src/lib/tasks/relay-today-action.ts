/**
 * The canonical "what do I do now" action shape.
 *
 * A NextBestAction is mapped into this format once, then shared by Home,
 * /tasks and the Rep 360 so every surface answers with the same object.
 */
export type ActionKind =
  | 'reply_needed'
  | 'connection_dm_due'
  | 'followup_due'
  | 'high_fit_lead'
  | 'new_opportunity'
  | 'job_worth_apply'
  | 'proposal_ready'
  | 'lead_going_cold'
  | 'content_opportunity'
  | 'admin_review'
  | 'inbound_opportunity'

export interface RelayTodayAction {
  id: string
  kind: ActionKind
  priority: 'urgent' | 'high' | 'medium' | 'low'
  title: string
  subtitle: string
  href: string
  whatHappened: string
  whyItMatters: string
  whyLines: string[]
  prepared: string | null
  humanAction: string
  createdAt: string
  fitScore: number | null
  identity: {
    id: string | null
    name: string
    title: string | null
    channel: string | null
  } | null
  proof: string | null
  inbound: boolean
}
