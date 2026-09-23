import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext, can } from '@/lib/auth/organization'

const ACTIVITY_LABEL: Record<string, string> = {
  connection_request: 'connection notes',
  dm: 'DMs',
  email: 'emails',
  followup: 'follow-ups',
  application: 'applications',
  proposal: 'proposals',
  other: 'actions',
}

export async function GET() {
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'VIEW_TEAM_ANALYTICS')) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })

  const supabase = await createServerSupabase()
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  const [
    { data: reps },
    { data: identities },
    { data: assignments },
    { data: targets },
    { data: accountability },
    { data: todaysMessages },
    { data: todaysLeads },
    { data: extractions },
  ] = await Promise.all([
    supabase.from('reps').select('id, name, role').eq('organization_id', authCtx.orgId),
    supabase.from('revenue_identities').select('id, identity_name, channel, title').eq('organization_id', authCtx.orgId).eq('status', 'active'),
    supabase.from('identity_assignments').select('identity_id, rep_id').eq('organization_id', authCtx.orgId),
    supabase.from('daily_targets').select('rep_id, revenue_identity_id, activity_type, target_count').eq('organization_id', authCtx.orgId).eq('active', true),
    supabase.from('daily_accountability').select('rep_id, revenue_identity_id, activity_type, completed_count, status').eq('organization_id', authCtx.orgId).eq('target_date', now.toISOString().slice(0, 10)),
    supabase.from('messages').select('rep_id, type, sent_at').eq('organization_id', authCtx.orgId).not('sent_at', 'is', null).gte('sent_at', startOfDay).lt('sent_at', endOfDay),
    supabase.from('leads').select('owner_rep_id, created_at, status').eq('organization_id', authCtx.orgId).gte('created_at', startOfDay).lt('created_at', endOfDay),
    supabase.from('extraction_runs').select('rep_id, success, created_at').eq('organization_id', authCtx.orgId).gte('created_at', startOfDay).lt('created_at', endOfDay),
  ])

  const people = (reps ?? []).map((rep) => {
    const repAssignments = (assignments ?? []).filter((a) => a.rep_id === rep.id)
    const repIdentities = repAssignments
      .map((a) => (identities ?? []).find((i) => i.id === a.identity_id))
      .filter(Boolean) as Array<{ id: string; identity_name: string; channel: string; title: string | null }>

    const repTargets = (targets ?? []).filter((t) => t.rep_id === rep.id)
    const repAccountability = (accountability ?? []).filter((a) => a.rep_id === rep.id)

    const goals = repTargets.map((t) => {
      const done = repAccountability
        .filter((a) => a.revenue_identity_id === t.revenue_identity_id && a.activity_type === t.activity_type)
        .reduce((sum, a) => sum + (a.completed_count ?? 0), 0)
      return {
        activityType: t.activity_type,
        label: ACTIVITY_LABEL[t.activity_type] ?? t.activity_type,
        target: t.target_count,
        completed: done,
        remaining: Math.max(0, t.target_count - done),
        identityId: t.revenue_identity_id,
      }
    })

    const repMessages = (todaysMessages ?? []).filter((m) => m.rep_id === rep.id)
    const outreachCount = repMessages.filter((m) => m.type !== 'reply').length
    const replyCount = repMessages.filter((m) => m.type === 'reply').length
    const leadsSaved = (todaysLeads ?? []).filter((l) => l.owner_rep_id === rep.id).length
    const extractionRuns = (extractions ?? []).filter((e) => e.rep_id === rep.id)
    const extractionsCount = extractionRuns.length
    const extractionFailures = extractionRuns.filter((e) => !e.success).length

    const allTimestamps = [
      ...repMessages.map((m) => m.sent_at),
      ...(todaysLeads ?? []).filter((l) => l.owner_rep_id === rep.id).map((l) => l.created_at),
      ...extractionRuns.map((e) => e.created_at),
    ].filter(Boolean).sort().reverse()
    const lastActivityAt = (allTimestamps[0] as string) ?? null

    const totalTarget = repTargets.reduce((sum, t) => sum + t.target_count, 0)
    const totalCompleted = repAccountability.reduce((sum, a) => sum + (a.completed_count ?? 0), 0)

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
      outreachSent: outreachCount,
      repliesHandled: replyCount,
      leadsSaved,
      extractionsCount,
      extractionFailures,
      totalTarget,
      totalCompleted,
      totalRemaining: Math.max(0, totalTarget - totalCompleted),
      lastActivityAt,
      identityCount: repIdentities.length,
    }
  })

  people.sort((a, b) => {
    const aTotal = a.totalCompleted + a.leadsSaved + a.extractionsCount
    const bTotal = b.totalCompleted + b.leadsSaved + b.extractionsCount
    if (bTotal !== aTotal) return bTotal - aTotal
    return a.repName.localeCompare(b.repName)
  })

  return NextResponse.json({ date: now.toISOString().slice(0, 10), people })
}
