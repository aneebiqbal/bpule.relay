/**
 * Content Universe — territory inference engine.
 *
 * Automatically infers evolving content territories from DNA + behavior.
 * No manual configuration required.
 */

import type { ContentProfile, ContentMemory } from '@/lib/domain/types'

export type ContentTerritory =
  | 'core_expertise'
  | 'adjacent_expertise'
  | 'technology'
  | 'industry'
  | 'career'
  | 'engineering_culture'
  | 'tools'
  | 'ai'
  | 'leadership'
  | 'learning'
  | 'work_habits'
  | 'opinions'
  | 'curiosity'
  | 'timely_developments'
  | 'human_observations'

export interface TerritoryWeight {
  territory: ContentTerritory
  weight: number
  sources: string[]
  freshness: number
}

export interface ContentUniverse {
  territories: TerritoryWeight[]
  inferredAt: string
}

export function inferContentUniverse(
  profile: ContentProfile | null,
  memories: ContentMemory[],
): ContentUniverse {
  const territories: TerritoryWeight[] = []
  const now = Date.now()

  if (!profile) {
    return {
      territories: [
        { territory: 'core_expertise', weight: 0.7, sources: ['default'], freshness: 0.5 },
        { territory: 'technology', weight: 0.6, sources: ['default'], freshness: 0.5 },
        { territory: 'opinions', weight: 0.5, sources: ['default'], freshness: 0.5 },
        { territory: 'learning', weight: 0.4, sources: ['default'], freshness: 0.5 },
        { territory: 'tools', weight: 0.4, sources: ['default'], freshness: 0.5 },
      ],
      inferredAt: new Date().toISOString(),
    }
  }

  const expertiseAreas = profile.expertise
    .filter(e => e.level === 'expert' || e.level === 'advanced')
    .map(e => e.area)
  if (expertiseAreas.length > 0) {
    territories.push({
      territory: 'core_expertise',
      weight: Math.min(0.9, 0.5 + expertiseAreas.length * 0.1),
      sources: expertiseAreas,
      freshness: computeFreshness('core_expertise', memories, now),
    })
  }

  const intermediateAreas = profile.expertise
    .filter(e => e.level === 'intermediate')
    .map(e => e.area)
  if (intermediateAreas.length > 0) {
    territories.push({
      territory: 'adjacent_expertise',
      weight: Math.min(0.7, 0.3 + intermediateAreas.length * 0.1),
      sources: intermediateAreas,
      freshness: computeFreshness('adjacent_expertise', memories, now),
    })
  }

  const technologies = profile.technologies
    .filter(t => t.proficiency === 'expert' || t.proficiency === 'proficient')
    .map(t => t.name)
  if (technologies.length > 0) {
    territories.push({
      territory: 'technology',
      weight: Math.min(0.85, 0.4 + technologies.length * 0.08),
      sources: technologies.slice(0, 5),
      freshness: computeFreshness('technology', memories, now),
    })
  }

  if (profile.industries.length > 0) {
    territories.push({
      territory: 'industry',
      weight: Math.min(0.7, 0.3 + profile.industries.length * 0.15),
      sources: profile.industries,
      freshness: computeFreshness('industry', memories, now),
    })
  }

  const strongOpinions = profile.opinions.filter(o => o.strength === 'strong')
  if (strongOpinions.length > 0) {
    territories.push({
      territory: 'opinions',
      weight: Math.min(0.85, 0.4 + strongOpinions.length * 0.12),
      sources: strongOpinions.map(o => o.belief).slice(0, 3),
      freshness: computeFreshness('opinions', memories, now),
    })
  }

  const cultureTopics = profile.topicsCared
    .filter(t => t.intensity === 'passionate' && isCulture(t.topic))
    .map(t => t.topic)
  if (cultureTopics.length > 0 || hasCultureExp(profile)) {
    territories.push({
      territory: 'engineering_culture',
      weight: cultureTopics.length > 0 ? 0.7 : 0.4,
      sources: cultureTopics.length > 0 ? cultureTopics : ['inferred_from_role'],
      freshness: computeFreshness('engineering_culture', memories, now),
    })
  }

  const aiTopics = profile.topicsCared.filter(t =>
    t.topic.toLowerCase().includes('ai') || t.topic.toLowerCase().includes('machine learning'))
  const aiTech = profile.technologies.filter(t =>
    t.name.toLowerCase().includes('ai') || t.name.toLowerCase().includes('openai'))
  if (aiTopics.length > 0 || aiTech.length > 0) {
    territories.push({
      territory: 'ai',
      weight: 0.7,
      sources: [...aiTopics.map(t => t.topic), ...aiTech.map(t => t.name)],
      freshness: computeFreshness('ai', memories, now),
    })
  }

  if (profile.seniority && profile.seniority !== 'Junior') {
    territories.push({
      territory: 'career',
      weight: 0.5,
      sources: [profile.seniority],
      freshness: computeFreshness('career', memories, now),
    })
  }

  const learningExp = profile.experiences.filter(e => e.type === 'lesson' || e.type === 'mistake')
  if (learningExp.length > 0) {
    territories.push({
      territory: 'learning',
      weight: Math.min(0.7, 0.3 + learningExp.length * 0.1),
      sources: learningExp.map(e => e.description).slice(0, 3),
      freshness: computeFreshness('learning', memories, now),
    })
  }

  const toolsTopics = profile.topicsCared.filter(t => isTool(t.topic))
  if (toolsTopics.length > 0 || profile.technologies.length > 5) {
    territories.push({
      territory: 'tools',
      weight: toolsTopics.length > 0 ? 0.6 : 0.4,
      sources: toolsTopics.map(t => t.topic).slice(0, 3),
      freshness: computeFreshness('tools', memories, now),
    })
  }

  territories.push({
    territory: 'work_habits',
    weight: 0.4,
    sources: ['default_for_developers'],
    freshness: computeFreshness('work_habits', memories, now),
  })

  territories.push({
    territory: 'human_observations',
    weight: 0.35,
    sources: ['default'],
    freshness: computeFreshness('human_observations', memories, now),
  })

  territories.push({
    territory: 'timely_developments',
    weight: 0.3,
    sources: ['always_available'],
    freshness: 1.0,
  })

  territories.sort((a, b) => b.weight - a.weight)

  return { territories, inferredAt: new Date().toISOString() }
}

export function getUnderusedTerritories(universe: ContentUniverse, n: number = 3): TerritoryWeight[] {
  return [...universe.territories]
    .sort((a, b) => (b.weight * 0.5 + b.freshness * 0.5) - (a.weight * 0.5 + a.freshness * 0.5))
    .slice(0, n)
}

function computeFreshness(territory: ContentTerritory, memories: ContentMemory[], now: number): number {
  const relevant = memories.filter(m => memoryMatchesTerritory(m, territory))
  if (relevant.length === 0) return 1.0
  const mostRecent = relevant.reduce((latest, m) => {
    const t = new Date(m.createdAt).getTime()
    return t > latest ? t : latest
  }, 0)
  const days = (now - mostRecent) / (1000 * 60 * 60 * 24)
  if (days <= 1) return 0.9
  if (days <= 3) return 0.7
  if (days <= 7) return 0.5
  if (days <= 14) return 0.3
  return 0.1
}

function memoryMatchesTerritory(memory: ContentMemory, territory: ContentTerritory): boolean {
  const c = memory.content.toLowerCase()
  switch (territory) {
    case 'core_expertise': return memory.memoryType === 'topic_covered' && /\b(expert|architecture|system|design|build|implement)\b/.test(c)
    case 'technology': return memory.memoryType === 'topic_covered' && /\b(react|rails|node|python|javascript|typescript|database|api|cloud)\b/.test(c)
    case 'opinions': return memory.memoryType === 'opinion_expressed'
    case 'learning': return memory.memoryType === 'topic_covered' && /\b(learned|lesson|mistake|discovered|realized)\b/.test(c)
    case 'engineering_culture': return /\b(team|process|code review|pragmatic|culture|engineering)\b/.test(c)
    case 'ai': return /\b(ai|llm|gpt|machine learning|agent|model)\b/.test(c)
    case 'career': return /\b(senior|staff|lead|promotion|career|growth|management)\b/.test(c)
    case 'tools': return /\b(tool|ide|cursor|vscode|docker|git|cli|workflow)\b/.test(c)
    case 'work_habits': return /\b(habit|routine|workflow|focus|deep work|productivity)\b/.test(c)
    case 'human_observations': return /\b(people|team|communication|collaboration|meeting|stuck|frustrated)\b/.test(c)
    case 'timely_developments': return /\b(new|release|launch|announced|update|version)\b/.test(c)
    default: return false
  }
}

function isCulture(topic: string): boolean {
  return /\b(team|engineering|culture|process|pragmatic|code review|devops|agile|remote|hiring|management|leadership)\b/.test(topic.toLowerCase())
}

function isTool(topic: string): boolean {
  return /\b(tool|ide|editor|docker|kubernetes|git|ci|cd|workflow|automation|cli|terminal)\b/.test(topic.toLowerCase())
}

function hasCultureExp(profile: ContentProfile): boolean {
  return profile.expertise.some(e =>
    /\b(engineering management|team lead|staff engineer|tech lead|architecture|devops)\b/.test(e.area.toLowerCase())
  ) || /\b(senior|staff|lead|principal|head|director|vp|cto)\b/.test(profile.seniority.toLowerCase())
}
