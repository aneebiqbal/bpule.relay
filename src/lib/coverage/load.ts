import { createServerSupabase } from '@/lib/supabase/server'
import type { DbClient } from '@/lib/db/types'
import type { RevenueIdentityChannel } from '@/lib/domain/types'
import { isMissingRelation } from '@/lib/operations/db-errors'
import { currentInstant, isOrgWorkingDay, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'
import { normalizeChannel } from '@/lib/profiles/assigned-profiles'
import {
  buildCoverageStatusSummary,
  DEFAULT_MAX_PROFILES_PER_REP,
  evaluateDailyCoverage,
  fallbackAvailability,
  labelForAvailability,
  type ActiveCoverageInput,
  type AvailabilityState,
  type CoverageAssignmentInput,
  type CoverageConfigInput,
  type CoverageEngineInput,
  type CoveragePlan,
  type CoverageProfileResult,
  type ProfileWorkInput,
  type RepAvailabilityInput,
  type RepWorkloadInput,
} from './engine'

/**
 * The canonical coverage loader.
 *
 * Bounded reads only: availability, profile assignments, backup
 * configuration, today's aggregates, open assigned work and canonical Inbox
 * counts. No message or task history, and no query per profile.
 */

export interface CoverageRepRow {
  repId: string
  name: string
}

export interface CoverageFacts {
  businessDate: string
  isWorkingDay: boolean
  coveragePolicy: 'AUTO_COVER' | 'APPROVAL_REQUIRED' | 'MANUAL_ONLY'
  maxProfilesPerRep: number
  reps: CoverageRepRow[]
  availability: RepAvailabilityInput[]
  profiles: Array<{ profileId: string; name: string; channels: RevenueIdentityChannel[]; identityIds: string[] }>
  assignments: CoverageAssignmentInput[]
  coverage: CoverageConfigInput[]
  activeCoverage: ActiveCoverageInput[]
  readiness: Array<{ profileId: string; repId: string }>
  workloads: RepWorkloadInput[]
  profileWork: Record<string, ProfileWorkInput>
}

const OPEN_LEAD_STATUSES = ['new', 'contacted', 'followed_up', 'replied', 'meeting', 'proposal']

function isMissing(error: { code?: string; message?: string } | null): boolean {
  return isMissingRelation(error)
}

interface PolicyRow {
  timezone: string
  coverage_policy?: string | null
  coverage_limits?: { maxProfilesPerRep?: number } | null
}

export async function loadCoverageFacts(
  orgId: string,
  options: { date?: string; client?: DbClient } = {},
): Promise<CoverageFacts> {
  const supabase = options.client ?? (await createServerSupabase())
  const policy = await loadOperatingPolicy(orgId)
  const now = currentInstant()
  const today = orgDate(now, policy.timezone)
  const businessDate = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? options.date : today
  const isWorkingDay = isOrgWorkingDay(policy, businessDate)

  const [repsRes, profilesRes, identitiesRes, assignmentsRes, coverageRes, availabilityRes, dayRes, activeCoverageRes, readinessRes, leadsRes, tasksRes, policyRes] =
    await Promise.all([
      supabase.from('reps').select('id, name').eq('organization_id', orgId).limit(2000),
      supabase.from('profiles').select('id, display_name, full_name, label').eq('organization_id', orgId).limit(2000),
      supabase.from('revenue_identities').select('id, profile_id, channel, status').eq('organization_id', orgId).eq('status', 'active').limit(4000),
      supabase.from('identity_assignments').select('rep_id, revenue_identity_id').eq('organization_id', orgId).limit(4000),
      supabase.from('profile_coverage').select('profile_id, rep_id, role, priority, active').eq('organization_id', orgId).eq('active', true).limit(4000),
      supabase.from('rep_availability').select('rep_id, state').eq('organization_id', orgId).eq('business_date', businessDate).limit(2000),
      supabase.from('rep_day').select('rep_id, check_in_at, closed_at').eq('organization_id', orgId).eq('business_date', businessDate).limit(2000),
      supabase.from('coverage_assignments').select('profile_id, primary_rep_id, covering_rep_id, effective_until').eq('organization_id', orgId).eq('status', 'ACTIVE').limit(2000),
      supabase.from('profile_readiness').select('profile_id, rep_id').eq('organization_id', orgId).limit(4000),
      supabase.from('leads').select('id, owner_rep_id, revenue_identity_id, status').eq('organization_id', orgId).eq('archived', false).in('status', [...OPEN_LEAD_STATUSES]).limit(5000),
      supabase.from('assigned_tasks').select('assignee_rep_id, profile_id, status, due_at').eq('organization_id', orgId).in('status', ['OPEN', 'IN_PROGRESS']).limit(5000),
      supabase.from('organization_operating_policy').select('timezone, coverage_policy, coverage_limits').eq('organization_id', orgId).maybeSingle(),
    ])

  if (repsRes.error && !isMissing(repsRes.error)) throw repsRes.error
  if (profilesRes.error && !isMissing(profilesRes.error)) throw profilesRes.error
  if (identitiesRes.error && !isMissing(identitiesRes.error)) throw identitiesRes.error
  if (assignmentsRes.error && !isMissing(assignmentsRes.error)) throw assignmentsRes.error

  const reps = ((repsRes.data ?? []) as Array<{ id: string; name: string }>).map((row) => ({
    repId: row.id,
    name: row.name ?? 'Unknown',
  }))
  const profiles = (profilesRes.data ?? []) as Array<{
    id: string
    display_name: string | null
    full_name: string | null
    label: string | null
  }>
  const profileNameById = new Map(
    profiles.map((profile) => [profile.id, profile.display_name ?? profile.full_name ?? profile.label ?? 'Unnamed']),
  )

  const identities = (identitiesRes.data ?? []) as Array<{
    id: string
    profile_id: string | null
    channel: string
  }>
  const identityById = new Map(identities.map((identity) => [identity.id, identity]))
  const activeIdentityIds = new Set(identities.map((identity) => identity.id))

  const profileIds = new Set(
    identities.map((identity) => identity.profile_id).filter((id): id is string => Boolean(id)),
  )

  // Availability: explicit row wins; otherwise the canonical rep_day state.
  const explicit = new Map<string, AvailabilityState>()
  for (const row of (availabilityRes.data ?? []) as Array<{ rep_id: string; state: AvailabilityState }>) {
    explicit.set(row.rep_id, row.state)
  }
  const dayByRep = new Map(
    ((dayRes.data ?? []) as Array<{ rep_id: string; check_in_at: string | null; closed_at: string | null }>).map((row) => [row.rep_id, row]),
  )
  // Availability authority: a strong explicit state (leave / offline /
  // unavailable) overrides the clock; otherwise the canonical rep_day state
  // wins, and an explicit AVAILABLE only applies when the rep has not checked
  // in. Admin coverage and the rep's own check-in/out therefore read the same
  // state instead of disagreeing.
  const STRONG_EXPLICIT: ReadonlySet<AvailabilityState> = new Set(['ON_LEAVE', 'OFFLINE', 'UNAVAILABLE'])
  const availability: RepAvailabilityInput[] = reps.map((rep) => {
    const row = dayByRep.get(rep.repId)
    const explicitState = explicit.get(rep.repId) ?? null
    if (explicitState && STRONG_EXPLICIT.has(explicitState)) {
      return { repId: rep.repId, state: explicitState }
    }
    if (row?.closed_at) return { repId: rep.repId, state: 'CHECKED_OUT' }
    if (row?.check_in_at) return { repId: rep.repId, state: 'WORKING' }
    return { repId: rep.repId, state: explicitState ?? fallbackAvailability(isWorkingDay) }
  })
  // Eligibility: an assignment grants the channels of its active identity.
  const channelsByProfileRep = new Map<string, Set<RevenueIdentityChannel>>()
  for (const row of (assignmentsRes.data ?? []) as Array<{ rep_id: string; revenue_identity_id: string }>) {
    const identity = identityById.get(row.revenue_identity_id)
    if (!identity || !identity.profile_id || !activeIdentityIds.has(identity.id)) continue
    const key = `${identity.profile_id}:${row.rep_id}`
    const set = channelsByProfileRep.get(key) ?? new Set<RevenueIdentityChannel>()
    set.add(normalizeChannel(identity.channel))
    channelsByProfileRep.set(key, set)
  }

  const assignmentsByProfile = new Map<string, CoverageAssignmentInput[]>()
  for (const [key, channels] of channelsByProfileRep) {
    const [profileId, repId] = key.split(':')
    const list = assignmentsByProfile.get(profileId) ?? []
    list.push({ profileId, repId, channels: [...channels] })
    assignmentsByProfile.set(profileId, list)
  }

  const coverage: CoverageConfigInput[] = ((coverageRes.data ?? []) as Array<{
    profile_id: string
    rep_id: string
    role: 'PRIMARY' | 'BACKUP'
    priority: number
  }>).map((row) => ({
    profileId: row.profile_id,
    repId: row.rep_id,
    role: row.role,
    priority: row.priority,
  }))

  const activeCoverage: ActiveCoverageInput[] = ((activeCoverageRes.data ?? []) as Array<{
    profile_id: string
    primary_rep_id: string
    covering_rep_id: string
    effective_until: string | null
  }>).map((row) => ({
    profileId: row.profile_id,
    primaryRepId: row.primary_rep_id,
    coveringRepId: row.covering_rep_id,
    effectiveUntil: row.effective_until,
    expired: row.effective_until != null && row.effective_until < businessDate,
  }))

  const readiness = ((readinessRes.data ?? []) as Array<{ profile_id: string; rep_id: string }>).map((row) => ({
    profileId: row.profile_id,
    repId: row.rep_id,
  }))

  // Per-profile open work: canonical Inbox waiting state + profile-bound tasks.
  const profileByIdentity = new Map<string, string>()
  for (const identity of identities) {
    if (!identity.profile_id) continue
    profileByIdentity.set(identity.id, identity.profile_id)
  }
  const profileWork: Record<string, ProfileWorkInput> = {}
  for (const profileId of profileIds) profileWork[profileId] = { replies: 0, followUps: 0, tasks: 0 }

  const tasksByProfile = new Map<string, number>()
  const tasksByRep = new Map<string, { open: number; overdue: number }>()
  for (const row of (tasksRes.data ?? []) as Array<{
    assignee_rep_id: string
    profile_id: string | null
    due_at: string | null
  }>) {
    if (row.profile_id) tasksByProfile.set(row.profile_id, (tasksByProfile.get(row.profile_id) ?? 0) + 1)
    const entry = tasksByRep.get(row.assignee_rep_id) ?? { open: 0, overdue: 0 }
    entry.open += 1
    if (row.due_at && row.due_at < now.toISOString()) entry.overdue += 1
    tasksByRep.set(row.assignee_rep_id, entry)
  }

  const openByRep = new Map<string, number>()
  const repliesByRep = new Map<string, number>()
  const followUpsByRep = new Map<string, number>()
  for (const row of (leadsRes.data ?? []) as Array<{
    owner_rep_id: string | null
    revenue_identity_id: string | null
    status: string
  }>) {
    if (row.owner_rep_id) {
      openByRep.set(row.owner_rep_id, (openByRep.get(row.owner_rep_id) ?? 0) + 1)
      if (row.status === 'replied') repliesByRep.set(row.owner_rep_id, (repliesByRep.get(row.owner_rep_id) ?? 0) + 1)
      if (row.status === 'followed_up') followUpsByRep.set(row.owner_rep_id, (followUpsByRep.get(row.owner_rep_id) ?? 0) + 1)
    }
    const profileId = row.revenue_identity_id ? profileByIdentity.get(row.revenue_identity_id) : undefined
    if (profileId && profileWork[profileId]) {
      if (row.status === 'replied') profileWork[profileId].replies += 1
      if (row.status === 'followed_up') profileWork[profileId].followUps += 1
    }
  }
  for (const [profileId, count] of tasksByProfile) {
    if (profileWork[profileId]) profileWork[profileId].tasks = count
  }

  // Workload: own assigned profiles + active coverage, then canonical counts.
  const assignedProfilesByRep = new Map<string, Set<string>>()
  for (const [key] of channelsByProfileRep) {
    const [profileId, repId] = key.split(':')
    const set = assignedProfilesByRep.get(repId) ?? new Set<string>()
    set.add(profileId)
    assignedProfilesByRep.set(repId, set)
  }
  const coverageByRep = new Map<string, number>()
  for (const row of activeCoverage) {
    coverageByRep.set(row.coveringRepId, (coverageByRep.get(row.coveringRepId) ?? 0) + 1)
  }

  const workloads: RepWorkloadInput[] = reps.map((rep) => {
    const tasks = tasksByRep.get(rep.repId)
    const owned = coverage.filter((row) => row.repId === rep.repId && row.role === 'PRIMARY').length
    return {
      repId: rep.repId,
      name: rep.name,
      assignedProfileCount: assignedProfilesByRep.get(rep.repId)?.size ?? 0,
      primaryProfileCount: owned,
      openCount: openByRep.get(rep.repId) ?? 0,
      replies: repliesByRep.get(rep.repId) ?? 0,
      followUps: followUpsByRep.get(rep.repId) ?? 0,
      overdue: tasks?.overdue ?? 0,
      activeCoverageCount: coverageByRep.get(rep.repId) ?? 0,
    }
  })

  const policyRow = (policyRes.data ?? null) as PolicyRow | null
  const coveragePolicy = (policyRow?.coverage_policy ?? 'APPROVAL_REQUIRED') as CoverageFacts['coveragePolicy']
  const maxProfilesPerRep =
    policyRow?.coverage_limits?.maxProfilesPerRep ?? DEFAULT_MAX_PROFILES_PER_REP

  return {
    businessDate,
    isWorkingDay,
    coveragePolicy,
    maxProfilesPerRep,
    reps,
    availability,
    profiles: [...profileIds].map((profileId) => ({
      profileId,
      name: profileNameById.get(profileId) ?? 'Unnamed',
      channels: [...new Set(
        identities
          .filter((identity) => identity.profile_id === profileId)
          .map((identity) => normalizeChannel(identity.channel)),
      )].sort(),
      identityIds: identities
        .filter((identity) => identity.profile_id === profileId)
        .map((identity) => identity.id),
    })),
    assignments: [...assignmentsByProfile.values()].flat(),
    coverage,
    activeCoverage,
    readiness,
    workloads,
    profileWork,
  }
}

export async function loadCoveragePlan(
  orgId: string,
  options: { date?: string; client?: DbClient } = {},
  facts?: CoverageFacts,
): Promise<CoveragePlan> {
  // Callers that already loaded facts (Admin Home, the plan API) pass them in —
  // otherwise this would read the same twelve tables twice.
  const resolved = facts ?? (await loadCoverageFacts(orgId, options))
  const input: CoverageEngineInput = {
    businessDate: resolved.businessDate,
    isWorkingDay: resolved.isWorkingDay,
    coveragePolicy: resolved.coveragePolicy,
    maxProfilesPerRep: resolved.maxProfilesPerRep,
    profiles: resolved.profiles,
    assignments: resolved.assignments,
    coverage: resolved.coverage,
    availability: resolved.availability,
    workloads: resolved.workloads,
    activeCoverage: resolved.activeCoverage,
    readiness: resolved.readiness,
    profileWork: resolved.profileWork,
  }
  return evaluateDailyCoverage(input)
}

export interface CoverageStatusView {
  plan: CoveragePlan
  summary: ReturnType<typeof buildCoverageStatusSummary>
  availability: RepAvailabilityInput[]
  coveragePolicy: 'AUTO_COVER' | 'APPROVAL_REQUIRED' | 'MANUAL_ONLY'
  maxProfilesPerRep: number
  businessDate: string
  isWorkingDay: boolean
}

/** The Admin Home operational block: team status + profile coverage + exceptions. */
export async function loadCoverageStatus(
  orgId: string,
  options: { date?: string; client?: DbClient } = {},
): Promise<CoverageStatusView> {
  const facts = await loadCoverageFacts(orgId, options)
  const plan = await loadCoveragePlan(orgId, options, facts)
  const summary = buildCoverageStatusSummary({
    availability: facts.availability,
    plan,
  })
  return {
    plan,
    summary,
    availability: facts.availability,
    coveragePolicy: facts.coveragePolicy,
    maxProfilesPerRep: facts.maxProfilesPerRep,
    businessDate: facts.businessDate,
    isWorkingDay: facts.isWorkingDay,
  }
}

export interface RepReturningCoverage {
  profileId: string
  profileName: string
  coveringRepName: string
  effectiveUntil: string | null
}

export interface RepCoverageView {
  businessDate: string
  isWorkingDay: boolean
  repId: string
  repName: string
  availability: AvailabilityState
  own: CoverageProfileResult[]
  covering: CoverageProfileResult[]
  requiresApproval: number
  readiness: Array<{ profileId: string; repId: string; ready: boolean }>
  /** Coverage that ended in the last week — the return-to-work summary. */
  returning: RepReturningCoverage[]
}

/**
 * Coverage that ended in the past week for this rep — the return-to-work
 * summary. Historical attribution stays with the covering rep; this only
 * tells the primary what they missed.
 */
async function loadRecentReturningCoverage(
  orgId: string,
  repId: string,
  options: { date?: string },
): Promise<RepReturningCoverage[]> {
  const supabase = await createServerSupabase()
  const policy = await loadOperatingPolicy(orgId)
  const now = currentInstant()
  const today = orgDate(now, policy.timezone)
  const businessDate = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? options.date : today
  const since = new Date(`${businessDate}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - 7)
  const sinceDate = since.toISOString().slice(0, 10)

  const { data: rows, error } = await supabase
    .from('coverage_assignments')
    .select('profile_id, covering_rep_id, effective_until')
    .eq('organization_id', orgId)
    .eq('primary_rep_id', repId)
    .eq('status', 'COMPLETED')
    .gte('effective_until', sinceDate)
    .order('effective_until', { ascending: false })
    .limit(10)
  if (error) return []
  if (!rows || rows.length === 0) return []

  const profileIds = [...new Set((rows as Array<{ profile_id: string }>).map((row) => row.profile_id))]
  const repIds = [...new Set((rows as Array<{ covering_rep_id: string }>).map((row) => row.covering_rep_id))]

  const [profileRes, repRes] = await Promise.all([
    supabase.from('profiles').select('id, display_name, full_name, label').eq('organization_id', orgId).in('id', profileIds).limit(50),
    supabase.from('reps').select('id, name').eq('organization_id', orgId).in('id', repIds).limit(50),
  ])
  const profileName = new Map(
    (profileRes.data ?? []).map((row) => [
      row.id as string,
      (row.display_name as string) ?? (row.full_name as string) ?? (row.label as string) ?? 'Unnamed',
    ]),
  )
  const repName = new Map((repRes.data ?? []).map((row) => [row.id as string, row.name as string]))

  return (rows as Array<{ profile_id: string; covering_rep_id: string; effective_until: string | null }>).map((row) => ({
    profileId: row.profile_id,
    profileName: profileName.get(row.profile_id) ?? 'Unnamed',
    coveringRepName: repName.get(row.covering_rep_id) ?? 'Unknown',
    effectiveUntil: row.effective_until,
  }))
}

/**
 * Rep Home's operational responsibility view: what is mine today, what I am
 * temporarily covering, why, and whether I have confirmed device access.
 */
export async function loadRepCoverage(
  orgId: string,
  repId: string,
  options: { date?: string } = {},
): Promise<RepCoverageView> {
  const [facts, returningRows] = await Promise.all([
    loadCoverageFacts(orgId, options),
    loadRecentReturningCoverage(orgId, repId, options),
  ])
  const plan = evaluateDailyCoverage({
    businessDate: facts.businessDate,
    isWorkingDay: facts.isWorkingDay,
    coveragePolicy: facts.coveragePolicy,
    maxProfilesPerRep: facts.maxProfilesPerRep,
    profiles: facts.profiles,
    assignments: facts.assignments,
    coverage: facts.coverage,
    availability: facts.availability,
    workloads: facts.workloads,
    activeCoverage: facts.activeCoverage,
    readiness: facts.readiness,
    profileWork: facts.profileWork,
  })

  const repName = facts.reps.find((rep) => rep.repId === repId)?.name ?? 'Unknown'
  const availability = facts.availability.find((row) => row.repId === repId)?.state
    ?? fallbackAvailability(facts.isWorkingDay)

  const ownIds = new Set(
    facts.assignments.filter((row) => row.repId === repId).map((row) => row.profileId),
  )
  const coveringIds = new Set(
    facts.activeCoverage.filter((row) => row.coveringRepId === repId).map((row) => row.profileId),
  )

  const byId = new Map(plan.profiles.map((profile) => [profile.profileId, profile]))
  const own = [...ownIds].map((id) => byId.get(id)).filter((p): p is CoverageProfileResult => Boolean(p))
  const covering = [...coveringIds]
    .map((id) => byId.get(id))
    .filter((p): p is CoverageProfileResult => Boolean(p))

  const readiness = [...new Set([...ownIds, ...coveringIds])].map((profileId) => ({
    profileId,
    repId,
    ready: facts.readiness.some((row) => row.profileId === profileId && row.repId === repId),
  }))

  return {
    businessDate: facts.businessDate,
    isWorkingDay: facts.isWorkingDay,
    repId,
    repName,
    availability,
    own: own.sort((a, b) => a.name.localeCompare(b.name)),
    covering: covering.sort((a, b) => a.name.localeCompare(b.name)),
    requiresApproval: plan.requiresApproval.length,
    readiness,
    returning: returningRows,
  }
}

export interface CoverageReviewRow {
  profileId: string
  profileName: string
  channels: RevenueIdentityChannel[]
  primaryRepId: string
  primaryRepName: string
  coveringRepId: string
  coveringRepName: string
  status: string
  activatedAt: string
  effectiveUntil: string | null
  reason: string | null
}

export interface CoverageReview {
  businessDate: string
  from: string
  to: string
  rows: CoverageReviewRow[]
  totals: {
    activations: number
    restores: number
    revocations: number
    uncoveredNow: number
    backupActiveNow: number
  }
  /** Reps most often carrying coverage — the overload signal. */
  coverageLoad: Array<{ repId: string; name: string; active: number; handled: number }>
}

/**
 * Weekly coverage review: gaps, leave coverage events, repeated overload and
 * frequently used backups. Deterministic aggregates over the audit trail.
 */
export async function loadCoverageReview(
  orgId: string,
  options: { from?: string; to?: string } = {},
): Promise<CoverageReview> {
  const supabase = await createServerSupabase()
  const policy = await loadOperatingPolicy(orgId)
  const now = currentInstant()
  const today = orgDate(now, policy.timezone)
  const to = options.to ?? today
  const from = options.from ?? to

  const [eventsRes, assignmentsRes, plan] = await Promise.all([
    supabase
      .from('coverage_events')
      .select('event_type, profile_id, primary_rep_id, covering_rep_id, reason, effective_from, effective_until, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', from)
      .lte('created_at', `${to}T23:59:59.999Z`)
      .limit(5000),
    supabase
      .from('coverage_assignments')
      .select('profile_id, primary_rep_id, covering_rep_id, status, reason, effective_from, effective_until, created_at')
      .eq('organization_id', orgId)
      .limit(5000),
    loadCoveragePlan(orgId, { date: to }),
  ])

  const facts = await loadCoverageFacts(orgId, { date: to })
  const nameByRep = new Map(facts.reps.map((rep) => [rep.repId, rep.name]))
  const nameByProfile = new Map(facts.profiles.map((profile) => [profile.profileId, profile.name]))

  const events = (eventsRes.data ?? []) as Array<{
    event_type: string
    profile_id: string
    primary_rep_id: string | null
    covering_rep_id: string | null
    reason: string | null
    effective_from: string | null
    effective_until: string | null
    created_at: string
  }>

  const rows: CoverageReviewRow[] = (assignmentsRes.data ?? []).map((row) => {
    const profileId = row.profile_id as string
    return {
      profileId,
      profileName: nameByProfile.get(profileId) ?? 'Unnamed',
      channels: plan.profiles.find((profile) => profile.profileId === profileId)?.channels ?? [],
      primaryRepId: row.primary_rep_id as string,
      primaryRepName: nameByRep.get(row.primary_rep_id as string) ?? 'Unknown',
      coveringRepId: row.covering_rep_id as string,
      coveringRepName: nameByRep.get(row.covering_rep_id as string) ?? 'Unknown',
      status: row.status as string,
      activatedAt: row.created_at as string,
      effectiveUntil: (row.effective_until as string | null) ?? null,
      reason: (row.reason as string | null) ?? null,
    }
  })

  const handledByRep = new Map<string, number>()
  for (const event of events) {
    if (event.event_type === 'COVERAGE_ACTIVATED' && event.covering_rep_id) {
      handledByRep.set(event.covering_rep_id, (handledByRep.get(event.covering_rep_id) ?? 0) + 1)
    }
  }
  const activeByRep = new Map<string, number>()
  for (const row of rows) {
    if (row.status === 'ACTIVE') {
      activeByRep.set(row.coveringRepId, (activeByRep.get(row.coveringRepId) ?? 0) + 1)
    }
  }

  const coverageLoad = [...new Set([...handledByRep.keys(), ...activeByRep.keys()])].map((repId) => ({
    repId,
    name: nameByRep.get(repId) ?? 'Unknown',
    active: activeByRep.get(repId) ?? 0,
    handled: handledByRep.get(repId) ?? 0,
  }))

  return {
    businessDate: facts.businessDate,
    from,
    to,
    rows: rows.sort((a, b) => b.activatedAt.localeCompare(a.activatedAt)),
    totals: {
      activations: events.filter((event) => event.event_type === 'COVERAGE_ACTIVATED').length,
      restores: events.filter((event) => event.event_type === 'COVERAGE_RESTORED').length,
      revocations: events.filter((event) => event.event_type === 'COVERAGE_REVOKED').length,
      uncoveredNow: plan.counts.UNCOVERED,
      backupActiveNow: plan.counts.BACKUP_ACTIVE,
    },
    coverageLoad: coverageLoad.sort((a, b) => b.handled - a.handled || a.name.localeCompare(b.name)),
  }
}

/** Compact label for a rep's availability, used by the UI and tests. */
export function availabilityLabel(state: AvailabilityState): string {
  return labelForAvailability(state)
}
