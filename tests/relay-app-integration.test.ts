import { describe, expect, it } from 'vitest'
import { neonDbClient } from '@/lib/db/neon'
import { loadChatQueue } from '@/lib/operations/chat-queue'

const ORG = '11111111-1111-1111-1111-111111111111'
const REP = 'ec4f844d-24ca-4fb5-ae4f-4138244abace'
const AUTH_USER = '02b2d1bc-346c-469c-86cd-a200e6b74a43'

describe('relay_app integration', () => {
  it('loads the canonical queue as relay_app', async () => {
    const client = neonDbClient(AUTH_USER)
    const queue = await loadChatQueue(client, {
      orgId: ORG,
      repIds: [REP],
      executableIdentities: [
        { id: 'c26a685b-a18b-4672-b7ad-a55e211539b2', profileId: 'f67c1ba3-69bd-43a4-8410-7b35e0b79d44' },
        { id: '44af6e41-a501-42cc-8904-65494623dcce', profileId: 'cdbc68b6-61e3-484e-8611-980682e2cc5b' },
      ],
      coveredIdentityIds: [],
      view: 'all',
      managerViews: false,
    })
    console.log('RELAY_APP counts:', JSON.stringify(queue.counts), 'rows:', queue.rows.length)
    expect(queue.counts.waiting_me).toBe(2)
    expect(queue.counts.waiting_them).toBe(85)
    expect(queue.counts.followups).toBe(101)
    expect(queue.counts.all).toBe(188)
  }, 30_000)
})
