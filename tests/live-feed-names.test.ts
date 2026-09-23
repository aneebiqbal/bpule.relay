import { describe, expect, it } from 'vitest'
import { assembleWhoSentWhat, displayRepName } from '@/lib/relay/live-feed'

describe('who sent what today', () => {
  it('names every teammate and never prints an id', () => {
    const rows = assembleWhoSentWhat({
      reps: [
        { id: 'rep-dawood', name: 'Dawood', authUserId: 'aaaaaaaa-0000-0000-0000-000000000006' },
        { id: 'rep-ahmad', name: 'Ahmad' },
        { id: 'rep-sara', name: 'Sara' },
      ],
      messages: [
        { repId: 'rep-dawood', type: 'dm' },
        { repId: 'aaaaaaaa-0000-0000-0000-000000000006', type: 'connection' },
        { repId: 'rep-ahmad', type: 'followup' },
        { repId: 'not-a-rep', type: 'dm' },
      ],
    })

    expect(rows.map((row) => row.name)).toEqual(['Dawood', 'Ahmad', 'Sara'])
    expect(rows[0].total).toBe(2)
    expect(rows[2].total).toBe(0)
    expect(rows.some((row) => row.name.includes('aaaaaaaa'))).toBe(false)
  })

  it('rejects a uuid stored as a name', () => {
    expect(displayRepName('aaaaaaaa-0000-0000-0000-000000000006')).toBeNull()
    expect(displayRepName('  Dawood ')).toBe('Dawood')
  })
})