export const ACTIVITY_LABEL: Record<string, string> = {
  connection_request: 'connection notes',
  dm: 'DMs',
  email: 'emails',
  followup: 'follow-ups',
  application: 'applications',
  proposal: 'proposals',
  prospect_extracted: 'prospects',
  other: 'actions',
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  followed_up: 'Follow-up',
  replied: 'Replied',
}

const OPEN_LEAD_LIMIT = 4

export type TeamLiveIdentity = { name: string; title: string | null; channel: string }

export type TeamLiveGoal = {
  activityType: string
  label: string
  target: number
  completed: number
  remaining: number
  identityId: string
}

export type TeamLiveLead = {
  id: string
  company: string
  contactName: string | null
  status: string
  statusLabel: string
  score: number | null
}

export type TeamLivePerson = {
  repId: string
  repName: string
  role: string
  identities: TeamLiveIdentity[]
  goals: TeamLiveGoal[]
  openLeads: TeamLiveLead[]
  openLeadCount: number
  outreachSent: number
  repliesHandled: number
  leadsSaved: number
  extractionsCount: number
  extractionFailures: number
  totalTarget: number
  totalCompleted: number
  totalRemaining: number
  lastActivityAt: string | null
  identityCount: number
}

export type TeamLivePayload = { date: string; people: TeamLivePerson[] }

type RepRow = { id: string; name: string; role: string }
type IdentityRow = { id: string; identity_name: string; channel: string; title: string | null }
type AssignmentRow = { revenue_identity_id?: string | null; identity_id?: string | null; rep_id: string }
type TargetRow = { rep_id: string; revenue_identity_id: string; activity_type: string; target_count: number }
type AccountabilityRow = { rep_id: string; revenue_identity_id: string; activity_type: string; completed_count: number | null }
type MessageRow = { rep_id: string | null; type: string | null; sent_at: string | null }
type LeadTodayRow = { owner_rep_id: string | null; created_at: string | null }
type ExtractionRow = { rep_id: string | null; success: boolean | null; created_at: string | null }
type OpenLeadRow = {
  id: string
  owner_rep_id: string | null
  company: string | null
  contact_name: string | null
  status: string | null
  canonical_score: number | null
  score: number | null
}

export type TeamLiveRows = {
  now: Date
  reps: RepRow[]
  identities: IdentityRow[]
  assignments: AssignmentRow[]
  targets: TargetRow[]
  accountability: AccountabilityRow[]
  messages: MessageRow[]
  leadsToday: LeadTodayRow[]
  extractions: ExtractionRow[]
  openLeads: OpenLeadRow[]
}

export function activityLabel(activityType: string): string {
  return ACTIVITY_LABEL[activityType] ?? activityType.replaceAll('_', ' ')
}

export function leadStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Open'
  return STATUS_LABEL[status] ?? status.replaceAll('_', ' ')
}

/** Assignments store revenue_identity_id. A row that only has identity_id is not a match. */
export function assignmentIdentityId(row: { revenue_identity_id?: string | null; identity_id?: string | null }): string | null {
  const id = row.revenue_identity_id
  return typeof id === 'string' && id.length > 0 ? id : null
}

export function leadScore(row: { canonical_score: number | null; score: number | null }): number | null {
  if (typeof row.canonical_score === 'number') return row.canonical_score
  if (typeof row.score === 'number') return row.score
  return null
}

export function assembleTeamLive(rows: TeamLiveRows): TeamLivePayload {
  const date = rows.now.toISOString().slice(0, 10)
  const identities = rows.identities ?? []

  const people = (rows.reps ?? []).map((rep) => {
    const seen = new Set<string>()
    const repIdentities = (rows.assignments ?? [])
      .filter((a) => a.rep_id === rep.id)
      .map((a) => assignmentIdentityId(a))
      .filter((id): id is string => {
        if (!id || seen.has(id)) return false
        seen.add(id)
        return true
      })
      .map((id) => identities.find((i) => i.id === id))
      .filter((i): i is IdentityRow => Boolean(i))

    const repTargets = (rows.targets ?? []).filter((t) => t.rep_id === rep.id)
    const repAccountability = (rows.accountability ?? []).filter((a) => a.rep_id === rep.id)

    const goals = repTargets.map((t) => {
      const done = repAccountability
        .filter((a) => a.revenue_identity_id === t.revenue_identity_id && a.activity_type === t.activity_type)
        .reduce((sum, a) => sum + (a.completed_count ?? 0), 0)
      const target = t.target_count ?? 0
      return {
        activityType: t.activity_type,
        label: activityLabel(t.activity_type),
        target,
        completed: done,
        remaining: Math.max(0, target - done),
        identityId: t.revenue_identity_id,
      }
    })

    const repMessages = (rows.messages ?? []).filter((m) => m.rep_id === rep.id)
    const outreachCount = repMessages.filter((m) => m.type !== 'reply').length
    const replyCount = repMessages.filter((m) => m.type === 'reply').length
    const savedRows = (rows.leadsToday ?? []).filter((l) => l.owner_rep_id === rep.id)
    const extractionRuns = (rows.extractions ?? []).filter((e) => e.rep_id === rep.id)

    const ownedOpen = (rows.openLeads ?? []).filter((l) => l.owner_rep_id === rep.id)
    const openLeads = ownedOpen.slice(0, OPEN_LEAD_LIMIT).map((l) => ({
      id: l.id,
      company: l.company?.trim() || 'Untitled company',
      contactName: l.contact_name?.trim() || null,
      status: l.status ?? 'new',
      statusLabel: leadStatusLabel(l.status),
      score: leadScore(l),
    }))

    const allTimestamps = [
      ...repMessages.map((m) => m.sent_at),
      ...savedRows.map((l) => l.created_at),
      ...extractionRuns.map((e) => e.created_at),
    ].filter((value): value is string => Boolean(value)).sort((a, b) => b.localeCompare(a))

    const totalTarget = goals.reduce((sum, goal) => sum + goal.target, 0)
    const totalCompleted = goals.reduce((sum, goal) => sum + goal.completed, 0)

    return {
      repId: rep.id,
      repName: rep.name,
      role: rep.role,
      identities: repIdentities.map((i) => ({
        name: i.identity_name,
        title: i.title,
        channel: i.channel,
      })),
      goals,
      openLeads,
      openLeadCount: ownedOpen.length,
      outreachSent: outreachCount,
      repliesHandled: replyCount,
      leadsSaved: savedRows.length,
      extractionsCount: extractionRuns.length,
      extractionFailures: extractionRuns.filter((e) => !e.success).length,
      totalTarget,
      totalCompleted,
      totalRemaining: Math.max(0, totalTarget - totalCompleted),
      lastActivityAt: allTimestamps[0] ?? null,
      identityCount: repIdentities.length,
    }
  })

  people.sort((a, b) => {
    const score = (person: TeamLivePerson) =>
      person.totalCompleted + person.leadsSaved + person.outreachSent + person.repliesHandled + person.extractionsCount
    const delta = score(b) - score(a)
    if (delta !== 0) return delta
    return a.repName.localeCompare(b.repName)
  })

  return { date, people }
}

export function filterTeamLive(
  payload: TeamLivePayload,
  viewer: { repId: string; canSeeTeam: boolean },
): TeamLivePayload {
  if (viewer.canSeeTeam) return payload
  return { ...payload, people: payload.people.filter((person) => person.repId === viewer.repId) }
}
