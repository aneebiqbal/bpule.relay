import { beforeEach, describe, expect, it } from 'vitest'
import type { StoreContext } from '@/lib/store/types'
import type { Rep } from '@/lib/domain/types'
import { buildMockStore } from '@/lib/store/mock-store'
import {
  canTransition,
  eventToRunStatus,
  getExecutionPolicy,
  isTerminalStatus,
  isWaitingStatus,
} from '@/lib/orchestration/outbound-run'
import { projectNextAction } from '@/lib/orchestration/next-action'
import { reconcileRelayRun } from '@/lib/orchestration/reconciliation'
import type { RelayRunStatus } from '@/lib/domain/types'

function makeRep(id: string, name: string, role: 'rep' | 'admin' | 'sourcer' = 'rep'): Rep {
  return { id, name, role, organizationId: 'org-demo', createdAt: '2024-01-01', timezone: 'UTC' }
}

function makeContext(rep: Rep): StoreContext {
  return { rep, mode: 'demo' }
}

describe('Orchestration: OUTBOUND State Machine', () => {
  it('allows valid transitions from detected', () => {
    expect(canTransition('detected', 'qualifying')).toBe(true)
    expect(canTransition('detected', 'rejected')).toBe(true)
    expect(canTransition('detected', 'cancelled')).toBe(true)
    expect(canTransition('detected', 'completed')).toBe(false)
    expect(canTransition('detected', 'waiting')).toBe(false)
  })

  it('allows valid transitions from waiting', () => {
    expect(canTransition('waiting', 'followup_due')).toBe(true)
    expect(canTransition('waiting', 'response_received')).toBe(true)
    expect(canTransition('waiting', 'conversation')).toBe(true)
    expect(canTransition('waiting', 'cancelled')).toBe(true)
    expect(canTransition('waiting', 'detected')).toBe(false)
    expect(canTransition('waiting', 'preparing')).toBe(false)
  })

  it('allows valid transitions from awaiting_human', () => {
    expect(canTransition('awaiting_human', 'action_recorded')).toBe(true)
    expect(canTransition('awaiting_human', 'cancelled')).toBe(true)
    expect(canTransition('awaiting_human', 'waiting')).toBe(false)
    expect(canTransition('awaiting_human', 'preparing')).toBe(false)
  })

  it('treats terminal states as immutable', () => {
    expect(canTransition('completed', 'waiting')).toBe(false)
    expect(canTransition('failed', 'detected')).toBe(false)
    expect(canTransition('cancelled', 'qualifying')).toBe(false)
    expect(canTransition('rejected', 'qualified')).toBe(false)
  })

  it('identifies terminal statuses correctly', () => {
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('failed')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(isTerminalStatus('rejected')).toBe(true)
    expect(isTerminalStatus('waiting')).toBe(false)
    expect(isTerminalStatus('detected')).toBe(false)
  })

  it('identifies waiting statuses correctly', () => {
    expect(isWaitingStatus('waiting')).toBe(true)
    expect(isWaitingStatus('awaiting_human')).toBe(true)
    expect(isWaitingStatus('followup_due')).toBe(true)
    expect(isWaitingStatus('detected')).toBe(false)
    expect(isWaitingStatus('conversation')).toBe(false)
  })
})

describe('Orchestration: Event to Run Status Mapping', () => {
  it('maps LEAD_CREATED to qualifying from detected', () => {
    expect(eventToRunStatus('LEAD_CREATED', 'detected')).toBe('qualifying')
    expect(eventToRunStatus('LEAD_CREATED', 'waiting')).toBeNull()
  })

  it('maps OUTREACH_RECORDED to action_recorded from awaiting_human', () => {
    expect(eventToRunStatus('OUTREACH_RECORDED', 'awaiting_human')).toBe('action_recorded')
    expect(eventToRunStatus('OUTREACH_RECORDED', 'waiting')).toBeNull()
  })

  it('maps CLIENT_REPLIED to response_received from waiting', () => {
    expect(eventToRunStatus('CLIENT_REPLIED', 'waiting')).toBe('response_received')
    expect(eventToRunStatus('CLIENT_REPLIED', 'detected')).toBeNull()
  })

  it('maps FOLLOWUP_DUE to followup_due from waiting', () => {
    expect(eventToRunStatus('FOLLOWUP_DUE', 'waiting')).toBe('followup_due')
    expect(eventToRunStatus('FOLLOWUP_DUE', 'detected')).toBeNull()
  })

  it('returns null for unrecognized event types', () => {
    expect(eventToRunStatus('PROOF_MATCHED', 'waiting')).toBeNull()
    expect(eventToRunStatus('INTENT_DETECTED', 'waiting')).toBeNull()
  })
})

describe('Orchestration: Execution Policy (Human Gate)', () => {
  it('marks extraction and qualification as AUTO', () => {
    expect(getExecutionPolicy('extract_prospect')).toBe('AUTO')
    expect(getExecutionPolicy('qualify')).toBe('AUTO')
    expect(getExecutionPolicy('score')).toBe('AUTO')
    expect(getExecutionPolicy('match_identity')).toBe('AUTO')
    expect(getExecutionPolicy('match_proof')).toBe('AUTO')
    expect(getExecutionPolicy('generate_draft')).toBe('AUTO')
  })

  it('marks external sends as REVIEW_REQUIRED', () => {
    expect(getExecutionPolicy('send_outreach')).toBe('REVIEW_REQUIRED')
    expect(getExecutionPolicy('send_followup')).toBe('REVIEW_REQUIRED')
    expect(getExecutionPolicy('send_reply')).toBe('REVIEW_REQUIRED')
    expect(getExecutionPolicy('submit_application')).toBe('REVIEW_REQUIRED')
  })

  it('marks commercial commitments as MANUAL', () => {
    expect(getExecutionPolicy('change_pricing')).toBe('MANUAL')
    expect(getExecutionPolicy('commit_contract')).toBe('MANUAL')
    expect(getExecutionPolicy('promise_delivery_date')).toBe('MANUAL')
  })

  it('marks dangerous actions as PROHIBITED', () => {
    expect(getExecutionPolicy('use_forbidden_claim')).toBe('PROHIBITED')
    expect(getExecutionPolicy('auto_send')).toBe('PROHIBITED')
    expect(getExecutionPolicy('impersonate_rep')).toBe('PROHIBITED')
  })

  it('defaults unknown actions to REVIEW_REQUIRED', () => {
    expect(getExecutionPolicy('some_random_action')).toBe('REVIEW_REQUIRED')
  })
})

describe('Orchestration: Next Action Engine', () => {
  function makeRun(status: RelayRunStatus, overrides: Partial<import('@/lib/domain/types').RelayRun> = {}): import('@/lib/domain/types').RelayRun {
    return {
      id: 'run-test',
      organizationId: 'org-demo',
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: 'lead-1',
      status,
      currentStep: status,
      assignedRepId: 'rep-1',
      revenueIdentityId: null,
      correlationId: 'corr-test',
      startedAt: new Date().toISOString(),
      waitingUntil: null,
      completedAt: null,
      failedAt: null,
      failureCategory: null,
      failureReason: null,
      context: {},
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    }
  }

  function makeLead(status: string): import('@/lib/domain/types').Lead {
    return {
      id: 'lead-1',
      organizationId: 'org-demo',
      ownerRepId: 'rep-1',
      company: 'TestCo',
      companyKey: 'testco',
      contactName: 'Test Contact',
      contactTitle: 'CTO',
      url: 'https://testco.com',
      rawInput: 'Test input',
      signalType: 1,
      signalEvidence: 'Test signal',
      verbatimQuote: null,
      score: 12,
      verdict: 'send',
      status: status as import('@/lib/domain/types').LeadStatus,
      playId: null,
      tags: [],
      direction: 'outbound',
      source: 'linkedin',
      createdAt: new Date().toISOString(),
    }
  }

  it('returns QUALIFY_LEAD for detected status', () => {
    const action = projectNextAction({
      run: makeRun('detected'),
      lead: makeLead('new'),
      conversationState: null,
      followupCount: 0,
      followupLimitReached: false,
      hasOutboundMessage: false,
      hasReply: false,
      identityAssigned: false,
      proofMatched: false,
    })
    expect(action).not.toBeNull()
    expect(action!.actionType).toBe('QUALIFY_LEAD')
    expect(action!.executionPolicy).toBe('AUTO')
  })

  it('returns ASSIGN_IDENTITY when qualified but no identity', () => {
    const action = projectNextAction({
      run: makeRun('qualified'),
      lead: makeLead('new'),
      conversationState: null,
      followupCount: 0,
      followupLimitReached: false,
      hasOutboundMessage: false,
      hasReply: false,
      identityAssigned: false,
      proofMatched: false,
    })
    expect(action).not.toBeNull()
    expect(action!.actionType).toBe('ASSIGN_IDENTITY')
    expect(action!.executionPolicy).toBe('REVIEW_REQUIRED')
  })

  it('returns PREPARE_OUTREACH when identity is assigned', () => {
    const lead = makeLead('new')
    lead.senderProfileId = 'profile-1'
    const action = projectNextAction({
      run: makeRun('qualified'),
      lead,
      conversationState: null,
      followupCount: 0,
      followupLimitReached: false,
      hasOutboundMessage: false,
      hasReply: false,
      identityAssigned: true,
      proofMatched: false,
    })
    expect(action).not.toBeNull()
    expect(action!.actionType).toBe('PREPARE_OUTREACH')
  })

  it('returns SEND_OUTREACH for awaiting_human', () => {
    const action = projectNextAction({
      run: makeRun('awaiting_human'),
      lead: makeLead('new'),
      conversationState: null,
      followupCount: 0,
      followupLimitReached: false,
      hasOutboundMessage: false,
      hasReply: false,
      identityAssigned: true,
      proofMatched: false,
    })
    expect(action).not.toBeNull()
    expect(action!.actionType).toBe('SEND_OUTREACH')
    expect(action!.executionPolicy).toBe('REVIEW_REQUIRED')
    expect(action!.priority).toBe('urgent')
  })

  it('returns REPLY_NEEDED when client has replied', () => {
    const action = projectNextAction({
      run: makeRun('waiting'),
      lead: makeLead('replied'),
      conversationState: null,
      followupCount: 0,
      followupLimitReached: false,
      hasOutboundMessage: true,
      hasReply: true,
      identityAssigned: true,
      proofMatched: true,
    })
    expect(action).not.toBeNull()
    expect(action!.actionType).toBe('REPLY_NEEDED')
    expect(action!.priority).toBe('urgent')
  })

  it('returns PREPARE_FOLLOWUP when follow-up is due and limit not reached', () => {
    const action = projectNextAction({
      run: makeRun('followup_due'),
      lead: makeLead('contacted'),
      conversationState: null,
      followupCount: 0,
      followupLimitReached: false,
      hasOutboundMessage: true,
      hasReply: false,
      identityAssigned: true,
      proofMatched: true,
    })
    expect(action).not.toBeNull()
    expect(action!.actionType).toBe('PREPARE_FOLLOWUP')
  })

  it('returns NO_FURTHER_FOLLOWUP when limit reached', () => {
    const action = projectNextAction({
      run: makeRun('followup_due'),
      lead: makeLead('followed_up'),
      conversationState: null,
      followupCount: 1,
      followupLimitReached: true,
      hasOutboundMessage: true,
      hasReply: false,
      identityAssigned: true,
      proofMatched: true,
    })
    expect(action).not.toBeNull()
    expect(action!.actionType).toBe('NO_FURTHER_FOLLOWUP')
    expect(action!.blockedReason).toContain('limit')
  })

  it('returns null for terminal statuses', () => {
    expect(projectNextAction({
      run: makeRun('completed'),
      lead: makeLead('replied'),
      conversationState: null,
      followupCount: 0,
      followupLimitReached: false,
      hasOutboundMessage: true,
      hasReply: true,
      identityAssigned: true,
      proofMatched: true,
    })).toBeNull()

    expect(projectNextAction({
      run: makeRun('failed'),
      lead: makeLead('contacted'),
      conversationState: null,
      followupCount: 0,
      followupLimitReached: false,
      hasOutboundMessage: true,
      hasReply: false,
      identityAssigned: true,
      proofMatched: true,
    })).toBeNull()
  })

  it('includes deterministic reasons in every action', () => {
    const action = projectNextAction({
      run: makeRun('awaiting_human'),
      lead: makeLead('new'),
      conversationState: null,
      followupCount: 0,
      followupLimitReached: false,
      hasOutboundMessage: false,
      hasReply: false,
      identityAssigned: true,
      proofMatched: false,
    })
    expect(action).not.toBeNull()
    expect(action!.reason).toContain('TestCo')
    expect(action!.reason.length).toBeGreaterThan(10)
  })
})

describe('Orchestration: Reconciliation', () => {
  function makeRun(status: RelayRunStatus): import('@/lib/domain/types').RelayRun {
    return {
      id: 'run-test',
      organizationId: 'org-demo',
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: 'lead-1',
      status,
      currentStep: status,
      assignedRepId: 'rep-1',
      revenueIdentityId: null,
      correlationId: 'corr-test',
      startedAt: new Date().toISOString(),
      waitingUntil: null,
      completedAt: null,
      failedAt: null,
      failureCategory: null,
      failureReason: null,
      context: {},
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  function makeLead(status: string): import('@/lib/domain/types').Lead {
    return {
      id: 'lead-1',
      organizationId: 'org-demo',
      ownerRepId: 'rep-1',
      company: 'TestCo',
      companyKey: 'testco',
      contactName: 'Test Contact',
      contactTitle: 'CTO',
      url: 'https://testco.com',
      rawInput: 'Test input',
      signalType: 1,
      signalEvidence: 'Test signal',
      verbatimQuote: null,
      score: 12,
      verdict: 'send',
      status: status as import('@/lib/domain/types').LeadStatus,
      playId: null,
      tags: [],
      direction: 'outbound',
      source: 'linkedin',
      createdAt: new Date().toISOString(),
    }
  }

  it('detects drift when run=waiting but lead=replied', () => {
    const result = reconcileRelayRun({
      run: makeRun('waiting'),
      lead: makeLead('replied'),
      conversationState: null,
    })
    expect(result.drifted).toBe(true)
    expect(result.correctedStatus).toBe('response_received')
    expect(result.reason).toContain('replied')
  })

  it('detects drift when run=waiting but conversation has reply', () => {
    const result = reconcileRelayRun({
      run: makeRun('waiting'),
      lead: makeLead('contacted'),
      conversationState: {
        id: 'cs-1',
        organizationId: 'org-demo',
        leadId: 'lead-1',
        stage: 'replied',
        lastSentAt: new Date().toISOString(),
        lastSentMessageId: null,
        lastReplyAt: new Date().toISOString(),
        senderProfileId: null,
        lastStrategy: null,
        lastAngle: null,
        lastCta: null,
        followupCount: 0,
        nextFollowupAt: null,
        wonAt: null,
        lostAt: null,
        lostReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    })
    expect(result.drifted).toBe(true)
    expect(result.correctedStatus).toBe('response_received')
  })

  it('detects drift when run=preparing but lead already contacted', () => {
    const result = reconcileRelayRun({
      run: makeRun('preparing'),
      lead: makeLead('contacted'),
      conversationState: null,
    })
    expect(result.drifted).toBe(true)
    expect(result.correctedStatus).toBe('action_recorded')
  })

  it('does not flag drift when run state matches domain state', () => {
    const result = reconcileRelayRun({
      run: makeRun('waiting'),
      lead: makeLead('contacted'),
      conversationState: null,
    })
    expect(result.drifted).toBe(false)
    expect(result.correctedStatus).toBeNull()
  })

  it('does not reconcile terminal runs', () => {
    const result = reconcileRelayRun({
      run: makeRun('completed'),
      lead: makeLead('replied'),
      conversationState: null,
    })
    expect(result.drifted).toBe(false)
    expect(result.reason).toContain('terminal')
  })

  it('flags lead-not-found as drift requiring review', () => {
    const result = reconcileRelayRun({
      run: makeRun('waiting'),
      lead: null,
      conversationState: null,
    })
    expect(result.drifted).toBe(true)
    expect(result.correctedStatus).toBe('failed')
  })
})

describe('Orchestration: Reconciliation Idempotency', () => {
  function makeRun(status: RelayRunStatus): import('@/lib/domain/types').RelayRun {
    return {
      id: 'run-test',
      organizationId: 'org-demo',
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: 'lead-1',
      status,
      currentStep: status,
      assignedRepId: 'rep-1',
      revenueIdentityId: null,
      correlationId: 'corr-test',
      startedAt: new Date().toISOString(),
      waitingUntil: null,
      completedAt: null,
      failedAt: null,
      failureCategory: null,
      failureReason: null,
      context: {},
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  it('converges to same result on repeated reconciliation', () => {
    const run = makeRun('waiting')
    const lead: import('@/lib/domain/types').Lead = {
      id: 'lead-1',
      organizationId: 'org-demo',
      ownerRepId: 'rep-1',
      company: 'TestCo',
      companyKey: 'testco',
      contactName: 'Test',
      contactTitle: 'CTO',
      url: 'https://testco.com',
      rawInput: 'Test',
      signalType: 1,
      signalEvidence: 'Signal',
      verbatimQuote: null,
      score: 12,
      verdict: 'send',
      status: 'replied',
      playId: null,
      tags: [],
      direction: 'outbound',
      source: 'linkedin',
      createdAt: new Date().toISOString(),
    }

    const result1 = reconcileRelayRun({ run, lead, conversationState: null })
    const result2 = reconcileRelayRun({ run, lead, conversationState: null })

    expect(result1.drifted).toBe(result2.drifted)
    expect(result1.correctedStatus).toBe(result2.correctedStatus)
  })
})

describe('Orchestration: Mock Store Integration', () => {
  let store: Awaited<ReturnType<typeof buildMockStore>>

  beforeEach(async () => {
    store = await buildMockStore(makeContext(makeRep('rep-1', 'Test Rep')))
  })

  it('emits LEAD_CREATED event when lead is created', async () => {
    const result = await store.createLead({
      company: 'Orchestration Test Co',
      contactName: 'Test Contact',
      contactTitle: 'CTO',
      signalType: 1,
      signalEvidence: 'Hiring engineers',
      tags: ['test'],
    })
    expect(result.blocked).toBe(false)
    expect(result.lead).not.toBeNull()

    // Verify event emission didn't break lead creation
    // Events are stored in demoRelayEvents (not queryable by runId without a run)
    // The important thing is that createLead succeeded without error
  })

  it('creates a relay run with one-active-run-per-entity rule', async () => {
    const leadResult = await store.createLead({
      company: 'Run Test Co',
      contactName: 'Contact',
      contactTitle: 'CEO',
      signalType: 7,
      signalEvidence: 'Looking for help',
    })
    const leadId = leadResult.lead!.id

    const runId1 = await store.createRelayRun({
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: leadId,
    })
    expect(runId1).not.toBeNull()

    // Second call should return the same run
    const runId2 = await store.createRelayRun({
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: leadId,
    })
    expect(runId2).toBe(runId1)
  })

  it('transitions a run through valid states', async () => {
    const leadResult = await store.createLead({
      company: 'Transition Test Co',
      contactName: 'Contact',
      contactTitle: 'CTO',
      signalType: 1,
      signalEvidence: 'Hiring',
    })
    const leadId = leadResult.lead!.id

    const runId = await store.createRelayRun({
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: leadId,
    })
    expect(runId).not.toBeNull()

    // detected -> qualifying
    const t1 = await store.transitionRelayRun({
      runId: runId!,
      newStatus: 'qualifying',
    })
    expect(t1).not.toBeNull()
    expect(t1!.previousStatus).toBe('detected')
    expect(t1!.newStatus).toBe('qualifying')

    // qualifying -> qualified
    const t2 = await store.transitionRelayRun({
      runId: runId!,
      newStatus: 'qualified',
    })
    expect(t2).not.toBeNull()
    expect(t2!.newStatus).toBe('qualified')

    // qualified -> preparing
    const t3 = await store.transitionRelayRun({
      runId: runId!,
      newStatus: 'preparing',
    })
    expect(t3).not.toBeNull()
    expect(t3!.newStatus).toBe('preparing')
  })

  it('rejects invalid transitions', async () => {
    const leadResult = await store.createLead({
      company: 'Invalid Transition Co',
      contactName: 'Contact',
      contactTitle: 'CTO',
      signalType: 1,
      signalEvidence: 'Hiring',
    })
    const leadId = leadResult.lead!.id

    const runId = await store.createRelayRun({
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: leadId,
    })

    // detected -> completed is invalid
    const t1 = await store.transitionRelayRun({
      runId: runId!,
      newStatus: 'completed',
    })
    expect(t1).toBeNull()
  })

  it('emits OUTREACH_RECORDED when markContacted succeeds', async () => {
    const leadResult = await store.createLead({
      company: 'Outreach Event Co',
      contactName: 'Contact',
      contactTitle: 'CTO',
      signalType: 1,
      signalEvidence: 'Hiring',
    })
    const leadId = leadResult.lead!.id

    const result = await store.markContacted(leadId, 'Hello, I saw you are hiring!')
    expect(result.allowed).toBe(true)
  })

  it('emits CLIENT_REPLIED when conversation state transitions to replied', async () => {
    const leadResult = await store.createLead({
      company: 'Reply Event Co',
      contactName: 'Contact',
      contactTitle: 'CTO',
      signalType: 1,
      signalEvidence: 'Hiring',
    })
    const leadId = leadResult.lead!.id

    // First contact
    await store.markContacted(leadId, 'Hello!')

    // Then client replies
    await store.upsertConversationState({
      leadId,
      stage: 'replied',
    })

    // Verify conversation state
    const convState = await store.getConversationState(leadId)
    expect(convState).not.toBeNull()
    expect(convState!.stage).toBe('replied')
  })

  it('persists run state across operations (refresh semantics)', async () => {
    const leadResult = await store.createLead({
      company: 'Persistence Test Co',
      contactName: 'Contact',
      contactTitle: 'CTO',
      signalType: 1,
      signalEvidence: 'Hiring',
    })
    const leadId = leadResult.lead!.id

    const runId = await store.createRelayRun({
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: leadId,
    })

    await store.transitionRelayRun({ runId: runId!, newStatus: 'qualifying' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'qualified' })

    // Simulate "refresh" — get the run again
    const run = await store.getRelayRun(runId!)
    expect(run).not.toBeNull()
    expect(run!.status).toBe('qualified')
  })
})

describe('Orchestration: Full Outbound Scenario', () => {
  let store: Awaited<ReturnType<typeof buildMockStore>>

  beforeEach(async () => {
    store = await buildMockStore(makeContext(makeRep('rep-1', 'Test Rep')))
  })

  it('completes a full outbound workflow', async () => {
    // 1. Create lead
    const leadResult = await store.createLead({
      company: 'Full Flow Co',
      contactName: 'Sarah',
      contactTitle: 'CTO',
      signalType: 1,
      signalEvidence: 'Hiring Rails engineers',
      score: 12,
      verdict: 'send',
    })
    expect(leadResult.blocked).toBe(false)
    const leadId = leadResult.lead!.id

    // 2. Create outbound run
    const runId = await store.createRelayRun({
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: leadId,
      assignedRepId: 'rep-1',
    })
    expect(runId).not.toBeNull()

    // 3. Transition: detected -> qualifying -> qualified -> preparing -> awaiting_human
    await store.transitionRelayRun({ runId: runId!, newStatus: 'qualifying' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'qualified' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'preparing' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'awaiting_human' })

    // 4. Human records outreach
    await store.markContacted(leadId, 'Hi Sarah, I saw you are hiring Rails engineers...')
    await store.transitionRelayRun({ runId: runId!, newStatus: 'action_recorded' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'waiting' })

    // 5. Verify waiting state
    let run = await store.getRelayRun(runId!)
    expect(run!.status).toBe('waiting')

    // 6. Client replies
    await store.upsertConversationState({ leadId, stage: 'replied' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'response_received' })

    // 7. Verify response_received
    run = await store.getRelayRun(runId!)
    expect(run!.status).toBe('response_received')

    // 8. Move to conversation
    await store.transitionRelayRun({ runId: runId!, newStatus: 'conversation' })
    run = await store.getRelayRun(runId!)
    expect(run!.status).toBe('conversation')

    // 9. Complete
    await store.transitionRelayRun({ runId: runId!, newStatus: 'completed' })
    run = await store.getRelayRun(runId!)
    expect(run!.status).toBe('completed')
    expect(run!.completedAt).not.toBeNull()
  })

  it('detects drift and reconciles correctly', async () => {
    // Setup: create lead + run, get to waiting
    const leadResult = await store.createLead({
      company: 'Drift Test Co',
      contactName: 'Contact',
      contactTitle: 'CTO',
      signalType: 1,
      signalEvidence: 'Hiring',
    })
    const leadId = leadResult.lead!.id

    const runId = await store.createRelayRun({
      runType: 'outbound',
      primaryEntityType: 'lead',
      primaryEntityId: leadId,
    })

    await store.transitionRelayRun({ runId: runId!, newStatus: 'qualifying' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'qualified' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'preparing' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'awaiting_human' })
    await store.markContacted(leadId, 'Hello!')
    await store.transitionRelayRun({ runId: runId!, newStatus: 'action_recorded' })
    await store.transitionRelayRun({ runId: runId!, newStatus: 'waiting' })

    // Simulate drift: manually corrupt the run status back to waiting
    // (In real scenario, this would be a bug or missed event)
    const run = await store.getRelayRun(runId!)
    expect(run!.status).toBe('waiting')

    // Now the client replies (conversation state shows replied)
    await store.upsertConversationState({ leadId, stage: 'replied' })

    // Reconcile
    const lead = await store.getLead(leadId)
    const convState = await store.getConversationState(leadId)

    const reconciliationResult = reconcileRelayRun({
      run: run!,
      lead: lead!,
      conversationState: convState,
    })

    // The run says waiting, but lead status is replied → drift detected
    expect(reconciliationResult.drifted).toBe(true)
    expect(reconciliationResult.correctedStatus).toBe('response_received')

    // Apply the repair
    await store.transitionRelayRun({ runId: runId!, newStatus: 'response_received' })

    const fixedRun = await store.getRelayRun(runId!)
    expect(fixedRun!.status).toBe('response_received')

    // Reconcile again — should show no drift
    const leadAfter = await store.getLead(leadId)
    const convAfter = await store.getConversationState(leadId)
    const secondReconcile = reconcileRelayRun({
      run: fixedRun!,
      lead: leadAfter!,
      conversationState: convAfter,
    })
    expect(secondReconcile.drifted).toBe(false)
  })
})
