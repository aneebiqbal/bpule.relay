import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (user.rep.role !== 'admin') return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  const supabase = await createServerSupabase()
  const org = user.organization
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  // Get all reps in the org
  const { data: reps } = await supabase
    .from('reps')
    .select('id, name')
    .eq('organization_id', org.id)

  if (!reps || reps.length === 0) {
    return NextResponse.json([])
  }

  // Count leads saved today per rep
  const { data: leads } = await supabase
    .from('leads')
    .select('owner_rep_id, created_at')
    .eq('organization_id', org.id)
    .gte('created_at', startOfDay)
    .lt('created_at', endOfDay)

  // Count outreach (sent messages) today per rep
  const { data: messages } = await supabase
    .from('messages')
    .select('rep_id, type, sent_at')
    .eq('organization_id', org.id)
    .not('sent_at', 'is', null)
    .gte('sent_at', startOfDay)
    .lt('sent_at', endOfDay)

  // Build activity per rep
  const activity = reps.map((rep) => {
    const repLeads = (leads ?? []).filter((l) => l.owner_rep_id === rep.id)
    const repMessages = (messages ?? []).filter((m) => m.rep_id === rep.id)
    const outreachCount = repMessages.filter((m) => m.type !== 'reply').length
    const replyCount = repMessages.filter((m) => m.type === 'reply').length

    // Find last activity timestamp
    const allTimestamps = [
      ...repLeads.map((l) => l.created_at),
      ...repMessages.map((m) => m.sent_at),
    ].filter(Boolean).sort().reverse()
    const lastActivityAt = allTimestamps[0] ?? null

    return {
      repId: rep.id,
      repName: rep.name,
      leadsSaved: repLeads.length,
      outreachRecorded: outreachCount,
      repliesHandled: replyCount,
      lastActivityAt,
    }
  })

  // Sort: most active first, then by name
  activity.sort((a, b) => {
    const aTotal = a.leadsSaved + a.outreachRecorded + a.repliesHandled
    const bTotal = b.leadsSaved + b.outreachRecorded + b.repliesHandled
    if (bTotal !== aTotal) return bTotal - aTotal
    return a.repName.localeCompare(b.repName)
  })

  return NextResponse.json(activity)
}
