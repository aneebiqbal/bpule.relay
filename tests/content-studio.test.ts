import { describe, it, expect } from 'vitest'
import { buildDailyDecision } from '@/lib/content/daily-decision'
import { checkHumanization, rewriteToHumanize } from '@/lib/ai/humanization'
import type { ContentDraftFeedback, ContentPersona, TopicCluster } from '@/lib/domain/types'

function makePersona(overrides: Partial<ContentPersona> = {}): ContentPersona {
  return {
    id: 'persona-1',
    repId: 'rep-1',
    organizationId: 'org-test',
    displayName: 'Test Persona',
    platforms: ['linkedin'],
    voiceProfileId: null,
    humorStyle: '',
    valuesAndOpinions: [],
    admiredExamples: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeCluster(id: string, overrides: Partial<TopicCluster> = {}): TopicCluster {
  return {
    id,
    organizationId: 'org-test',
    personaId: 'persona-1',
    clusterName: `Cluster ${id}`,
    description: '',
    sourceType: 'answer',
    mergedIntoId: null,
    lastInputAt: null,
    lastResearchAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeFeedback(overrides: Partial<ContentDraftFeedback> = {}): ContentDraftFeedback {
  return {
    id: `fb-${Math.random()}`,
    organizationId: 'org-test',
    personaId: 'persona-1',
    draftId: 'draft-1',
    topicClusterId: null,
    sourceKind: 'answer',
    reaction: 'posting',
    edited: false,
    editSignals: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Content Studio: cold start', () => {
  it('a persona with zero history never gets a bare "none" decision with no path forward — it gets the cold-start-none reason, distinct from cap-reached', () => {
    const decision = buildDailyDecision({
      persona: makePersona(),
      clusters: [],
      findings: [],
      feedback: [],
      generatedToday: 0,
    })

    expect(decision.decisionType).toBe('none')
    // Distinguish cold-start-none from cap-reached-none by reason text —
    // these are two different code paths that both return decisionType
    // 'none', and a test asserting only decisionType would not catch a
    // regression that accidentally swapped one path for the other.
    expect(decision.reason).toBe('Nothing worth surfacing today.')
    expect(decision.reason).not.toBe('Daily cap reached for this persona.')
  })

  it('the daily cap always wins first, even for an otherwise cold-start persona', () => {
    const decision = buildDailyDecision({
      persona: makePersona(),
      clusters: [],
      findings: [],
      feedback: [],
      generatedToday: 2,
    })
    expect(decision.reason).toBe('Daily cap reached for this persona.')
  })

  it('a persona with a genuinely stale topic cluster is asked a direct question, not left at none', () => {
    // lastInputAt 20 days ago clears the staleCluster gap (>=4 days), so
    // this hits the 'question' branch before ever reaching the ready/
    // ask_uncertain confidence logic — a different, earlier active path,
    // still never 'none'.
    const decision = buildDailyDecision({
      persona: makePersona({ valuesAndOpinions: ['I think small teams ship faster', 'Documentation is a form of respect'] }),
      clusters: [makeCluster('c1', { lastInputAt: new Date(Date.now() - 20 * 86_400_000).toISOString() })],
      findings: [],
      feedback: [],
      generatedToday: 0,
    })

    expect(decision.decisionType).not.toBe('none')
    expect(decision.decisionType).toBe('question')
    expect(decision.prompt).toBeTruthy()
  })

  it('a persona with fresh clusters and enough stored opinions gets an active ready/ask_uncertain decision, not none', () => {
    // No stale cluster this time (lastInputAt recent), so this reaches the
    // valuesAndOpinions branch instead.
    const decision = buildDailyDecision({
      persona: makePersona({ valuesAndOpinions: ['I think small teams ship faster', 'Documentation is a form of respect'] }),
      clusters: [makeCluster('c1', { lastInputAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })],
      findings: [],
      feedback: [],
      generatedToday: 0,
    })

    expect(decision.decisionType).not.toBe('none')
    expect(['ready', 'ask_uncertain']).toContain(decision.decisionType)
  })
})

describe('Content Studio: humanization check', () => {
  it('flags a uniform-rhythm, over-hedged sample caption instead of passing it through silently', () => {
    // Every sentence hovers around the same word count, and both-sides
    // hedging language appears twice — exactly the "generated feel" this
    // check exists to catch.
    const caption = [
      'Our new pricing model helps customers save money each month.',
      'On the one hand it simplifies billing for everyone involved today.',
      'On the other hand it does require a short migration period first.',
      'That said the long term benefits outweigh the short term friction.',
    ].join(' ')

    const result = checkHumanization(caption)

    expect(result.passed).toBe(false)
    expect(result.flaggedTells.length).toBeGreaterThan(0)
    expect(result.flaggedTells.some((t) => t.includes('hedging'))).toBe(true)
  })

  it('rewrites a flagged caption rather than passing it through unchanged', () => {
    const caption = [
      'Our new pricing model helps customers save money each month.',
      'On the one hand it simplifies billing for everyone involved today.',
      'On the other hand it does require a short migration period first.',
      'That said the long term benefits outweigh the short term friction.',
    ].join(' ')

    const { flaggedTells } = checkHumanization(caption)
    const rewritten = rewriteToHumanize(caption, flaggedTells)

    expect(rewritten).not.toBe(caption)
    // At least the "that said" hedge clause is actually removed, not just
    // reworded — this is real structural change, not a no-op rewrite.
    expect(rewritten.toLowerCase()).not.toContain('that said')
  })

  it('passes a naturally varied, single-opinion caption without flagging it', () => {
    const caption = 'Shipped the caching fix today. Latency dropped by half almost immediately. Turns out the fix was three lines.'
    const result = checkHumanization(caption)
    expect(result.passed).toBe(true)
    expect(result.flaggedTells).toEqual([])
  })
})

describe('Content Studio: accept/reject learning signal actually shifts what gets suggested', () => {
  it('marking "not for me" repeatedly on one topic makes buildDailyDecision prefer a different cluster', () => {
    const clusterA = makeCluster('cluster-a', { clusterName: 'Topic A', lastInputAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })
    const clusterB = makeCluster('cluster-b', { clusterName: 'Topic B', lastInputAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })

    // Reject topic A three times, accept topic B three times — enough
    // decisions to clear buildDailyDecision's own confidence threshold (4).
    const feedback: ContentDraftFeedback[] = [
      makeFeedback({ topicClusterId: clusterA.id, reaction: 'not_for_me' }),
      makeFeedback({ topicClusterId: clusterA.id, reaction: 'not_for_me' }),
      makeFeedback({ topicClusterId: clusterA.id, reaction: 'not_for_me' }),
      makeFeedback({ topicClusterId: clusterB.id, reaction: 'posting' }),
      makeFeedback({ topicClusterId: clusterB.id, reaction: 'posting' }),
    ]

    const decision = buildDailyDecision({
      persona: makePersona({ valuesAndOpinions: ['A real conviction', 'Another real conviction'] }),
      clusters: [clusterA, clusterB],
      findings: [],
      feedback,
      generatedToday: 0,
    })

    // The suggested topic must be B (the kept one), not A (the repeatedly
    // rejected one) — this is the actual behavior change, not just a log
    // entry. If this regresses to always suggesting the first cluster in
    // the array regardless of feedback, this test catches it.
    expect(decision.contextId).toBe(clusterB.id)
    expect(decision.topicLabel).toBe('Topic B')
  })

  it('with no feedback at all, the first cluster is used — establishing the baseline this test\'s "shift" is measured against', () => {
    const clusterA = makeCluster('cluster-a', { clusterName: 'Topic A' })
    const clusterB = makeCluster('cluster-b', { clusterName: 'Topic B' })

    const decision = buildDailyDecision({
      persona: makePersona({ valuesAndOpinions: ['A real conviction', 'Another real conviction'] }),
      clusters: [clusterA, clusterB],
      findings: [],
      feedback: [],
      generatedToday: 0,
    })

    expect(decision.contextId).toBe(clusterA.id)
  })
})
