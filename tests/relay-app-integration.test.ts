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
    // Counts are live business data and shift as replies/follow-ups move; the
    // guard is the scope, not the exact number. A leaked RLS policy would
    // return the whole organization's queue (~978 leads), not one rep's.
    expect(queue.counts.all).toBeGreaterThan(0)
    expect(queue.counts.all).toBeLessThan(500)
    expect(queue.counts.all).toBeGreaterThanOrEqual(queue.counts.waiting_them)
    expect(queue.counts.all).toBeGreaterThanOrEqual(queue.counts.followups)
    expect(queue.rows.length).toBeGreaterThan(0)
  }, 30_000)
})
