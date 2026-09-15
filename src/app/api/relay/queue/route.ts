import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { buildRoleContext } from '@/lib/relay/role-intelligence'
import { buildRelayQueue } from '@/lib/relay/queue-engine'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
  }

  const store = await createScoutStore()
  const roleContext = buildRoleContext(user.rep, user.organization)

  const [dash, relayData] = await Promise.all([
    store.getTodayDashboard(),
    store.getRelayQueueData(),
  ])

  const queue = buildRelayQueue({
    roleContext,
    queueData: dash.mine,
    followupsDue: dash.followupsDue,
    upwork: dash.upwork,
    conversations: relayData.conversations,
    messagesByLead: relayData.messagesByLead,
    messagesByJob: relayData.messagesByJob,
    assignedProfiles: relayData.assignedProfiles,
  })

  return NextResponse.json(queue)
}
