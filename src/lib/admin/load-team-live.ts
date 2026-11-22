import { createServerSupabase } from '@/lib/supabase/server'
import { assembleTeamLive, type TeamLivePayload } from '@/lib/admin/team-live'
import { businessDateRange, currentInstant, orgDate } from '@/lib/org-clock'
import { loadOperatingPolicy } from '@/lib/org-clock/load'

const OPEN_STATUSES = ['new', 'contacted', 'followed_up', 'replied']

export async function loadTeamLive(orgId: string, now = currentInstant()): Promise<TeamLivePayload> {
  const supabase = await createServerSupabase()
  const policy = await loadOperatingPolicy(orgId, supabase)
  const businessDate = orgDate(now, policy.timezone)
  const { start: startOfDay, end: endOfDay } = businessDateRange(businessDate, policy.timezone)

  const [
    reps,
    identities,
    assignments,
    plans,
    accountability,
    messages,
    leadsToday,
    extractions,
    openLeads,
    profiles,
    coverageRows,
    allocationRows,
  ] = await Promise.all([
    supabase.from('reps').select('id, name, role').eq('organization_id', orgId),
    supabase.from('revenue_identities').select('id, identity_name, channel, title, profile_id').eq('organization_id', orgId).eq('status', 'active'),
    supabase.from('identity_assignments').select('revenue_identity_id, rep_id').eq('organization_id', orgId),
    supabase.from('daily_target_plans').select('id, revenue_identity_id, activity_type, target_count').eq('organization_id', orgId).eq('active', true),
    supabase.from('daily_accountability').select('rep_id, revenue_identity_id, activity_type, completed_count, status').eq('organization_id', orgId).eq('target_date', businessDate),
    supabase.from('messages').select('rep_id, type, sent_at').eq('organization_id', orgId).not('sent_at', 'is', null).gte('sent_at', startOfDay).lt('sent_at', endOfDay),
    supabase.from('leads').select('owner_rep_id, created_at').eq('organization_id', orgId).gte('created_at', startOfDay).lt('created_at', endOfDay),
    supabase.from('extraction_runs').select('rep_id, success, created_at').eq('organization_id', orgId).gte('created_at', startOfDay).lt('created_at', endOfDay),
    supabase.from('leads').select('id, owner_rep_id, company, contact_name, status, canonical_score, score').eq('organization_id', orgId).in('status', OPEN_STATUSES).order('created_at', { ascending: false }).limit(800),
    supabase.from('profiles').select('id, display_name, full_name, label, person_id').eq('organization_id', orgId),
    supabase.from('profile_coverage').select('profile_id, rep_id, role, priority').eq('organization_id', orgId).eq('active', true).in('role', ['PRIMARY', 'OPERATOR']).limit(2000),
    supabase.from('daily_plan_allocations').select('plan_id, rep_id, target_count').eq('organization_id', orgId).eq('active', true).limit(2000),
  ])

  // The plan belongs to the CHANNEL. Every active seat — the PRIMARY and each
  // OPERATOR — sees the lane they execute; the lane is never duplicated into a
  // per-operator requirement. Allocations are the optional per-operator share.
  const profileByIdentity = new Map(
    (identities.data ?? []).map((row) => [row.id as string, (row as { profile_id: string | null }).profile_id]),
  )
  const seatsByProfile = new Map<string, string[]>()
  for (const row of (coverageRows.data ?? []) as Array<{ profile_id: string; rep_id: string; role: string; priority: number }>) {
    const list = seatsByProfile.get(row.profile_id) ?? []
    list.push(row.rep_id)
    seatsByProfile.set(row.profile_id, list)
  }
  const allocationByPlan = new Map<string, Map<string, number>>()
  for (const row of (allocationRows.data ?? []) as Array<{ plan_id: string; rep_id: string; target_count: number }>) {
    const byRep = allocationByPlan.get(row.plan_id) ?? new Map<string, number>()
    byRep.set(row.rep_id, row.target_count)
    allocationByPlan.set(row.plan_id, byRep)
  }

  const targets = (plans.data ?? []).flatMap((row) => {
    const profileId = profileByIdentity.get(row.revenue_identity_id as string) ?? ''
    const seats = (seatsByProfile.get(profileId) ?? []).filter(Boolean)
    const repsForLane = seats.length > 0 ? [...new Set(seats)] : ['unassigned']
    const allocations = allocationByPlan.get(row.id as string)
    return repsForLane.map((repId) => ({
      rep_id: repId,
      revenue_identity_id: row.revenue_identity_id,
      activity_type: row.activity_type,
      target_count: row.target_count,
      // A lane with more than one seat is SHARED regardless of whether an
      // allocation exists. An unallocated seat contributes 0 to its rep's
      // personal expectation; an allocation is that rep's explicit share.
      shared: repsForLane.length > 1,
      allocation: allocations?.get(repId) ?? null,
    }))
  })

  return assembleTeamLive({
    now,
    businessDate,
    timezone: policy.timezone,
    reps: reps.data ?? [],
    identities: identities.data ?? [],
    assignments: assignments.data ?? [],
    targets,
    accountability: accountability.data ?? [],
    messages: messages.data ?? [],
    leadsToday: leadsToday.data ?? [],
    extractions: extractions.data ?? [],
    openLeads: openLeads.data ?? [],
    profiles: profiles.data ?? [],
  })
}
