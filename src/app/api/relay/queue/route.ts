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
  // Read-only queue: one lead snapshot serves the dashboard, the queue and the
  // admin lead scan instead of three full projections.
  store.beginReadOnlySnapshot()
  const roleContext = buildRoleContext(user.rep, user.organization)

  const [dash, relayData, allLeads, suppressedLeadIds] = await Promise.all([
    store.getTodayDashboard(),
    store.getRelayQueueData(),
    store.fetchLeadsAll(),
    store.getSuppressedLeadIds(),
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
    allLeads,
    suppressedLeadIds,
  })

  return NextResponse.json(queue)
}
