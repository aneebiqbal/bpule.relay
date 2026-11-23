/**
 * UI-recovery regression contracts.
 *
 * Pins the authority rule that keeps the Inbox queue, the thread context and the
 * conversation writes from disagreeing (managers opening a teammate's lead,
 * covering reps acting on a covered profile), plus the Work Setup conflict
 * explanation.
 */
import { describe, expect, it } from 'vitest'
import { buildMockStore } from '@/lib/store/mock-store'
import { canOpenConversationLead } from '@/lib/operations/chat-intelligence'
import { workSetupConflictLines } from '@/components/operations/work-setup'
import type { Rep } from '@/lib/domain/types'

const hassan: Rep = { id: 'rep-hassan', name: 'Hassan', role: 'admin', organizationId: 'org-demo', createdAt: '2024-01-01T00:00:00.000Z', timezone: 'UTC' }
const ahmed: Rep = { id: 'rep-ahmed', name: 'Ahmed', role: 'rep', organizationId: 'org-demo', createdAt: '2024-01-01T00:00:00.000Z', timezone: 'UTC' }

/** Team-scope read: the manager's team owns the lead, so it must open. */
describe('CONVERSATION_SCOPE_PARITY', () => {
  it('opens a teammate-owned lead for a team scope, refuses a narrow one', async () => {
    const store = buildMockStore({ rep: ahmed, mode: 'demo' })
    await expect(store.getLead('lead-beacon')).rejects.toThrow(/not the owner/i)
    await expect(store.getLead('lead-beacon', { repIds: ['rep-ahmed'] })).rejects.toThrow(/not the owner/i)
    await expect(store.getLead('lead-beacon', { repIds: ['rep-ahmed', 'rep-hassan'] })).resolves.toBeTruthy()
  })

  it('opens a covered profile for a rep outside the owner scope only via identityIds', async () => {
    const store = buildMockStore({ rep: ahmed, mode: 'demo' })
    const scope = { repIds: ['rep-ahmed'], identityIds: ['identity-covered'] }
    expect(canOpenConversationLead(scope, 'rep-hassan', 'identity-covered', ['identity-covered'])).toBe(true)
    expect(canOpenConversationLead(scope, 'rep-hassan', 'identity-covered', null)).toBe(false)
    // An unrelated identity never authorizes.
    expect(canOpenConversationLead(scope, 'rep-hassan', 'identity-other', ['identity-covered'])).toBe(false)
  })

  it('treats an unscoped admin read as organization-wide', () => {
    expect(canOpenConversationLead({ repIds: null }, 'rep-hassan', null, null)).toBe(true)
  })

  it('lets an authorized actor log a send and record a reply on a teammate lead', async () => {
    const store = buildMockStore({ rep: ahmed, mode: 'demo' })
    const scope = { repIds: ['rep-ahmed', 'rep-hassan'], identityIds: null }
    await expect(
      store.markContacted('lead-beacon', 'Here is the portal rebuild overview.', 'dm', undefined, scope),
    ).resolves.toBeTruthy()
    await expect(
      store.recordProspectReply('lead-acme', 'Thanks, send it over.', { scope }),
    ).resolves.toBeTruthy()
  })
})

describe('WORK_SETUP_CONFLICT_EXPLANATION', () => {
  const reps = [
    { id: 'r1', name: 'Riya' },
    { id: 'r2', name: 'Omar' },
  ]
  const current = {
    primaryRepId: 'r1',
    primaryRepName: 'Riya',
    operators: [{ repId: 'r2', repName: 'Omar' }],
  } as Parameters<typeof workSetupConflictLines>[0]

  it('names the committed primary and operator changes', () => {
    const lines = workSetupConflictLines(current, { primaryRepId: 'r2', operatorIds: [] }, reps)
    expect(lines.some((line) => line.includes('Primary rep is now Riya'))).toBe(true)
    expect(lines.some((line) => line.includes('Operators removed: Omar'))).toBe(true)
  })

  it('stays quiet when nothing relevant changed', () => {
    expect(workSetupConflictLines(current, { primaryRepId: 'r1', operatorIds: ['r2'] }, reps)).toEqual([])
  })
})
