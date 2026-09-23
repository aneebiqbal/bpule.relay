import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { can } from '@/lib/auth/organization'

/**
 * Canonical data loader for the Accountability Control Plane.
 * All three roles (rep, manager, admin) consume from here.
 * This is the single source of truth — no duplicate queries.
 */

export interface AccountabilityDashboardData {
  role: 'rep' | 'manager' | 'admin'
  personId: string
  personName: string
  date: string
  timezone: string
  isWorkingDay: boolean
  // Rep-specific
  myDay?: {
    status: string
    timeRemaining: string
    dayElapsedPct: number
    totalCompleted: number
    totalTarget: number
    totalRemaining: number
    categories: Array<{
      key: string
      label: string
      completed: number
      target: number
      remaining: number
      href: string
    }>
    warning: {
      level: string
      message: string
      categories: Array<{ label: string; remaining: number; href: string }>
    } | null
    canCloseDay: boolean
    dayCloseStatus: string | null
    hasContract: boolean
  }
  // Manager-specific
  team?: {
    teams: Array<{
      teamId: string
      teamName: string
      members: Array<{
        personId: string
        personName: string
        workingAs: string[]
        totalCompleted: number
        totalTarget: number
        totalRemaining: number
        status: string
        dayCloseStatus: string | null
        exceptionReason: string | null
        needsAttention: boolean
        categoriesBehind: Array<{ label: string; remaining: number }>
      }>
    }>
  }
  // Admin-specific
  commandCenter?: {
    teamHealth: {
      working: number
      onTrack: number
      atRisk: number
      behind: number
      blocked: number
      closed: number
    }
    attentionItems: Array<{
      repId: string
      repName: string
      identityName: string
      status: string
      message: string
      remaining: number
    }>
    team: Array<{
      personId: string
      personName: string
      workingAs: string[]
      progress: string
      remaining: number
      status: string
      dayCloseStatus: string | null
    }>
  }
}

function formatTimeRemaining(minutes: number): string {
  if (minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function computeDayElapsed(timezone: string): number {
  const now = new Date()
  const localStr = now.toLocaleString('en-US', { timeZone: timezone })
  const local = new Date(localStr)
  const hour = local.getHours()
  const minute = local.getMinutes()
  const startHour = 9
  const endHour = 17
  const totalMinutes = (endHour - startHour) * 60
  const elapsedMinutes = (hour - startHour) * 60 + minute
  if (elapsedMinutes <= 0) return 0
  if (elapsedMinutes >= totalMinutes) return 1
  return elapsedMinutes / totalMinutes
}

function computeTimeRemaining(timezone: string): string {
  const now = new Date()
  const localStr = now.toLocaleString('en-US', { timeZone: timezone })
  const local = new Date(localStr)
  const hour = local.getHours()
  const minute = local.getMinutes()
  const endMinutes = 17 * 60
  const currentMinutes = hour * 60 + minute
  return formatTimeRemaining(Math.max(0, endMinutes - currentMinutes))
}

/**
 * Pure aggregation for the admin Command Center — see the doc comment above
 * its call site in load() for why daily_targets/daily_accountability (not
 * day_closes/revenue_identity_contracts) is the primary source. Extracted
 * as a pure function (plain data in, plain data out) so it's testable
 * without mocking Next.js server auth context / Supabase.
 */
export function buildCommandCenterFromActivity(input: {
  reps: Array<{ id: string; name: string }>
  assignments: Array<{ rep_id: string; revenue_identity_id: string }>
  identities: Array<{ id: string; identity_name: string }>
  targets: Array<{ revenue_identity_id: string; activity_type: string; target_count: number }>
  accountability: Array<{ rep_id: string; revenue_identity_id: string; activity_type: string; completed_count: number }>
  dayCloses: Array<{ person_id: string; status: string }>
  dayElapsedPct: number
}): NonNullable<AccountabilityDashboardData['commandCenter']> {
  const { reps, assignments, identities, targets, accountability, dayCloses, dayElapsedPct } = input

  const accByRep = new Map<string, typeof accountability>()
  for (const acc of accountability) {
    const list = accByRep.get(acc.rep_id) ?? []
    list.push(acc)
    accByRep.set(acc.rep_id, list)
  }

  let working = 0, onTrack = 0, atRisk = 0, behind = 0, blocked = 0, closed = 0
  const teamRows: NonNullable<AccountabilityDashboardData['commandCenter']>['team'] = []
  const attentionItems: NonNullable<AccountabilityDashboardData['commandCenter']>['attentionItems'] = []

  const repIdsWithAssignments = new Set(assignments.map((a) => a.rep_id))

  for (const rep of reps) {
    if (!repIdsWithAssignments.has(rep.id)) continue

    const myAssignments = assignments.filter((a) => a.rep_id === rep.id)
    const myTargets = targets.filter((t) =>
      myAssignments.some((a) => a.revenue_identity_id === t.revenue_identity_id),
    )
    const myAccountability = accByRep.get(rep.id) ?? []
    const accMap = new Map(myAccountability.map((a) => [`${a.revenue_identity_id}:${a.activity_type}`, a]))

    if (myTargets.length === 0) continue

    let personTarget = 0
    let personCompleted = 0
    const workingAs = [...new Set(
      myAssignments
        .map((a) => identities.find((i) => i.id === a.revenue_identity_id)?.identity_name)
        .filter((n): n is string => typeof n === 'string'),
    )]
    const categoriesBehind: Array<{ label: string; remaining: number }> = []

    for (const t of myTargets) {
      const acc = accMap.get(`${t.revenue_identity_id}:${t.activity_type}`)
      const completed = acc?.completed_count ?? 0
      personTarget += t.target_count
      personCompleted += completed
      const remaining = Math.max(0, t.target_count - completed)
      if (remaining > 0) categoriesBehind.push({ label: t.activity_type.replace(/_/g, ' '), remaining })
    }

    const personRemaining = Math.max(0, personTarget - personCompleted)
    const personStatus = personRemaining === 0 && personTarget > 0 ? 'completed' : 'on_track'

    working++
    let isBehind = false
    if (personStatus === 'completed') {
      closed++
    } else if (dayElapsedPct >= 0.5 && personCompleted < personTarget * 0.6 && personRemaining > 0) {
      isBehind = true
      behind++
      attentionItems.push({
        repId: rep.id,
        repName: rep.name,
        identityName: workingAs[0] ?? 'Unknown',
        status: 'behind',
        message: `${rep.name} is behind: ${categoriesBehind.slice(0, 2).map((c) => `${c.remaining} ${c.label}`).join(', ')} remaining`,
        remaining: personRemaining,
      })
    } else {
      onTrack++
    }

    const dayClose = dayCloses.find((d) => d.person_id === rep.id)

    teamRows.push({
      personId: rep.id,
      personName: rep.name,
      workingAs,
      progress: `${personCompleted}/${personTarget}`,
      remaining: personRemaining,
      status: isBehind ? 'behind' : personStatus,
      dayCloseStatus: dayClose?.status ?? null,
    })
  }

  return {
    teamHealth: { working, onTrack, atRisk, behind, blocked, closed },
    attentionItems,
    team: teamRows,
  }
}

async function load(): Promise<AccountabilityDashboardData | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const ctx = await getAuthContext()
  if (!ctx) return null

  const supabase = await createServerSupabase()
  const today = new Date().toISOString().slice(0, 10)
  const timezone = user.rep.timezone || user.organization.timezone || 'UTC'

  // Auto-create day_close rows for all assigned identities (non-fatal)
  if (ctx.repId && ctx.orgId) {
    try {
      await supabase.rpc('ensure_day_closes_for_person', {
        p_org_id: ctx.orgId,
        p_person_id: ctx.repId,
        p_date: today,
      })
    } catch {
      // Non-fatal: if RPC fails, proceed without pre-created day closes
    }
  }
  const dayElapsedPct = computeDayElapsed(timezone)

  const role: 'rep' | 'manager' | 'admin' = ctx.isOwner || ctx.isAdmin ? 'admin' : ctx.isManager ? 'manager' : 'rep'

  // ── Always load the rep's own day ──
  const { data: assignments } = await supabase
    .from('identity_assignments')
    .select('revenue_identity_id')
    .eq('rep_id', ctx.repId)
    .eq('organization_id', ctx.orgId)

  const identityIds = (assignments ?? []).map((a: any) => a.revenue_identity_id)

  const { data: contracts } = identityIds.length > 0
    ? await supabase.from('revenue_identity_contracts').select('*').in('revenue_identity_id', identityIds).eq('status', 'active').order('effective_from', { ascending: false })
    : { data: [] }

  const contractIds = (contracts ?? []).map((c: any) => c.id)
  const { data: allocations } = contractIds.length > 0
    ? await supabase.from('contract_allocations').select('*').in('contract_id', contractIds)
    : { data: [] }

  const { data: dayCloses } = identityIds.length > 0
    ? await supabase.from('day_closes').select('*').eq('person_id', ctx.repId).eq('date', today).in('revenue_identity_id', identityIds)
    : { data: [] }

  const { data: availability } = await supabase
    .from('operator_availability')
    .select('status')
    .eq('person_id', ctx.repId)
    .eq('date', today)
    .maybeSingle()

  const availabilityStatus = (availability?.status as string) ?? 'working'
  const isWorkingDay = availabilityStatus === 'working'

  // Build aggregated progress across all identities
  let totalConnectionsTarget = 0
  let totalConnectionsCompleted = 0
  let totalFirstDmsTarget = 0
  let totalFirstDmsCompleted = 0
  let totalEmailsTarget = 0
  let totalEmailsCompleted = 0
  let totalFollowupsTarget = 0
  let totalFollowupsCompleted = 0

  for (const contract of contracts ?? []) {
    const myAlloc = (allocations ?? []).find((a: any) => a.contract_id === contract.id && a.person_id === ctx.repId)
    const pct = (myAlloc?.allocation_pct ?? ((allocations ?? []).filter((a: any) => a.contract_id === contract.id).length === 0 ? 100 : 0)) / 100

    const dc = (dayCloses ?? []).find((d: any) => d.revenue_identity_id === contract.revenue_identity_id)
    const snap = (dc?.completion_snapshot ?? {}) as Record<string, number>

    totalConnectionsTarget += Math.round(contract.connections * pct)
    totalConnectionsCompleted += snap.connections ?? 0
    totalFirstDmsTarget += Math.round(contract.first_dms * pct)
    totalFirstDmsCompleted += snap.first_dms ?? 0
    totalEmailsTarget += Math.round(contract.emails * pct)
    totalEmailsCompleted += snap.emails ?? 0
    totalFollowupsTarget += Math.round(contract.followups * pct)
    totalFollowupsCompleted += snap.followups ?? 0
  }

  const totalTarget = totalConnectionsTarget + totalFirstDmsTarget + totalEmailsTarget + totalFollowupsTarget
  const totalCompleted = totalConnectionsCompleted + totalFirstDmsCompleted + totalEmailsCompleted + totalFollowupsCompleted
  const totalRemaining = Math.max(0, totalTarget - totalCompleted)

  const categories = [
    { key: 'connections', label: 'Connections', completed: totalConnectionsCompleted, target: totalConnectionsTarget, href: '/leads?filter=connect' },
    { key: 'firstDms', label: 'First DMs', completed: totalFirstDmsCompleted, target: totalFirstDmsTarget, href: '/leads?filter=dm' },
    { key: 'emails', label: 'Emails', completed: totalEmailsCompleted, target: totalEmailsTarget, href: '/leads?filter=email' },
    { key: 'followups', label: 'Follow-ups', completed: totalFollowupsCompleted, target: totalFollowupsTarget, href: '/leads?filter=followup' },
  ].filter((c) => c.target > 0).map((c) => ({ ...c, remaining: Math.max(0, c.target - c.completed) }))

  // Compute status
  let status = 'on_track'
  if (totalRemaining === 0 && totalTarget > 0) {
    status = 'completed'
  } else if (totalRemaining > 0 && totalTarget > 0) {
    const ratio = totalCompleted / totalTarget
    if (dayElapsedPct >= 0.8 && ratio < 0.5) status = 'behind'
    else if (dayElapsedPct > 0.3 && ratio < dayElapsedPct - 0.3) status = 'at_risk'
    else status = 'on_track'
  } else if (totalTarget === 0) {
    status = 'not_started'
  }

  const canCloseDay = totalRemaining === 0 && totalTarget > 0
  const dayCloseStatus = (dayCloses ?? [])[0]?.status ?? null
  const hasContract = (contracts ?? []).length > 0

  // Build warning
  const categoriesWithRemaining = categories.filter((c) => c.remaining > 0)
  let warning: { level: string; message: string; categories: Array<{ label: string; remaining: number; href: string }> } | null = null

  if (isWorkingDay && hasContract) {
    if (totalRemaining === 0 && totalTarget > 0) {
      warning = { level: 'ready', message: "Today's required work is complete. You can close your day.", categories: [] }
    } else if (dayElapsedPct >= 0.85 && totalRemaining > 0) {
      warning = {
        level: 'very_late',
        message: `Your workday is nearly over. Complete the remaining ${totalRemaining} actions or request an exception before closing.`,
        categories: categoriesWithRemaining.map((c) => ({ label: c.label, remaining: c.remaining, href: c.href })),
      }
    } else if (dayElapsedPct >= 0.65 && totalRemaining > 0) {
      const categoryList = categoriesWithRemaining.slice(0, 3).map((c) => `${c.remaining} ${c.label.toLowerCase()}`).join(', ')
      warning = {
        level: 'late',
        message: `Day Close is currently blocked. You still have ${categoryList} remaining.`,
        categories: categoriesWithRemaining.map((c) => ({ label: c.label, remaining: c.remaining, href: c.href })),
      }
    } else if (dayElapsedPct >= 0.35 && totalRemaining > 0 && totalCompleted < totalTarget * dayElapsedPct * 0.7) {
      const categoryList = categoriesWithRemaining.slice(0, 2).map((c) => `${c.remaining} ${c.label.toLowerCase()}`).join(' and ')
      warning = {
        level: 'midday',
        message: `You're behind today's pace. ${categoryList} remain.`,
        categories: categoriesWithRemaining.map((c) => ({ label: c.label, remaining: c.remaining, href: c.href })),
      }
    } else if (totalCompleted === 0 && dayElapsedPct < 0.3 && totalTarget > 0) {
      warning = {
        level: 'early',
        message: `You have ${totalTarget} actions due today. Start with the most important category.`,
        categories: categoriesWithRemaining.map((c) => ({ label: c.label, remaining: c.remaining, href: c.href })),
      }
    }
  } else if (!hasContract && isWorkingDay) {
    warning = { level: 'info', message: 'No revenue identity assigned. Ask your admin to assign one.', categories: [] }
  }

  const myDay: AccountabilityDashboardData['myDay'] = {
    status,
    timeRemaining: computeTimeRemaining(timezone),
    dayElapsedPct,
    totalCompleted,
    totalTarget,
    totalRemaining,
    categories,
    warning,
    canCloseDay,
    dayCloseStatus,
    hasContract,
  }

  const result: AccountabilityDashboardData = {
    role,
    personId: ctx.repId,
    personName: user.rep.name,
    date: today,
    timezone,
    isWorkingDay,
    myDay,
  }

  // ── Manager: load team data ──
  if (role === 'manager' && ctx.managedTeamIds.length > 0) {
    const teams = await Promise.all(ctx.managedTeamIds.map(async (teamId) => {
      const [teamInfo, members] = await Promise.all([
        supabase.from('teams').select('name').eq('id', teamId).maybeSingle(),
        supabase.from('team_memberships').select('person_id').eq('team_id', teamId).eq('active', true),
      ])

      const memberIds = (members.data ?? []).map((m: any) => m.person_id)

      // Get day closes for team members
      const { data: teamDayCloses } = memberIds.length > 0
        ? await supabase.from('day_closes').select('*').in('person_id', memberIds).eq('date', today)
        : { data: [] }

      // Get contracts for team members' identities
      const teamIdentityIds = (teamDayCloses ?? []).map((dc: any) => dc.revenue_identity_id)
      const { data: teamContracts } = teamIdentityIds.length > 0
        ? await supabase.from('revenue_identity_contracts').select('*').in('revenue_identity_id', teamIdentityIds).eq('status', 'active')
        : { data: [] }

      const teamContractIds = (teamContracts ?? []).map((c: any) => c.id)
      const { data: teamAllocs } = teamContractIds.length > 0
        ? await supabase.from('contract_allocations').select('*').in('contract_id', teamContractIds)
        : { data: [] }

      const { data: teamIdentities } = teamIdentityIds.length > 0
        ? await supabase.from('revenue_identities').select('id, identity_name').in('id', teamIdentityIds)
        : { data: [] }

      const memberDetails = await Promise.all(memberIds.map(async (memberId: string) => {
        const { data: memberRep } = await supabase.from('reps').select('name').eq('id', memberId).maybeSingle()
        const memberDayCloses = (teamDayCloses ?? []).filter((dc: any) => dc.person_id === memberId)

        let totalTarget = 0
        let totalCompleted = 0
        const workingAs: string[] = []
        const categoriesBehind: Array<{ label: string; remaining: number }> = []

        for (const dc of memberDayCloses) {
          const contract = (teamContracts ?? []).find((c: any) => c.id === dc.contract_id)
          if (!contract) continue
          const myAlloc = (teamAllocs ?? []).find((a: any) => a.contract_id === contract.id && a.person_id === memberId)
          const pct = (myAlloc?.allocation_pct ?? ((teamAllocs ?? []).filter((a: any) => a.contract_id === contract.id).length === 0 ? 100 : 0)) / 100
          const snap = (dc.completion_snapshot ?? {}) as Record<string, number>

          const connTarget = Math.round(contract.connections * pct)
          const fdTarget = Math.round(contract.first_dms * pct)
          const emTarget = Math.round(contract.emails * pct)
          const fuTarget = Math.round(contract.followups * pct)

          totalTarget += connTarget + fdTarget + emTarget + fuTarget
          totalCompleted += (snap.connections ?? 0) + (snap.first_dms ?? 0) + (snap.emails ?? 0) + (snap.followups ?? 0)

          const identity = (teamIdentities ?? []).find((i: any) => i.id === dc.revenue_identity_id)
          if (identity) workingAs.push(identity.identity_name)

          const connRem = Math.max(0, connTarget - (snap.connections ?? 0))
          const fdRem = Math.max(0, fdTarget - (snap.first_dms ?? 0))
          const emRem = Math.max(0, emTarget - (snap.emails ?? 0))
          const fuRem = Math.max(0, fuTarget - (snap.followups ?? 0))
          if (connRem > 0) categoriesBehind.push({ label: 'Connections', remaining: connRem })
          if (fdRem > 0) categoriesBehind.push({ label: 'DMs', remaining: fdRem })
          if (emRem > 0) categoriesBehind.push({ label: 'Emails', remaining: emRem })
          if (fuRem > 0) categoriesBehind.push({ label: 'Follow-ups', remaining: fuRem })
        }

        const totalRemaining = Math.max(0, totalTarget - totalCompleted)
        const exceptionDayClose = memberDayCloses.find((dc: any) => dc.exception_reason)
        const behind = dayElapsedPct >= 0.5 && totalCompleted < totalTarget * 0.6 && totalRemaining > 0
        const notStarted = totalCompleted === 0 && dayElapsedPct >= 0.4 && totalTarget > 0

        return {
          personId: memberId,
          personName: memberRep?.name ?? memberId,
          workingAs: [...new Set(workingAs)],
          totalCompleted,
          totalTarget,
          totalRemaining,
          status: totalRemaining === 0 && totalTarget > 0 ? 'completed' : behind ? 'behind' : notStarted ? 'not_started' : 'on_track',
          dayCloseStatus: memberDayCloses[0]?.status ?? null,
          exceptionReason: exceptionDayClose?.exception_reason ?? null,
          needsAttention: behind || notStarted || !!exceptionDayClose,
          categoriesBehind,
        }
      }))

      return {
        teamId,
        teamName: (teamInfo as any)?.name ?? 'My Team',
        members: memberDetails,
      }
    }))

    result.team = { teams }
  }

  // ── Admin: load command center ──
  //
  // This used to be driven entirely by day_closes / revenue_identity_contracts
  // (the "formal daily contract" accountability system). In practice those
  // tables can be completely unprovisioned for an org — zero contracts ever
  // created — while reps are actively working and daily_targets /
  // daily_accountability (a separate, simpler per-activity-type target
  // system — the one getMyTodayAccountability() already uses for a rep's own
  // Today view) is genuinely populated with real completed counts. When that
  // happens the Command Center showed all-zero stats and "No active
  // operators today" for a team that was demonstrably working — the admin
  // view was reading from a data source nothing had ever written to, not
  // reflecting an actual empty team. daily_targets/daily_accountability is
  // now the primary source (it's populated for every rep who has ever
  // logged real activity); day_closes is still consulted, best-effort, to
  // enrich the "Day Close" column when that separate system IS in use.
  if (role === 'admin') {
    const { data: allReps } = await supabase
      .from('reps')
      .select('id, name')
      .eq('organization_id', ctx.orgId)

    const { data: allAssignments } = await supabase
      .from('identity_assignments')
      .select('rep_id, revenue_identity_id')
      .eq('organization_id', ctx.orgId)

    const assignedIdentityIds = [...new Set((allAssignments ?? []).map((a: any) => a.revenue_identity_id))]
    const { data: allIdentities } = assignedIdentityIds.length > 0
      ? await supabase.from('revenue_identities').select('id, identity_name').in('id', assignedIdentityIds)
      : { data: [] }

    const { data: allTargets } = await supabase
      .from('daily_targets')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .eq('active', true)

    const { data: allAccountability } = await supabase
      .from('daily_accountability')
      .select('*')
      .eq('organization_id', ctx.orgId)
      .eq('target_date', today)

    // day_closes is best-effort enrichment only — an org that has never
    // provisioned contracts must not lose the rest of this view over it.
    const { data: allDayCloses } = await supabase
      .from('day_closes')
      .select('person_id, status')
      .eq('organization_id', ctx.orgId)
      .eq('date', today)

    result.commandCenter = buildCommandCenterFromActivity({
      reps: (allReps ?? []) as Array<{ id: string; name: string }>,
      assignments: (allAssignments ?? []) as Array<{ rep_id: string; revenue_identity_id: string }>,
      identities: (allIdentities ?? []) as Array<{ id: string; identity_name: string }>,
      targets: (allTargets ?? []) as Array<{ revenue_identity_id: string; activity_type: string; target_count: number }>,
      accountability: (allAccountability ?? []) as Array<{ rep_id: string; revenue_identity_id: string; activity_type: string; completed_count: number }>,
      dayCloses: (allDayCloses ?? []) as Array<{ person_id: string; status: string }>,
      dayElapsedPct,
    })
  }

  return result
}

export const loadAccountabilityDashboard = cache(load)
