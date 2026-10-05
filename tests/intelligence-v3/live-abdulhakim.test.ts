import { describe, it, expect } from 'vitest'
import { produceV3Intelligence } from '@/lib/intelligence-v3/bridge'

const ABDULHAKIM_TEXT = [
  'Abdulhakim Ali',
  'Founder at AgentAce | Co-founder at Tayo360 | NexaCareTech',
  '',
  'About',
  'I run AgentAce, a software development agency that helps companies build MVPs.',
  '',
  'Co-founder, Tayo360 (2023 - Present)',
  '- Building a healthcare data platform',
  '- Raised pre-seed round',
  '',
  'Posts (3 months ago)',
  'Tayo360 is hiring a senior full-stack developer. Send your resume and GitHub to careers@healthbridge.io.',
  '',
  'linkedin.com/in/abdulhakim',
].join('\n')

describe('V3 Live: Abdulhakim Regression', () => {
  it('scores the buyer opportunity, not zero', async () => {
    const result = await produceV3Intelligence(ABDULHAKIM_TEXT, {})
    const v3 = (result.intelligence as unknown as Record<string, unknown>).v3DecisionPacket as Record<string, unknown> | undefined
    const decision = v3?.decision as Record<string, unknown> | undefined

    console.log('Score:', v3?.score)
    console.log('Action:', v3?.action)
    console.log('Message eligible:', v3?.messageEligible)
    console.log('Relationship:', decision?.relationship)
    console.log('Buyer prob:', decision?.buyerRequestProbability)
    console.log('Episodes:', (v3?.episodes as unknown[] | undefined)?.length)
    console.log('Orgs:', new Set((v3?.episodes as Array<Record<string, unknown>>)?.map(e => e.organizationName)))

    // Provider must be OpenAI, not deterministic fallback
    console.log('Provider:', v3?.decisionProvider, '| Model:', v3?.decisionModel)
    expect(['openai_structured', 'openai_gpt-4.1']).toContain(v3?.decisionProvider)

    // Score must NOT be 0
    expect(v3?.score).toBeGreaterThan(0)

    // Relationship must acknowledge buyer signal
    expect(['BUYER', 'MIXED', 'PARTNER']).toContain(decision?.relationship)

    // Action must not be SKIP
    expect(v3?.action).not.toBe('SKIP')

    // V3 must be canonical
    expect(result.v3Canonical).toBe(true)

    // Organization scoping: Tayo360 must be separate from AgentAce
    const orgs = new Set((v3?.episodes as Array<Record<string, unknown>>)?.map(e => e.organizationName as string) || [])
    expect(orgs.has('Tayo360')).toBe(true)
    expect(orgs.has('AgentAce')).toBe(true)

    // The hiring episode must be scoped to Tayo360, not AgentAce
    const hiringEpisodes = (v3?.episodes as Array<Record<string, unknown>> || []).filter(
      e => e.organizationName === 'Tayo360' && (e.anchorEvent as Record<string, unknown>)?.eventType === 'HIRING'
    )
    expect(hiringEpisodes.length).toBeGreaterThan(0)

    // Explicit request must be detected
    expect(decision?.buyerRequestProbability).toBeGreaterThan(0.7)
  }, 120000)
})
