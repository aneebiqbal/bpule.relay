import { describe, expect, it } from 'vitest'
import { analyzeReply, extractConversationFacts, chooseConversationMove, type ReplyAnalysis } from '@/lib/relay/conversation-engine'
import { emptyConversationKnowledge } from '@/lib/relay/revenue-strategy'
import type { Message } from '@/lib/domain/types'

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: crypto.randomUUID(),
    organizationId: 'org-1',
    leadId: 'lead-1',
    repId: 'rep-1',
    type: 'dm',
    draftText: null,
    sentText: 'Hello!',
    sentAt: '2026-09-25T10:00:00Z',
    modelUsed: null,
    direction: 'outbound',
    createdAt: '2026-09-25T10:00:00Z',
    ...overrides,
  }
}

describe('Conversation Copilot — analyzeReply', () => {
  it('detects not_interested intent', () => {
    const result = analyzeReply('Not interested at this time, thanks.', {
      leadId: 'lead-1',
      leadCompany: 'Acme',
      contactName: 'Sarah',
      replyText: 'Not interested at this time, thanks.',
      priorMessages: [],
      conversationStage: 'replied',
      senderProfileId: null,
    })
    expect(result.intent).toBe('not_interested')
    expect(result.sentiment).toBe('negative')
    expect(result.nextBestAction).toBe('graceful_close')
  })

  it('detects pricing question', () => {
    const result = analyzeReply('How much do you charge for a project like this?', {
      leadId: 'lead-1',
      leadCompany: 'Acme',
      contactName: 'Sarah',
      replyText: 'How much do you charge for a project like this?',
      priorMessages: [],
      conversationStage: 'replied',
      senderProfileId: null,
    })
    expect(result.intent).toBe('pricing')
    expect(result.questions.length).toBeGreaterThan(0)
  })

  it('detects meeting request as buying signal', () => {
    const result = analyzeReply('Can we jump on a call next week to discuss?', {
      leadId: 'lead-1',
      leadCompany: 'Acme',
      contactName: 'Sarah',
      replyText: 'Can we jump on a call next week to discuss?',
      priorMessages: [],
      conversationStage: 'replied',
      senderProfileId: null,
    })
    expect(result.intent).toBe('meeting_request')
    expect(result.buyingSignal).toBe(true)
    expect(result.sentiment).toBe('positive')
  })

  it('extracts multiple questions', () => {
    const result = analyzeReply(
      'What tech stack do you use? How long would this take? What about pricing?',
      {
        leadId: 'lead-1',
        leadCompany: 'Acme',
        contactName: 'Sarah',
        replyText: 'What tech stack do you use? How long would this take? What about pricing?',
        priorMessages: [],
        conversationStage: 'replied',
        senderProfileId: null,
      },
    )
    expect(result.questions.length).toBeGreaterThanOrEqual(3)
  })

  it('detects objection patterns', () => {
    const result = analyzeReply("That's too expensive for us right now.", {
      leadId: 'lead-1',
      leadCompany: 'Acme',
      contactName: 'Sarah',
      replyText: "That's too expensive for us right now.",
      priorMessages: [],
      conversationStage: 'replied',
      senderProfileId: null,
    })
    expect(result.objections).toContain('pricing')
  })

  it('detects existing_solution objection', () => {
    const result = analyzeReply("We're already working with another team on this.", {
      leadId: 'lead-1',
      leadCompany: 'Acme',
      contactName: 'Sarah',
      replyText: "We're already working with another team on this.",
      priorMessages: [],
      conversationStage: 'replied',
      senderProfileId: null,
    })
    expect(result.objections).toContain('existing_solution')
  })

  it('detects hesitation objection', () => {
    const result = analyzeReply('I need to think about this and will get back to you.', {
      leadId: 'lead-1',
      leadCompany: 'Acme',
      contactName: 'Sarah',
      replyText: 'I need to think about this and will get back to you.',
      priorMessages: [],
      conversationStage: 'replied',
      senderProfileId: null,
    })
    expect(result.objections).toContain('hesitation')
  })
})

describe('Conversation Copilot — extractConversationFacts', () => {
  function makeAnalysis(overrides: Partial<ReplyAnalysis>): Pick<ReplyAnalysis, 'intent' | 'questions' | 'objections' | 'buyingSignal' | 'requestedInformation'> {
    return {
      intent: 'unclear',
      questions: [],
      objections: [],
      buyingSignal: false,
      requestedInformation: [],
      ...overrides,
    }
  }

  it('extracts timeline when they say "next quarter"', () => {
    const analysis = makeAnalysis({ intent: 'interested' })
    const knowledge = extractConversationFacts('Maybe next quarter would be better for us.', analysis)
    expect(knowledge.fields.timeline.status).toBe('known')
    expect(knowledge.fields.timeline.value).toContain('next quarter')
  })

  it('extracts "already hired" fact', () => {
    const analysis = makeAnalysis({})
    const knowledge = extractConversationFacts('We already hired someone for this role.', analysis)
    expect(knowledge.fields.need.value).toContain('Already hired')
    expect(knowledge.fields.timeline.value).toBe('closed')
  })

  it('marks budget as unknown when pricing asked', () => {
    const analysis = makeAnalysis({ intent: 'pricing', questions: ['What is your rate?'] })
    const knowledge = extractConversationFacts('What is your rate?', analysis)
    expect(knowledge.fields.budget.status).toBe('unknown')
    expect(knowledge.fields.proofNeeded.status).toBe('known')
  })
})

describe('Conversation Copilot — chooseConversationMove', () => {
  function emptyKnowledge() {
    return emptyConversationKnowledge()
  }

  it('CLOSE when not interested', () => {
    const result = chooseConversationMove(
      { intent: 'not_interested', questions: [], objections: [], buyingSignal: false },
      emptyKnowledge(),
    )
    expect(result.move).toBe('CLOSE')
  })

  it('CALL when meeting requested', () => {
    const result = chooseConversationMove(
      { intent: 'meeting_request', questions: [], objections: [], buyingSignal: true },
      emptyKnowledge(),
    )
    expect(result.move).toBe('CALL')
  })

  it('PROVIDE_PROOF when proof needed', () => {
    const knowledge = emptyKnowledge()
    knowledge.fields.proofNeeded = { value: 'They asked for examples', status: 'known' }
    const result = chooseConversationMove(
      { intent: 'unclear', questions: [], objections: [], buyingSignal: false },
      knowledge,
    )
    expect(result.move).toBe('PROVIDE_PROOF')
  })

  it('ANSWER when questions present', () => {
    const result = chooseConversationMove(
      { intent: 'question', questions: ['How much?'], objections: [], buyingSignal: false },
      emptyKnowledge(),
    )
    expect(result.move).toBe('ANSWER')
  })

  it('CLARIFY when objection present', () => {
    const result = chooseConversationMove(
      { intent: 'objection', questions: [], objections: ['timing'], buyingSignal: false },
      emptyKnowledge(),
    )
    expect(result.move).toBe('CLARIFY')
  })
})

describe('Conversation Copilot — message flow invariants', () => {
  it('never fabricates client message — empty reply produces unclear intent', () => {
    const result = analyzeReply('', {
      leadId: 'lead-1',
      leadCompany: 'Acme',
      contactName: 'Sarah',
      replyText: '',
      priorMessages: [],
      conversationStage: 'replied',
      senderProfileId: null,
    })
    expect(result.intent).toBe('unclear')
    expect(result.questions.length).toBe(0)
  })

  it('detects buying signals from positive language', () => {
    const result = analyzeReply("Sounds good! Let's move forward.", {
      leadId: 'lead-1',
      leadCompany: 'Acme',
      contactName: 'Sarah',
      replyText: "Sounds good! Let's move forward.",
      priorMessages: [],
      conversationStage: 'replied',
      senderProfileId: null,
    })
    expect(result.buyingSignal).toBe(true)
  })

  it('interested intent detected from tell me more', () => {
    const result = analyzeReply('Tell me more about how you work.', {
      leadId: 'lead-1',
      leadCompany: 'Acme',
      contactName: 'Sarah',
      replyText: 'Tell me more about how you work.',
      priorMessages: [],
      conversationStage: 'replied',
      senderProfileId: null,
    })
    expect(result.intent).toBe('interested')
    expect(result.buyingSignal).toBe(true)
  })
})
