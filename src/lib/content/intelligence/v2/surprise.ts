/**
 * Surprise Me — cross-domain exploration engine.
 */

import type { ContentProfile, ContentMemory } from '@/lib/domain/types'
import { inferContentUniverse, type TerritoryWeight } from './territories'
import type { PostSeed, ContentType, GroundingType } from './idea-engine'

export interface SurpriseSeed extends PostSeed {
  connectionType: 'adjacent_expertise' | 'cross_domain' | 'underused_interest' | 'unexpected_connection'
  connectionExplanation: string
}

const CROSS_DOMAIN: Array<{ from: string; to: string; angle: string; tpl: string }> = [
  { from: 'distributed_systems', to: 'ai_agents', angle: 'AI agents are rediscovering problems distributed systems solved decades ago', tpl: 'AI agents are rediscovering a problem {from} have dealt with for years: {insight}' },
  { from: 'databases', to: 'ai', angle: 'What databases teach us about LLM context management', tpl: 'Managing context in LLMs has surprising parallels to {from} {concept}' },
  { from: 'debugging', to: 'career', angle: 'What debugging teaches about navigating ambiguity', tpl: 'Debugging {concept} taught me more about {to} than any management book' },
  { from: 'testing', to: 'ai', angle: 'Why testing AI output is fundamentally different from testing code', tpl: 'Testing AI output requires rethinking everything we know about {from}' },
  { from: 'devops', to: 'team_culture', angle: 'What CI/CD teaches about team trust', tpl: 'The same principles that make {from} work apply to building {to}' },
  { from: 'api_design', to: 'communication', angle: 'API design principles that improve team communication', tpl: 'Good {from} design and good {to} have the same underlying principle' },
  { from: 'performance', to: 'decision_making', angle: 'Performance optimization as a metaphor for decision-making', tpl: 'Optimizing {from} and making {to} decisions both suffer from the same trap' },
  { from: 'refactoring', to: 'career_growth', angle: 'What refactoring teaches about career pivots', tpl: 'Refactoring {concept} is the same mental model as {to}' },
  { from: 'security', to: 'trust', angle: 'Security thinking applied to team dynamics', tpl: 'Zero-trust security and healthy {to} share the same foundation' },
  { from: 'frontend', to: 'product', angle: 'Frontend engineering insights that apply to product thinking', tpl: 'Building {from} interfaces taught me something about {to}' },
]

export function generateSurpriseSeed(profile: ContentProfile | null, memories: ContentMemory[]): SurpriseSeed | null {
  const universe = inferContentUniverse(profile, memories)
  const top = universe.territories.slice(0, 5)
  if (top.length === 0) return null

  const source = top[Math.floor(Math.random() * top.length)]
  const conn = findConnection(source, top)
  if (!conn) return genUnderusedSurprise(universe)

  const insight = getInsight(conn.from)
  const concept = getConcept(conn.from)
  const idea = conn.tpl.replace('{from}', conn.from).replace('{to}', conn.to).replace('{insight}', insight).replace('{concept}', concept)

  return {
    id: `surprise_${Math.random().toString(36).slice(2, 8)}`,
    idea, angle: conn.angle, contentType: 'observation', groundingType: 'creative_observation',
    whyInteresting: `Unexpected connection between ${conn.from} and ${conn.to}`,
    audience: 'developers interested in cross-domain thinking', freshness: 1.0,
    researchNeeded: false, personalizationNeeded: false, territory: 'curiosity',
    scores: { interestingness: 0.8, originality: 0.9, personaRelevance: 0.6, audienceValue: 0.7, credibility: 0.6, memoryDistance: 1.0, conversationPotential: 0.8, tasteMatch: 0.5 },
    totalScore: 0, evidenceSource: `Cross-domain: ${conn.from} + ${conn.to}`,
    neverFabricate: ['Do not fabricate specific metrics or case studies'],
    connectionType: 'cross_domain',
    connectionExplanation: `Connects your ${conn.from} expertise with ${conn.to}`,
  }
}

function findConnection(source: TerritoryWeight, available: TerritoryWeight[]) {
  const sourceName = source.territory.replace('_', ' ')
  for (const c of CROSS_DOMAIN) {
    if (sourceName.includes(c.from) || c.from.includes(sourceName)) return c
  }
  const recentNames = available.map(t => t.territory) as string[]
  const avail = CROSS_DOMAIN.filter(c => !recentNames.includes(c.from) && !recentNames.includes(c.to))
  if (avail.length > 0) return avail[Math.floor(Math.random() * avail.length)]
  return CROSS_DOMAIN.length > 0 ? CROSS_DOMAIN[Math.floor(Math.random() * CROSS_DOMAIN.length)] : null
}

function genUnderusedSurprise(universe: ReturnType<typeof inferContentUniverse>): SurpriseSeed {
  const underused = universe.territories.filter(t => t.freshness > 0.6 && t.weight > 0.3).sort((a, b) => b.freshness - a.freshness)[0]
  const t = underused ?? universe.territories[universe.territories.length - 1]
  return {
    id: `surprise_under_${Math.random().toString(36).slice(2, 8)}`,
    idea: `Something you have not talked about recently: ${t.territory.replace(/_/g, ' ')}`,
    angle: `A fresh angle on ${t.territory.replace(/_/g, ' ')} that connects to your current work`,
    contentType: 'observation', groundingType: 'creative_observation',
    whyInteresting: `Underused territory with fresh perspectives`, audience: 'your network',
    freshness: t.freshness, researchNeeded: false, personalizationNeeded: false, territory: t.territory,
    scores: { interestingness: 0.7, originality: 0.8, personaRelevance: t.weight, audienceValue: 0.6, credibility: 0.6, memoryDistance: t.freshness, conversationPotential: 0.6, tasteMatch: 0.5 },
    totalScore: 0, evidenceSource: `Underused: ${t.territory}`,
    neverFabricate: ['Do not invent personal anecdotes for this territory'],
    connectionType: 'underused_interest',
    connectionExplanation: `You have not posted about ${t.territory.replace(/_/g, ' ')} recently`,
  }
}

function getInsight(t: string): string {
  const m: Record<string, string> = { distributed_systems: 'how unreliable components coordinate toward one outcome', databases: 'query planning and optimization', debugging: 'systematic elimination of hypotheses', testing: 'how to verify behavior you cannot fully predict', devops: 'automation that builds trust', api_design: 'contract-first thinking', performance: 'where the bottleneck actually is', refactoring: 'improving structure without changing behavior', security: 'defense in depth', frontend: 'the gap between what users see and what the system does' }
  return m[t] || 'core principles that apply broadly'
}

function getConcept(t: string): string {
  const m: Record<string, string> = { distributed_systems: 'distributed consensus', databases: 'index selection', debugging: 'a production issue', testing: 'integration testing', devops: 'deployment pipelines', api_design: 'REST APIs', performance: 'database queries', refactoring: 'legacy code', security: 'authentication flows', frontend: 'state management' }
  return m[t] || 'systems'
}
