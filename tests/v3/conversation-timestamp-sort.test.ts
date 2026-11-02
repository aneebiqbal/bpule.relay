/** Conversation thread ordering must survive non-string timestamps. */
import { describe, expect, it } from 'vitest'
import { compareTimestamps, toComparableTimestamp } from '@/lib/domain/timestamps'
import { buildThread } from '@/lib/conversation/thread'
import type { LeadDetail } from '@/lib/store/types'

function leadWithMessages(messages: Array<Record<string, unknown>>): LeadDetail {
  return {
    id: 'lead-1',
    messages,
    direction: 'outbound',
    inboundMessage: null,
    createdAt: '2026-11-02T09:00:00.000Z',
  } as unknown as LeadDetail
}

describe('CONVERSATION_TIMESTAMP_SORT_NON_STRING', () => {
  it('normalizes Date and numeric timestamps to comparable strings', () => {
    expect(toComparableTimestamp(new Date('2026-11-02T10:00:00Z'))).toBe('2026-11-02T10:00:00.000Z')
    expect(toComparableTimestamp(Date.parse('2026-11-02T10:00:00Z'))).toBe('2026-11-02T10:00:00.000Z')
    expect(toComparableTimestamp(null)).toBe('')
  })

  it('sorts mixed string, Date and numeric timestamps without throwing', () => {
    const at = new Date('2026-11-02T10:00:00Z')
    expect(() => compareTimestamps(at, '2026-11-02T09:00:00Z')).not.toThrow()
    expect(compareTimestamps('2026-11-02T09:00:00Z', at)).toBeLessThan(0)
  })

  it('builds an ordered thread when sentAt arrives as a Date', () => {
    const thread = buildThread(
      leadWithMessages([
        { id: 'm2', direction: 'inbound', sentText: 'Later', type: 'reply', sentAt: new Date('2026-11-02T10:00:00Z') },
        { id: 'm1', direction: 'outbound', sentText: 'First', type: 'dm', sentAt: '2026-11-02T09:00:00Z' },
      ]),
    )
    expect(thread.map((turn) => turn.id)).toEqual(['m1', 'm2'])
  })
})
