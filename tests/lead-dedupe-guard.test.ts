import { describe, expect, it } from 'vitest'
import { buildMockStore } from '@/lib/store/mock-store'

const REP = {
  id: 'rep-hassan',
  name: 'Hassan (demo)',
  role: 'admin' as const,
  organizationId: '11111111-1111-1111-1111-111111111111',
  createdAt: new Date().toISOString(),
  timezone: 'UTC',
}

describe('Lead dedupe guard', () => {
  it('blocks duplicate lead by normalized profile URL', async () => {
    const store = buildMockStore({ rep: REP, mode: 'demo' })

    const result = await store.createLead({
      company: 'Different Name LLC',
      contactName: 'Another Person',
      signalType: 1,
      signalEvidence: 'Hiring now for backend role.',
      url: 'https://example.com/acme/',
    })

    expect(result.blocked).toBe(true)
    expect(result.duplicateKind).toBe('hard')
    expect(result.lead?.id).toBe('lead-acme')
  })

  it('blocks duplicate lead by company + contact', async () => {
    const store = buildMockStore({ rep: REP, mode: 'demo' })

    const result = await store.createLead({
      company: 'Acme Nail Polish Co',
      contactName: 'Priya Sharma',
      signalType: 1,
      signalEvidence: 'Hiring for engineering growth.',
    })

    expect(result.blocked).toBe(true)
    expect(result.duplicateKind).toBe('hard')
    expect(result.lead?.company).toBe('Acme Nail Polish Co')
  })

  it('classifies exact same-company duplicates as hard and ignores override flag', async () => {
    const store = buildMockStore({ rep: REP, mode: 'demo' })

    const blocked = await store.createLead({
      company: 'Acme Nail Polish Co',
      contactName: 'Sarah Chen',
      signalType: 1,
      signalEvidence: 'Hiring two staff engineers for migration.',
    })

    expect(blocked.blocked).toBe(true)
    expect(blocked.duplicateKind).toBe('hard')

    const stillBlocked = await store.createLead({
      company: 'Acme Nail Polish Co',
      contactName: 'Sarah Chen',
      signalType: 1,
      signalEvidence: 'Hiring two staff engineers for migration.',
      allowPotentialDuplicate: true,
    })

    expect(stillBlocked.blocked).toBe(true)
    expect(stillBlocked.duplicateKind).toBe('hard')
  })

  it('allows explicit override for potential fuzzy-company duplicates', async () => {
    const store = buildMockStore({ rep: REP, mode: 'demo' })

    const blocked = await store.createLead({
      company: 'Acme Nail Polish LLC',
      contactName: 'Sarah Chen',
      signalType: 1,
      signalEvidence: 'Hiring two staff engineers for migration.',
    })

    expect(blocked.blocked).toBe(true)
    expect(blocked.duplicateKind).toBe('potential')

    const allowed = await store.createLead({
      company: 'Acme Nail Polish LLC',
      contactName: 'Sarah Chen',
      signalType: 1,
      signalEvidence: 'Hiring two staff engineers for migration.',
      allowPotentialDuplicate: true,
    })

    expect(allowed.blocked).toBe(false)
    expect(allowed.lead?.company).toBe('Acme Nail Polish LLC')
  })
})
