/**
 * Regression contracts for the Nov 27 bug sheet.
 */
import { describe, expect, it } from 'vitest'
import { normalizeClientGreeting } from '@/lib/ai/draft'
import type { DraftInput } from '@/lib/ai/draft'
import { deriveConversationRow } from '@/lib/operations/conversations'
import { ACTIVITY_REGISTRY } from '@/lib/responsibility/activity-registry'

function draftInput(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    leadId: 'lead-1',
    lead: { id: 'lead-1', contactName: 'Aneeb Iqbal' },
    extracted: { name: 'Aneeb Iqbal', signalType: 7, signalEvidence: 'hiring backend' },
    score: { total: 8 } as DraftInput['score'],
    type: 'connection',
    styleCard: null,
    facts: [],
    plays: [],
    ...overrides,
  } as DraftInput
}

describe('BUG-47 greeting consistency', () => {
  it('normalizes a model draft that opens with a different greeting', () => {
    expect(normalizeClientGreeting('Hi Aneeb — noticed the hiring search.', draftInput()))
      .toBe('Hey Aneeb — noticed the hiring search.')
  })

  it('adds the client name when the draft opened without any greeting', () => {
    expect(normalizeClientGreeting('Noticed the hiring search at your company.', draftInput()))
      .toMatch(/^Hey Aneeb — noticed the hiring search/)
  })

  it('uses the configured greeting when present', () => {
    expect(normalizeClientGreeting('Hello Aneeb — noted.', draftInput({ styleCard: { greeting: 'Hi' } as DraftInput['styleCard'] })))
      .toMatch(/^Hi Aneeb/)
  })

  it('never leaves an empty name', () => {
    expect(normalizeClientGreeting('Hey  — noted.', draftInput({ extracted: { name: '' }, lead: { id: 'l', contactName: null } })))
      .toMatch(/^Hey there/)
  })
})

describe('BUG-46 live follow-up decision', () => {
  const now = Date.now()

  function row(overrides: Partial<Parameters<typeof deriveConversationRow>[1]> = {}) {
    return deriveConversationRow(
      { id: 'lead-1', contactName: 'Client', company: 'Acme', companyKey: 'acme', ownerRepId: null, profileName: null, status: 'followed_up' },
      {
        stage: 'contacted',
        lastSentAt: new Date(now - 7 * 86_400_000).toISOString(),
        lastReplyAt: null,
        nextFollowupAt: new Date(now - 86_400_000).toISOString(),
        wonAt: null,
        lostAt: null,
        ...overrides,
      },
      null,
      now,
    )
  }

  it('ignores a stale past snapshot once all follow-ups are used', () => {
    expect(row({ followupCount: 3 })?.state).toBe('waiting_on_prospect')
  })

  it('still surfaces a genuinely due follow-up under the live cadence', () => {
    // count 1, last outbound 5 days ago: the 6-day cadence is not met yet,
    // even though the stored snapshot says the past.
    const fiveDaysAgo = { lastSentAt: new Date(now - 5 * 86_400_000).toISOString() }
    expect(row({ followupCount: 1, ...fiveDaysAgo })?.state).toBe('waiting_on_prospect')
    // count 0, last outbound 3+ days ago: first follow-up is due.
    expect(row({ followupCount: 0, nextFollowupAt: null })?.state).toBe('follow_up_due')
  })
})

describe('BUG-44 extraction action', () => {
  it('has its own credited activity, separate from application submission', () => {
    expect(ACTIVITY_REGISTRY.job_extracted.targetable).toBe(true)
    expect(ACTIVITY_REGISTRY.job_extracted.sourceEventTypes).toContain('UPWORK_JOB_EXTRACTED')
    expect(ACTIVITY_REGISTRY.application_submitted.key).toBe('application_submitted')
  })
})
