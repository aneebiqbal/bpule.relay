import { createServerSupabase } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'

export const dynamic = 'force-dynamic'

/**
 * GET /api/upwork/connects
 * Returns connects usage stats for the current rep:
 * - total used this week / this month
 * - per-profile breakdown
 * - per-job history
 * - remaining balance (if tracked)
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const client = await createServerSupabase()
  const repId = authCtx.repId

  // Get all applied jobs with connects cost
  const { data: jobs } = await client
    .from('upwork_jobs')
    .select('id, title, connects_cost, status, updated_at')
    .eq('owner_rep_id', repId)
    .eq('organization_id', authCtx.orgId)
    .in('status', ['applied', 'shortlisted', 'interviewing', 'offer_sent', 'awarded'])
    .order('updated_at', { ascending: false })
    .limit(50)

  // The profile label is a second read rather than a PostgREST embed
  // (`profile:profiles`), which the Neon adapter cannot translate.
  const profileIds = (jobs ?? []).map((j) => (j as { profile_id: string | null }).profile_id).filter((x): x is string => Boolean(x))
  const profileLabelById = new Map<string, string>()
  if (profileIds.length > 0) {
    const { data: profiles } = await client.from('profiles').select('id, label').in('id', profileIds)
    for (const p of profiles ?? []) profileLabelById.set(p.id as string, p.label as string)
  }
  const jobsWithProfile = (jobs ?? []).map((j) => ({
    ...j,
    profile: (j as { profile_id: string | null }).profile_id
      ? { id: (j as { profile_id: string }).profile_id, label: profileLabelById.get((j as { profile_id: string }).profile_id) ?? null }
      : null,
  }))

  // Calculate totals
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  let totalUsed = 0
  let weekUsed = 0
  let monthUsed = 0
  const perProfile: Record<string, { name: string; used: number; jobs: number }> = {}

  for (const job of (jobsWithProfile ?? [])) {
    const used = (job as any).connects_used ?? (job as any).connects_cost ?? 0
    const updatedAt = new Date((job as any).updated_at ?? now)
    totalUsed += used
    if (updatedAt >= weekStart) weekUsed += used
    if (updatedAt >= monthStart) monthUsed += used

    const profileName = (job as any).profile?.label ?? 'Unknown'
    if (!perProfile[profileName]) {
      perProfile[profileName] = { name: profileName, used: 0, jobs: 0 }
    }
    perProfile[profileName].used += used
    perProfile[profileName].jobs++
  }

  return NextResponse.json({
    totalUsed,
    weekUsed,
    monthUsed,
    appliedCount: jobsWithProfile?.length ?? 0,
    perProfile: Object.values(perProfile),
    recentJobs: (jobsWithProfile ?? []).slice(0, 10).map((j: any) => ({
      id: j.id,
      title: j.title.slice(0, 60),
      connects: j.connects_used ?? j.connects_cost ?? 0,
      status: j.status,
      date: j.updated_at,
    })),
  })
}
