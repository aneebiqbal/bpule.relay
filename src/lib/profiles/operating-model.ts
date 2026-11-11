import { createServerSupabase } from '@/lib/supabase/server'
import type { DbClient } from '@/lib/db/types'
import { currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { personNameFromProfile } from '@/lib/profiles/person-name'

/**
 * The canonical profile operating model — ONE person, MANY channels.
 *
 * A `profiles` row is a sender account. `person_id` groups the accounts that
 * belong to one human, so the directory, the profile page, Rep Home, the
 * switcher and the selectors all read this one shape instead of reconstructing
 * the person/channel relationship independently.
 *
 * Knowledge (CV, experience, projects, proof, claims, voice) is shared by the
 * person. Execution (targets, today, coverage) is per channel.
 */

export interface ProfileChannelModel {
  /** The channel's own profile row — a child of the person. */
  profileId: string
  channel: string
  identityId: string
  identityName: string
  title: string | null
  url: string | null
  primaryRepId: string | null
  primaryRepName: string | null
  backups: Array<{ repId: string; repName: string; priority: number }>
  /** Active, executable contributors. They share this channel's one plan. */
  operators: Array<{ repId: string; repName: string; priority: number }>
  activeCoverage: Array<{ coveringRepId: string; coveringRepName: string; reason: string | null }>
  readiness: Array<{ repId: string; repName: string; ready: boolean }>
  targets: Array<{
    targetId: string | null
    activityType: string
    targetCount: number
    completedCount: number
    remaining: number
    status: string | null
  }>
  today: { completed: number; target: number; remaining: number }
  /** Per-operator contribution today; more than one entry means a shared requirement. */
  contributions: Array<{ repId: string; repName: string; completedCount: number }>
}

export interface ProfileKnowledgeModel {
  headline: string | null
  summary: string | null
  currentRole: string | null
  skills: string[]
  technologies: string[]
  industries: string[]
  experience: Array<{
    role: string | null
    company: string | null
    startDate: string | null
    endDate: string | null
    current: boolean
  }>
  projects: Array<{
    title: string | null
    role: string | null
    description: string | null
    skills: string[]
    technologies: string[]
    clientCompany: string | null
  }>
  proof: Array<{ capability: string | null; claim: string | null; reference: string | null; verified: boolean }>
  reviews: Array<{ text: string | null; reviewer: string | null; company: string | null }>
  claims: Array<{ key: string; value: string }>
  sources: Array<{ filename: string | null; uploadedAt: string | null }>
  voice: Record<string, unknown> | null
}

export interface ProfileHistoryEntry {
  kind: 'assignment' | 'coverage' | 'profile' | 'enrichment' | 'merge' | 'task'
  at: string
  detail: string
}

export interface ProfileOperatingModel {
  personId: string
  personName: string
  headline: string | null
  summary: string | null
  skills: string[]
  channels: ProfileChannelModel[]
  knowledge: ProfileKnowledgeModel
  history: ProfileHistoryEntry[]
  businessDate: string
  /** Chain reps who have not confirmed access — the only readiness surface. */
  readinessExceptions: Array<{ repId: string; repName: string }>
  /** Channels with no primary or no eligible backup. */
  coverageExceptions: Array<{ channel: string; identityId: string; reason: string }>
  /** Open assigned work across the person's channels. */
  tasks: Array<{
    id: string
    title: string
    status: string
    priority: string
    dueAt: string | null
    assigneeName: string | null
    kind: string
    channel: string | null
  }>
}

const EMPTY_KNOWLEDGE: ProfileKnowledgeModel = {
  headline: null,
  summary: null,
  currentRole: null,
  skills: [],
  technologies: [],
  industries: [],
  experience: [],
  projects: [],
  proof: [],
  reviews: [],
  claims: [],
  sources: [],
  voice: null,
}

type ProfileRow = {
  id: string
  display_name: string | null
  full_name: string | null
  label: string | null
  person_id: string | null
  headline: string | null
  professional_summary: string | null
  current_role: string | null
  primary_skills: unknown
  technologies: unknown
  industries: unknown
}

function personNameOf(profile: Pick<ProfileRow, 'display_name' | 'full_name' | 'label'>): string {
  return personNameFromProfile(profile)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : []
}

/**
 * Load one person's operating model. `personKey` is the canonical profile id
 * (the value every child points at via `person_id`).
 */
export async function loadProfileOperatingModel(
  orgId: string,
  personKey: string,
): Promise<ProfileOperatingModel | null> {
  const supabase = await createServerSupabase()
  const policy = await loadOperatingPolicy(orgId)
  const businessDate = orgDate(currentInstant(), policy.timezone)

  const profiles = await loadPersonProfiles(supabase, orgId, personKey)
  if (profiles.length === 0) return null

  const canonical = profiles.find((profile) => profile.person_id === null) ?? profiles[0]
  const personName = personNameOf(canonical)
  const profileIds = profiles.map((profile) => profile.id)

  const [
    identitiesRes,
    coverageRes,
    activeCoverageRes,
    readinessRes,
    accountabilityRes,
    experienceRes,
    projectRes,
    proofRes,
    reviewRes,
    claimRes,
    sourceRes,
    voiceRes,
    enrichmentRes,
    mergeRes,
    taskRes,
  ] = await Promise.all([
    supabase
      .from('revenue_identities')
      .select('id, profile_id, channel, identity_name, title, profile_url')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(50),
    supabase
      .from('profile_coverage')
      .select('profile_id, rep_id, role, priority, active')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .eq('active', true)
      .limit(50),
    supabase
      .from('coverage_assignments')
      .select('profile_id, covering_rep_id, reason, status')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .eq('status', 'ACTIVE')
      .limit(50),
    supabase
      .from('profile_readiness')
      .select('profile_id, rep_id')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(200),
    supabase
      .from('daily_accountability')
      .select('revenue_identity_id, rep_id, activity_type, completed_count, status')
      .eq('organization_id', orgId)
      .eq('target_date', businessDate)
      .limit(200),
    supabase
      .from('profile_experience')
      .select('profile_id, role, company, start_date, end_date, is_current')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(100),
    supabase
      .from('portfolio_projects')
      .select('profile_id, project_title, my_role, description, skills, technologies, client_company')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(100),
    supabase
      .from('proof_cards')
      .select('profile_id, capability, safe_claim, source_reference, verified')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(100),
    supabase
      .from('profile_reviews')
      .select('profile_id, review_text, reviewer_name, reviewer_company')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(100),
    supabase
      .from('profile_claims')
      .select('profile_id, claim_key, claim_value')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(200),
    supabase
      .from('profile_sources')
      .select('profile_id, original_filename, uploaded_at')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(50),
    supabase
      .from('voice_profiles')
      .select('profile_id, style_card')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .limit(10),
    supabase
      .from('profile_enrichment_runs')
      .select('profile_id, status, created_at, applied_at')
      .eq('organization_id', orgId)
      .in('profile_id', profileIds)
      .order('created_at', { ascending: false })
      .limit(20),
    profileIds.length > 0
      ? supabase
          .from('profile_merge_log')
          .select('source_profile_id, target_profile_id, created_at')
          .eq('organization_id', orgId)
          .or(`source_profile_id.in.(${profileIds.join(',')}),target_profile_id.in.(${profileIds.join(',')})`)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    profileIds.length > 0
      ? supabase
          .from('assigned_tasks')
          .select('id, profile_id, title, status, priority, due_at, assignee_rep_id, kind')
          .eq('organization_id', orgId)
          .in('profile_id', profileIds)
          .in('status', ['OPEN', 'IN_PROGRESS', 'WAITING'])
          .order('due_at', { ascending: true, nullsFirst: false })
          .limit(100)
      : Promise.resolve({
          data: [] as Array<{
            id: string
            profile_id: string | null
            title: string
            status: string
            priority: string
            due_at: string | null
            assignee_rep_id: string | null
            kind: string
          }>,
        }),
  ])

  const identities = (identitiesRes.data ?? []) as Array<{
    id: string
    profile_id: string | null
    channel: string
    identity_name: string
    title: string | null
    profile_url: string | null
  }>
  const identityIds = identities.map((identity) => identity.id)

  // Assignments and targets are keyed by identity, so they read after the
  // identity list is known.
  const [assignmentRes, targetRes] = await Promise.all([
    identityIds.length > 0
      ? supabase
          .from('identity_assignments')
          .select('revenue_identity_id, rep_id, created_at')
          .eq('organization_id', orgId)
          .in('revenue_identity_id', identityIds)
          .limit(200)
      : Promise.resolve({ data: [] as Array<{ revenue_identity_id: string; rep_id: string; created_at: string }> }),
    identityIds.length > 0
      ? supabase
          .from('daily_target_plans')
          .select('id, revenue_identity_id, activity_type, target_count, targetable')
          .eq('organization_id', orgId)
          .in('revenue_identity_id', identityIds)
          .eq('active', true)
          .limit(200)
      : Promise.resolve({
          data: [] as Array<{ id: string; revenue_identity_id: string; activity_type: string; target_count: number; targetable: boolean }>,
        }),
  ])

  const assignments = (assignmentRes.data ?? []) as Array<{
    revenue_identity_id: string
    rep_id: string
    created_at: string
  }>
  const targets = (targetRes.data ?? []) as Array<{
    id: string
    revenue_identity_id: string
    activity_type: string
    target_count: number
    targetable: boolean
  }>
  const accountability = (accountabilityRes.data ?? []) as Array<{
    revenue_identity_id: string
    rep_id: string
    activity_type: string
    completed_count: number
    status: string | null
  }>
  const coverage = (coverageRes.data ?? []) as Array<{
    profile_id: string
    rep_id: string
    role: string
    priority: number
    active: boolean
  }>
  const activeCoverage = (activeCoverageRes.data ?? []) as Array<{
    profile_id: string
    covering_rep_id: string
    reason: string | null
    status: string
  }>
  const readiness = (readinessRes.data ?? []) as Array<{ profile_id: string; rep_id: string }>

  const repIds = [
    ...new Set([
      ...assignments.map((row) => row.rep_id),
      ...coverage.map((row) => row.rep_id),
      ...activeCoverage.map((row) => row.covering_rep_id),
      ...readiness.map((row) => row.rep_id),
    ]),
  ].filter(Boolean)
  const { data: repRows } = repIds.length > 0
    ? await supabase.from('reps').select('id, name').eq('organization_id', orgId).in('id', repIds).limit(200)
    : { data: [] as Array<{ id: string; name: string }> }
  const repNameById = new Map(((repRows ?? []) as Array<{ id: string; name: string }>).map((rep) => [rep.id, rep.name]))

  const contributionsByIdentity = new Map<string, Map<string, number>>()
  for (const row of accountability) {
    const byRep = contributionsByIdentity.get(row.revenue_identity_id) ?? new Map<string, number>()
    byRep.set(row.rep_id, (byRep.get(row.rep_id) ?? 0) + row.completed_count)
    contributionsByIdentity.set(row.revenue_identity_id, byRep)
  }

  const channels: ProfileChannelModel[] = identities.map((identity) => {
    const identityId = identity.id
    const channelProfileId = identity.profile_id ?? personKey
    const chain = coverage.filter((row) => row.profile_id === channelProfileId)
    const primary = chain.find((row) => row.role === 'PRIMARY')
    const backups = chain
      .filter((row) => row.role === 'BACKUP')
      .sort((a, b) => a.priority - b.priority)
      .map((row) => ({
        repId: row.rep_id,
        repName: repNameById.get(row.rep_id) ?? 'Unknown',
        priority: row.priority,
      }))
    const operators = chain
      .filter((row) => row.role === 'OPERATOR')
      .sort((a, b) => a.priority - b.priority)
      .map((row) => ({
        repId: row.rep_id,
        repName: repNameById.get(row.rep_id) ?? 'Unknown',
        priority: row.priority,
      }))
    const channelTargets = targets
      .filter((row) => row.revenue_identity_id === identityId && row.targetable)
      .map((row) => {
        const accountabilityRow = accountability.find(
          (entry) =>
            entry.revenue_identity_id === identityId && entry.activity_type === row.activity_type,
        )
        const targetCount = row.target_count
        const completedCount = accountabilityRow?.completed_count ?? 0
        return {
          targetId: row.id,
          activityType: row.activity_type,
          targetCount,
          completedCount,
          remaining: Math.max(0, targetCount - completedCount),
          status: accountabilityRow?.status ?? null,
        }
      })
    const chainRepIds = chain.map((row) => row.rep_id)
    return {
      profileId: channelProfileId,
      channel: identity.channel,
      identityId,
      identityName: identity.identity_name,
      title: identity.title,
      url: identity.profile_url,
      primaryRepId: primary?.rep_id ?? null,
      primaryRepName: primary ? repNameById.get(primary.rep_id) ?? 'Unknown' : null,
      backups,
      operators,
      activeCoverage: activeCoverage
        .filter((row) => row.profile_id === channelProfileId)
        .map((row) => ({
          coveringRepId: row.covering_rep_id,
          coveringRepName: repNameById.get(row.covering_rep_id) ?? 'Unknown',
          reason: row.reason,
        })),
      readiness: chainRepIds.map((repId) => ({
        repId,
        repName: repNameById.get(repId) ?? 'Unknown',
        ready: readiness.some((row) => row.profile_id === channelProfileId && row.rep_id === repId),
      })),
      targets: channelTargets,
      today: {
        completed: channelTargets.reduce((sum, target) => sum + target.completedCount, 0),
        target: channelTargets.reduce((sum, target) => sum + target.targetCount, 0),
        remaining: channelTargets.reduce((sum, target) => sum + target.remaining, 0),
      },
      contributions: [...(contributionsByIdentity.get(identityId) ?? new Map()).entries()]
        .map(([repId, completedCount]) => ({
          repId,
          repName: repNameById.get(repId) ?? 'Unknown',
          completedCount,
        }))
        .sort((a, b) => b.completedCount - a.completedCount),
    }
  })

  const knowledge: ProfileKnowledgeModel = {
    headline: canonical.headline,
    summary: canonical.professional_summary,
    currentRole: canonical.current_role,
    skills: stringArray(canonical.primary_skills),
    technologies: stringArray(canonical.technologies),
    industries: stringArray(canonical.industries),
    experience: ((experienceRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      role: (row.role as string | null) ?? null,
      company: (row.company as string | null) ?? null,
      startDate: (row.start_date as string | null) ?? null,
      endDate: (row.end_date as string | null) ?? null,
      current: Boolean(row.is_current),
    })),
    projects: ((projectRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      title: (row.project_title as string | null) ?? null,
      role: (row.my_role as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      skills: stringArray(row.skills),
      technologies: stringArray(row.technologies),
      clientCompany: (row.client_company as string | null) ?? null,
    })),
    proof: ((proofRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      capability: (row.capability as string | null) ?? null,
      claim: (row.safe_claim as string | null) ?? null,
      reference: (row.source_reference as string | null) ?? null,
      verified: Boolean(row.verified),
    })),
    reviews: ((reviewRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      text: (row.review_text as string | null) ?? null,
      reviewer: (row.reviewer_name as string | null) ?? null,
      company: (row.reviewer_company as string | null) ?? null,
    })),
    claims: ((claimRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      key: row.claim_key as string,
      value: row.claim_value as string,
    })),
    sources: ((sourceRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      filename: (row.original_filename as string | null) ?? null,
      uploadedAt: (row.uploaded_at as string | null) ?? null,
    })),
    voice: ((voiceRes.data ?? [])[0]?.style_card as Record<string, unknown> | null) ?? null,
  }

  const history: ProfileHistoryEntry[] = [
    ...assignments.map((row) => ({
      kind: 'assignment' as const,
      at: row.created_at ?? '',
      detail: `Assigned to ${repNameById.get(row.rep_id) ?? 'Unknown'}`,
    })),
    ...activeCoverage.map((row) => ({
      kind: 'coverage' as const,
      at: '',
      detail: `Active cover by ${repNameById.get(row.covering_rep_id) ?? 'Unknown'}`,
    })),
    ...((enrichmentRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      kind: 'enrichment' as const,
      at: (row.applied_at as string | null) ?? (row.created_at as string | null) ?? '',
      detail: `Enrichment ${row.status as string}`,
    })),
    ...((mergeRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      kind: 'merge' as const,
      at: (row.created_at as string) ?? '',
      detail: 'Profile merge',
    })),
  ]
    .filter((entry) => entry.at)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30)

  // One row per person: the same rep covering two channels is one exception.
  const readinessExceptions = [
    ...new Map(
      channels
        .flatMap((channel) =>
          channel.readiness
            .filter((entry) => !entry.ready)
            .map((entry) => ({ repId: entry.repId, repName: entry.repName, channel: channel.channel })),
        )
        .map((entry) => [entry.repId, entry]),
    ).values(),
  ]

  const coverageExceptions = channels
    .filter((channel) => !channel.primaryRepId)
    .map((channel) => ({
      channel: channel.channel,
      identityId: channel.identityId,
      reason: 'No primary rep',
    }))

  return {
    personId: personKey,
    personName,
    headline: knowledge.headline,
    summary: knowledge.summary,
    skills: knowledge.skills,
    channels,
    knowledge,
    history,
    businessDate,
    readinessExceptions,
    coverageExceptions,
    tasks: ((taskRes.data ?? []) as Array<{
      id: string
      profile_id: string | null
      title: string
      status: string
      priority: string
      due_at: string | null
      assignee_rep_id: string | null
      kind: string
    }>).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueAt: task.due_at,
      assigneeName: task.assignee_rep_id ? repNameById.get(task.assignee_rep_id) ?? 'Unknown' : null,
      kind: task.kind,
      channel: task.profile_id
        ? (identities.find((identity) => identity.profile_id === task.profile_id)?.channel ?? null)
        : null,
    })),
  }
}

/** Every profile row for one person: the canonical row plus its children. */
async function loadPersonProfiles(
  supabase: DbClient,
  orgId: string,
  personKey: string,
): Promise<ProfileRow[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, full_name, label, person_id, headline, professional_summary, current_role, primary_skills, technologies, industries')
    .eq('organization_id', orgId)
    .or(`id.eq.${personKey},person_id.eq.${personKey}`)
    .limit(50)
  return (data ?? []) as ProfileRow[]
}


