import { createServerSupabase } from '@/lib/supabase/server'
import { assembleTeamLive, type TeamLivePayload } from '@/lib/admin/team-live'

const OPEN_STATUSES = ['new', 'contacted', 'followed_up', 'replied']

export async function loadTeamLive(orgId: string, now = new Date()): Promise<TeamLivePayload> {
  const supabase = await createServerSupabase()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const [
    reps,
    identities,
    assignments,
    targets,
    accountability,
    messages,
    leadsToday,
    extractions,
    openLeads,
  ] = await Promise.all([
    supabase.from('reps').select('id, name, role').eq('organization_id', orgId),
    supabase.from('revenue_identities').select('id, identity_name, channel, title').eq('organization_id', orgId).eq('status', 'active'),
    supabase.from('identity_assignments').select('revenue_identity_id, rep_id').eq('organization_id', orgId),
    supabase.from('daily_targets').select('rep_id, revenue_identity_id, activity_type, target_count').eq('organization_id', orgId).eq('active', true),
    supabase.from('daily_accountability').select('rep_id, revenue_identity_id, activity_type, completed_count, status').eq('organization_id', orgId).eq('target_date', now.toISOString().slice(0, 10)),
    supabase.from('messages').select('rep_id, type, sent_at').eq('organization_id', orgId).not('sent_at', 'is', null).gte('sent_at', startOfDay).lt('sent_at', endOfDay),
    supabase.from('leads').select('owner_rep_id, created_at').eq('organization_id', orgId).gte('created_at', startOfDay).lt('created_at', endOfDay),
    supabase.from('extraction_runs').select('rep_id, success, created_at').eq('organization_id', orgId).gte('created_at', startOfDay).lt('created_at', endOfDay),
    supabase.from('leads').select('id, owner_rep_id, company, contact_name, status, canonical_score, score').eq('organization_id', orgId).in('status', OPEN_STATUSES).order('created_at', { ascending: false }).limit(800),
  ])

  return assembleTeamLive({
    now,
    reps: reps.data ?? [],
    identities: identities.data ?? [],
    assignments: assignments.data ?? [],
    targets: targets.data ?? [],
    accountability: accountability.data ?? [],
    messages: messages.data ?? [],
    leadsToday: leadsToday.data ?? [],
    extractions: extractions.data ?? [],
    openLeads: openLeads.data ?? [],
  })
}
