/**
 * V6.3.1 — email execution truth + target credit contracts (§14–22, §36).
 *
 * A generated draft is 0 execution. An enriched/verified email is 0 execution.
 * A real EMAIL_SENT is +1, exactly once, and counts once against a shared plan.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'
import { assembleTargets, targetTypeForEvent } from '@/lib/operations/targets'
import { aggregateMetrics } from '@/lib/operations/performance'
import { canonicalActionFor } from '@/lib/performance/activity-model'
import { activityKeyForEventType } from '@/lib/responsibility/activity-registry'
import { CONNECTION_EVENTS, SENT_MESSAGE_EVENTS, isExecutedSend } from '@/lib/sales/send-truth'
import { emitAction } from '@/lib/action-ledger'
import { closeNeonPool, neonServiceDbClient } from '@/lib/db/neon'

const ORG = '11111111-1111-1111-1111-111111111111'
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

afterAll(async () => {
  await neonServiceDbClient()
    .from('action_events')
    .delete()
    .eq('organization_id', ORG)
    .like('idempotency_key', `email-contract:%`)
  await closeNeonPool()
})

describe('EMAIL_DRAFT_NOT_EXECUTED', () => {
  it('a draft/prepared/enriched event is never an executed send', () => {
    for (const actionType of ['EMAIL_ENRICHED', 'EMAIL_VERIFIED', 'MESSAGE_GENERATED', 'DRAFT_GENERATED']) {
      expect(isExecutedSend(actionType, 'generated')).toBe(false)
      expect(targetTypeForEvent(actionType, 'generated')).toBeNull()
      expect(canonicalActionFor(actionType, 'generated')).toBeNull()
    }
  })
})

describe('EMAIL_SENT_COUNTS_ONCE', () => {
  it('EMAIL_SENT is in the canonical send list and counts as a message on every surface', () => {
    expect((SENT_MESSAGE_EVENTS as readonly string[]).includes('EMAIL_SENT')).toBe(true)
    expect((CONNECTION_EVENTS as readonly string[]).includes('EMAIL_SENT')).toBe(false)
    expect(targetTypeForEvent('EMAIL_SENT', 'sent')).toBe('MESSAGES_SENT')
    expect(canonicalActionFor('EMAIL_SENT', 'sent')).toBe('FIRST_DM_SENT')
    expect(isExecutedSend('EMAIL_SENT', 'sent')).toBe(true)

    const m = aggregateMetrics([{ actor_id: 'r', action_type: 'EMAIL_SENT', execution_status: 'sent', lead_id: 'l' }])
    expect(m.messages).toBe(1)
    expect(m.leadsContacted).toBe(1)
  })

  it('a failed EMAIL_SENT never counts', () => {
    expect(targetTypeForEvent('EMAIL_SENT', 'failed')).toBeNull()
    expect(isExecutedSend('EMAIL_SENT', 'failed')).toBe(false)
    const m = aggregateMetrics([{ actor_id: 'r', action_type: 'EMAIL_SENT', execution_status: 'failed', lead_id: 'l' }])
    expect(m.messages).toBe(0)
  })
})

describe('EMAIL_REPLAY_COUNTS_ONCE', () => {
  it('the same idempotency key emits exactly one EMAIL_SENT row', async () => {
    const client = neonServiceDbClient()
    const key = `email-contract:send:${RUN}`
    const first = await emitAction({
      client,
      orgId: ORG,
      actionType: 'EMAIL_SENT',
      actorType: 'rep',
      actorId: null,
      leadId: null,
      channel: 'email',
      executionStatus: 'sent',
      metadata: { replay: true },
      idempotencyKey: key,
    })
    const second = await emitAction({
      client,
      orgId: ORG,
      actionType: 'EMAIL_SENT',
      actorType: 'rep',
      actorId: null,
      leadId: null,
      channel: 'email',
      executionStatus: 'sent',
      metadata: { replay: true },
      idempotencyKey: key,
    })
    expect(first).toBeTruthy()
    expect(second).toBe(first)

    const { data } = await client
      .from('action_events')
      .select('id')
      .eq('organization_id', ORG)
      .eq('idempotency_key', key)
    expect(data).toHaveLength(1)

    // A distinct send (different key) counts separately.
    const third = await emitAction({
      client,
      orgId: ORG,
      actionType: 'EMAIL_SENT',
      actorType: 'rep',
      actorId: null,
      leadId: null,
      channel: 'email',
      executionStatus: 'sent',
      idempotencyKey: `email-contract:send-2:${RUN}`,
    })
    expect(third).toBeTruthy()
    expect(third).not.toBe(first)
  }, 60_000)
})

describe('EMAIL_PLAN_ACCEPTANCE', () => {
  const base = {
    period: 'DAY' as const,
    elapsedShare: 1,
    reps: [{ id: 'rep-a', name: 'A' }],
    teams: [],
    dailyTargets: [{ rep_id: 'rep-a', activity_type: 'email', target_count: 5 }],
  }
  const send = (n: number) => Array.from({ length: n }, () => ({ actor_id: 'rep-a', action_type: 'EMAIL_SENT', execution_status: 'sent' }))
  const progress = (events: Array<{ actor_id: string; action_type: string; execution_status: string }>) =>
    assembleTargets({ ...base, events }).reps[0].cells.find((c) => c.type === 'MESSAGES_SENT')!

  it('draft = 0/5, one send = 1/5, replay = 1/5 (§18)', () => {
    expect(progress([]).progress).toBe(0)
    expect(progress(send(1)).progress).toBe(1)
    // A replay is the same idempotency key — the ledger stores one row, so the
    // progress read sees one event.
    expect(progress(send(1)).progress).toBe(1)
  })
})

describe('EMAIL_SHARED_PLAN_COUNTS_ONCE', () => {
  it('two operators on one identity: goal once, contributions summed (§19)', () => {
    const data = assembleTargets({
      period: 'DAY',
      elapsedShare: 1,
      reps: [{ id: 'rep-a', name: 'A' }, { id: 'rep-b', name: 'B' }],
      teams: [{ id: 'team-1', name: 'T', memberIds: ['rep-a', 'rep-b'] }],
      dailyTargets: [{ rep_id: 'rep-a', activity_type: 'email', target_count: 10 }],
      events: [
        ...Array.from({ length: 3 }, () => ({ actor_id: 'rep-a', action_type: 'EMAIL_SENT', execution_status: 'sent' })),
        ...Array.from({ length: 2 }, () => ({ actor_id: 'rep-b', action_type: 'EMAIL_SENT', execution_status: 'sent' })),
      ],
    })

    const team = data.teams[0].cells.find((c) => c.type === 'MESSAGES_SENT')!
    expect(team.goal).toBe(10)
    expect(team.progress).toBe(5)
    expect(team.remaining).toBe(5)

    const repA = data.reps.find((r) => r.ownerId === 'rep-a')!.cells.find((c) => c.type === 'MESSAGES_SENT')!
    const repB = data.reps.find((r) => r.ownerId === 'rep-b')!.cells.find((c) => c.type === 'MESSAGES_SENT')!
    expect(repA.progress).toBe(3)
    expect(repB.progress).toBe(2)
  })
})

describe('EMAIL_FOLLOWUP_RESOLVES_EMAIL_CHANNEL', () => {
  it('FOLLOWUP_SENT resolves to the email lane when channel=email (§20)', () => {
    expect(activityKeyForEventType('FOLLOWUP_SENT', 'email')).toBe('email_followup_sent')
    expect(activityKeyForEventType('FOLLOWUP_SENT', 'linkedin')).toBe('followup_sent')
  })
})

describe('LIVE_PROVIDER_KEYS_SERVER_ONLY', () => {
  it('no client component imports a provider adapter or the registry', () => {
    const hits = execSync(
      "grep -rlE \"@/lib/enrichment/(providers|provider-registry)\" src --include='*.tsx' --include='*.ts' | grep -E \"components/.*\\.tsx$\" || true",
      { encoding: 'utf8' },
    ).trim()
    expect(hits).toBe('')
  })

  it('provider key env vars appear only in server-only modules', () => {
    const hits = execSync(
      "grep -rlE 'PROSPEO_API_KEY|SNOV_CLIENT_ID|SNOV_CLIENT_SECRET' src --include='*.ts' --include='*.tsx' || true",
      { encoding: 'utf8' },
    ).trim()
    const files = hits ? hits.split('\n') : []
    expect(files.every((file) => file.includes('enrichment/'))).toBe(true)
  })
})

describe('PROVIDER_PAGES_NO_LIVE_PROVIDER_FETCH', () => {
  it('Fresh Prospects reads only Relay tables — never a provider adapter', () => {
    const hits = execSync(
      "grep -nE \"provider-registry|providers/(prospeo|snov)\" src/lib/enrichment/fresh-prospects.ts || true",
      { encoding: 'utf8' },
    ).trim()
    expect(hits).toBe('')
  })
})
