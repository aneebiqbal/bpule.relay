/**
 * Autonomous Idea Engine — generates PostSeeds without user input.
 */

import type { ContentProfile, ContentMemory } from '@/lib/domain/types'
import { inferContentUniverse, getUnderusedTerritories, type TerritoryWeight } from './territories'
import { scoreTasteMatch, type TasteProfile } from './taste'

export type ContentType = 'technical' | 'opinion' | 'human' | 'educational' | 'timely' | 'observation'
export type GroundingType = 'personal_grounded' | 'opinion_confirmed' | 'expertise_grounded' | 'research_grounded' | 'general_educational' | 'creative_observation'

export interface PostSeed {
  id: string
  idea: string
  angle: string
  contentType: ContentType
  groundingType: GroundingType
  whyInteresting: string
  audience: string
  freshness: number
  researchNeeded: boolean
  personalizationNeeded: boolean
  territory: string
  scores: { interestingness: number; originality: number; personaRelevance: number; audienceValue: number; credibility: number; memoryDistance: number; conversationPotential: number; tasteMatch: number }
  totalScore: number
  evidenceSource: string
  neverFabricate: string[]
}

export interface IdeaEngineResult {
  seeds: PostSeed[]
  selected: PostSeed[]
  universe: ReturnType<typeof inferContentUniverse>
  generatedAt: string
}

export function generatePostSeeds(profile: ContentProfile | null, memories: ContentMemory[], tasteProfile: TasteProfile | null): IdeaEngineResult {
  const universe = inferContentUniverse(profile, memories)
  const seeds: PostSeed[] = []

  for (const territory of universe.territories) {
    seeds.push(...genTerritorySeeds(territory, profile, memories))
  }

  if (profile) {
    for (const opinion of profile.opinions) {
      if (opinion.strength === 'strong' || opinion.strength === 'moderate') {
        seeds.push(genOpinionSeed(opinion.belief, profile))
      }
    }
    for (const exp of profile.expertise.filter(e => e.level === 'expert' || e.level === 'advanced')) {
      seeds.push(genExpertiseSeed(exp.area, profile))
    }
    for (const exp of profile.experiences.filter(e => e.lesson && e.lesson.length > 10)) {
      seeds.push(genExperienceSeed(exp.description, exp.lesson))
    }
    for (const tech of profile.technologies.slice(0, 4).filter(t => t.proficiency === 'expert' || t.proficiency === 'proficient')) {
      seeds.push(genTechSeed(tech.name, tech.context, profile))
    }
  }

  seeds.push(...genUniversalSeeds())

  const deduped = deduplicateSeeds(seeds)
  const scored = deduped.map(s => scoreSeed(s, profile, memories, tasteProfile, universe))
  const selected = selectDiverseSeeds(scored, 5)

  return { seeds: scored, selected, universe, generatedAt: new Date().toISOString() }
}

function genTerritorySeeds(territory: TerritoryWeight, profile: ContentProfile | null, memories: ContentMemory[]): PostSeed[] {
  const seeds: PostSeed[] = []
  const id = `seed_${territory.territory}_${Math.random().toString(36).slice(2, 8)}`
  const area = territory.sources[0] ?? 'your field'

  switch (territory.territory) {
    case 'core_expertise':
      seeds.push(mk(id + '_a', `Something most developers get wrong about ${area}`, 'A specific misconception you encounter regularly', 'educational', 'expertise_grounded', 'Challenges common assumptions', 'practitioners in ' + area, 'core_expertise', false))
      seeds.push(mk(id + '_b', `A ${area} pattern that keeps showing up across projects`, 'Recurring observation from real work', 'observation', 'expertise_grounded', 'Pattern recognition from deep experience', 'senior developers', 'core_expertise', false))
      break
    case 'opinions':
      seeds.push(mk(id + '_a', 'A strong opinion you hold that most developers disagree with', 'Contrarian position grounded in experience', 'opinion', 'opinion_confirmed', 'Challenges consensus with evidence', 'developers open to rethinking assumptions', 'opinions', false))
      break
    case 'technology':
      seeds.push(mk(id + '_a', `What ${area} does better than alternatives — and where it falls short`, 'Balanced technical assessment from experience', 'technical', 'expertise_grounded', 'Nuanced take from hands-on experience', 'developers evaluating ' + area, 'technology', false))
      break
    case 'engineering_culture':
      seeds.push(mk(id + '_a', 'A team practice that seems counterintuitive but actually works', 'From observing what actually moves the needle vs what looks good', 'human', 'expertise_grounded', 'Practical wisdom over conventional advice', 'engineering leads and senior developers', 'engineering_culture', false))
      break
    case 'ai':
      seeds.push(mk(id + '_a', 'AI is making implementation cheaper, but engineering judgment is not', 'What changes and what stays the same with AI tooling', 'opinion', 'expertise_grounded', 'Nuanced take on AI impact from practitioner perspective', 'senior developers navigating AI tools', 'ai', false))
      break
    case 'learning':
      seeds.push(mk(id + '_a', 'A debugging mistake that taught you something about how you think', 'The cognitive pattern behind the technical mistake', 'human', 'expertise_grounded', 'Meta-lesson about problem-solving, not just the bug', 'developers who get stuck', 'learning', false))
      break
    case 'human_observations':
      seeds.push(mk(id + '_a', 'Being stuck for hours often starts with one assumption you stopped questioning', 'The hidden starting point of wasted debugging time', 'human', 'creative_observation', 'Recognizable moment for any developer', 'anyone who has debugged a hard problem', 'human_observations', false))
      break
    case 'timely_developments':
      seeds.push(mk(id + '_a', 'A recent development in your field raises an interesting engineering question', 'What this means for how we build software', 'timely', 'research_grounded', 'Connects news to practical implications', 'developers in the space', 'timely_developments', true))
      break
    case 'work_habits':
      seeds.push(mk(id + '_a', 'A small workflow change that had an outsized impact', 'The specific mechanism behind why it worked', 'educational', 'creative_observation', 'Actionable insight, not generic productivity advice', 'developers looking to improve focus', 'work_habits', false))
      break
    case 'career':
      seeds.push(mk(id + '_a', 'What seniority actually means beyond years of experience', 'The shift in how you work, not just what you know', 'human', 'expertise_grounded', 'Redefines a loaded term from real observation', 'mid-level developers growing into senior roles', 'career', false))
      break
  }
  return seeds
}

function genOpinionSeed(opinion: string, profile: ContentProfile): PostSeed {
  const id = `seed_opinion_${Math.random().toString(36).slice(2, 8)}`
  return mk(id, opinion, 'Why this belief is grounded in experience, not just preference', 'opinion', 'opinion_confirmed', 'Strong conviction with reasoning', 'developers with similar challenges', 'opinions', false, ['Do not attribute this opinion to a specific employer or client without evidence'])
}

function genExpertiseSeed(area: string, profile: ContentProfile): PostSeed {
  const id = `seed_expertise_${Math.random().toString(36).slice(2, 8)}`
  return mk(id, `A lesson from ${area} that applies more broadly than expected`, 'How a domain-specific insight transfers to general engineering', 'educational', 'expertise_grounded', 'Cross-domain insight from deep expertise', 'developers outside ' + area, 'core_expertise', false, ['Do not invent specific project details or metrics'])
}

function genExperienceSeed(description: string, lesson: string): PostSeed {
  const id = `seed_exp_${Math.random().toString(36).slice(2, 8)}`
  return mk(id, lesson, 'The specific situation that led to this insight', 'human', 'personal_grounded', 'Real lesson from real experience', 'developers who might face similar situations', 'learning', false, ['Do not embellish the specific details beyond what is recorded'])
}

function genTechSeed(name: string, context: string, profile: ContentProfile): PostSeed {
  const id = `seed_tech_${Math.random().toString(36).slice(2, 8)}`
  return mk(id, `What working with ${name} teaches you about ${context || 'software development'}`, 'The transferable insight from deep tool knowledge', 'technical', 'expertise_grounded', 'Tool knowledge that reveals broader principles', 'developers using or evaluating ' + name, 'technology', false, ['Do not invent benchmark numbers or comparison stats'])
}

function genUniversalSeeds(): PostSeed[] {
  const id = `seed_universal_${Math.random().toString(36).slice(2, 8)}`
  return [
    mk(id + '_a', 'The gap between how code looks in a PR and how it behaves at 2am in production', 'The distance between review-time thinking and runtime reality', 'human', 'creative_observation', 'Every developer has lived this; few articulate it', 'any developer who has been on call', 'human_observations', false),
    mk(id + '_b', 'Why "it works on my machine" is usually a configuration problem, not a code problem', 'The hidden role of environment in debugging', 'educational', 'general_educational', 'Reframes a common frustration into a systematic approach', 'developers debugging environment issues', 'learning', false),
    mk(id + '_c', 'The best code review feedback is about reasoning, not syntax', 'What separates useful review comments from noise', 'opinion', 'creative_observation', 'Improves a daily practice for every developer', 'anyone who does code reviews', 'engineering_culture', false),
    mk(id + '_d', 'Documentation is not about writing more. It is about making one assumption explicit.', 'The root cause of most documentation gaps', 'educational', 'creative_observation', 'Reframes documentation from chore to insight', 'developers who maintain projects', 'work_habits', false),
  ]
}

function mk(id: string, idea: string, angle: string, contentType: ContentType, groundingType: GroundingType, whyInteresting: string, audience: string, territory: string, researchNeeded: boolean, neverFabricate: string[] = []): PostSeed {
  return { id, idea, angle, contentType, groundingType, whyInteresting, audience, freshness: 0.8, researchNeeded, personalizationNeeded: false, territory, scores: { interestingness: 0, originality: 0, personaRelevance: 0, audienceValue: 0, credibility: 0, memoryDistance: 0, conversationPotential: 0, tasteMatch: 0 }, totalScore: 0, evidenceSource: territory, neverFabricate }
}

function scoreSeed(seed: PostSeed, profile: ContentProfile | null, memories: ContentMemory[], tasteProfile: TasteProfile | null, universe: ReturnType<typeof inferContentUniverse>): PostSeed {
  const s = {
    interestingness: scoreInterestingness(seed),
    originality: scoreOriginality(seed, memories),
    personaRelevance: scorePersonaRelevance(seed, profile, universe),
    audienceValue: scoreAudienceValue(seed),
    credibility: scoreCredibility(seed),
    memoryDistance: scoreMemoryDistance(seed, memories),
    conversationPotential: scoreConversationPotential(seed),
    tasteMatch: tasteProfile ? scoreTasteMatch(tasteProfile, { territory: seed.territory, isTechnical: seed.contentType === 'technical', isOpinion: seed.contentType === 'opinion', isTimely: seed.contentType === 'timely', isShort: seed.idea.length < 80, isPersonal: seed.groundingType === 'personal_grounded' }) : 0.5,
  }
  const total = s.interestingness * 0.2 + s.originality * 0.15 + s.personaRelevance * 0.2 + s.audienceValue * 0.1 + s.credibility * 0.15 + s.memoryDistance * 0.1 + s.conversationPotential * 0.05 + s.tasteMatch * 0.05
  return { ...seed, scores: s, totalScore: Math.round(total * 100) / 100 }
}

function scoreInterestingness(s: PostSeed): number {
  let n = 0.5
  if (s.contentType === 'opinion') n += 0.15
  if (s.contentType === 'human') n += 0.1
  if (s.contentType === 'observation') n += 0.1
  if (s.contentType === 'timely') n += 0.1
  return Math.min(1, n + s.freshness * 0.1)
}

function scoreOriginality(s: PostSeed, memories: ContentMemory[]): number {
  const similar = memories.filter(m => m.memoryType === 'topic_covered' || m.memoryType === 'angle_used')
  if (similar.length === 0) return 0.8
  const sWords = new Set(s.idea.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  let maxO = 0
  for (const mem of similar) {
    const mWords = new Set(mem.content.toLowerCase().split(/\s+/).filter(w => w.length > 3))
    let overlap = 0
    for (const w of sWords) if (mWords.has(w)) overlap++
    maxO = Math.max(maxO, overlap / Math.max(sWords.size, 1))
  }
  return Math.max(0.1, 1 - maxO)
}

function scorePersonaRelevance(s: PostSeed, profile: ContentProfile | null, universe: ReturnType<typeof inferContentUniverse>): number {
  if (!profile) return 0.4
  const tw = universe.territories.find(t => t.territory === s.territory)
  return tw ? tw.weight : 0.3
}

function scoreAudienceValue(s: PostSeed): number {
  if (s.contentType === 'educational') return 0.8
  if (s.contentType === 'technical') return 0.7
  if (s.contentType === 'human') return 0.75
  if (s.contentType === 'opinion') return 0.6
  if (s.contentType === 'observation') return 0.7
  if (s.contentType === 'timely') return 0.65
  return 0.5
}

function scoreCredibility(s: PostSeed): number {
  if (s.groundingType === 'personal_grounded') return 0.9
  if (s.groundingType === 'opinion_confirmed') return 0.8
  if (s.groundingType === 'expertise_grounded') return 0.75
  if (s.groundingType === 'research_grounded') return 0.7
  if (s.groundingType === 'creative_observation') return 0.6
  if (s.groundingType === 'general_educational') return 0.65
  return 0.5
}

function scoreMemoryDistance(s: PostSeed, memories: ContentMemory[]): number {
  const recent = memories.filter(m => m.memoryType === 'topic_covered').slice(0, 10).map(m => m.content.toLowerCase())
  if (recent.length === 0) return 0.9
  const sLower = s.idea.toLowerCase()
  for (const topic of recent) {
    if (topic.includes(sLower.slice(0, 20)) || sLower.includes(topic.slice(0, 20))) return 0.2
  }
  return 0.7
}

function scoreConversationPotential(s: PostSeed): number {
  if (s.contentType === 'opinion') return 0.8
  if (s.contentType === 'observation') return 0.75
  if (s.contentType === 'human') return 0.7
  if (s.contentType === 'timely') return 0.65
  if (s.contentType === 'educational') return 0.6
  if (s.contentType === 'technical') return 0.55
  return 0.5
}

function deduplicateSeeds(seeds: PostSeed[]): PostSeed[] {
  const seen = new Set<string>()
  const result: PostSeed[] = []
  for (const s of seeds) {
    const key = s.idea.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (seen.has(key)) continue
    if (result.some(e => ideasSimilar(e.idea, s.idea))) continue
    seen.add(key)
    result.push(s)
  }
  return result
}

function ideasSimilar(a: string, b: string): boolean {
  const aW = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  const bW = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  if (aW.size === 0 || bW.size === 0) return false
  let overlap = 0
  for (const w of aW) if (bW.has(w)) overlap++
  return overlap / Math.min(aW.size, bW.size) > 0.6
}

function selectDiverseSeeds(scored: PostSeed[], count: number): PostSeed[] {
  if (scored.length <= count) return scored.sort((a, b) => b.totalScore - a.totalScore)
  const sorted = [...scored].sort((a, b) => b.totalScore - a.totalScore)
  const selected: PostSeed[] = []
  for (const s of sorted) {
    if (selected.length >= count) break
    const tCount = selected.filter(x => x.territory === s.territory).length
    const cCount = selected.filter(x => x.contentType === s.contentType).length
    if (tCount < 2 && cCount < 2) selected.push(s)
  }
  if (selected.length < count) {
    for (const s of sorted) {
      if (selected.length >= count) break
      if (!selected.includes(s)) selected.push(s)
    }
  }
  return selected.sort((a, b) => b.totalScore - a.totalScore)
}
