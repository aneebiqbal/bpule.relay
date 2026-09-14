import type { ContentPersona, ContentMemory } from '@/lib/domain/types'

/**
 * Organization Intelligence service.
 *
 * Identifies themes that multiple personas could legitimately discuss,
 * with differentiated angles per persona.
 *
 * CRITICAL: Never exposes Person A's private Content DNA, experiences,
 * interview answers, or drafts to Person B.
 *
 * Only uses PUBLICLY SHARED signals:
 * - Topic cluster names (user-defined, not private)
 * - Opportunity types (derived from public clusters)
 * - Platform preferences
 */

export interface OrgTheme {
  theme: string
  relevantPersonas: Array<{
    personaId: string
    personaName: string
    suggestedAngle: string
    rationale: string
  }>
}

/**
 * Detect shared themes across organization personas.
 *
 * Uses only topic cluster names and public persona info.
 * Does NOT access private Content DNA, experiences, or interview answers.
 */
export function detectOrgThemes(
  personas: Array<{
    persona: ContentPersona
    memories: ContentMemory[]
  }>,
): OrgTheme[] {
  if (personas.length < 2) return []

  // Collect all topic cluster names across personas
  const themeKeywords = new Map<string, Set<string>>()

  for (const { persona, memories } of personas) {
    // Use topic memories (which come from cluster names, not private data)
    const topicMemories = memories.filter((m) => m.memoryType === 'topic_covered')
    for (const mem of topicMemories) {
      const keywords = extractKeywords(mem.content)
      for (const kw of keywords) {
        const existing = themeKeywords.get(kw) ?? new Set()
        existing.add(persona.id)
        themeKeywords.set(kw, existing)
      }
    }

    // Also use the persona's display name keywords as a fallback
    const nameKeywords = extractKeywords(persona.displayName)
    for (const kw of nameKeywords) {
      if (kw.length > 3) {
        const existing = themeKeywords.get(kw) ?? new Set()
        existing.add(persona.id)
        themeKeywords.set(kw, existing)
      }
    }
  }

  // Find keywords shared by multiple personas
  const sharedThemes: OrgTheme[] = []
  for (const [keyword, personaIds] of themeKeywords) {
    if (personaIds.size >= 2 && keyword.length > 3) {
      const relevantPersonas = personas
        .filter((p) => personaIds.has(p.persona.id))
        .map((p) => ({
          personaId: p.persona.id,
          personaName: p.persona.displayName,
          suggestedAngle: generateDifferentiatedAngle(keyword, p.persona, personas),
          rationale: `Based on shared interest in "${keyword}"`,
        }))

      if (relevantPersonas.length >= 2) {
        sharedThemes.push({
          theme: keyword,
          relevantPersonas,
        })
      }
    }
  }

  // Dedup and rank by number of relevant personas
  return sharedThemes
    .sort((a, b) => b.relevantPersonas.length - a.relevantPersonas.length)
    .slice(0, 5)
}

/**
 * Generate a differentiated angle for a persona on a shared theme.
 *
 * Uses only public persona info (role, display name) to suggest angles.
 * Does NOT access private Content DNA.
 */
function generateDifferentiatedAngle(
  theme: string,
  persona: ContentPersona,
  allPersonas: Array<{ persona: ContentPersona }>,
): string {
  const name = persona.displayName.toLowerCase()

  // Simple role-based differentiation using only public info
  if (name.includes('devops') || name.includes('sre') || name.includes('platform')) {
    return `${theme}: infrastructure and reliability perspective`
  }
  if (name.includes('ml') || name.includes('ai') || name.includes('data')) {
    return `${theme}: evaluation and model quality perspective`
  }
  if (name.includes('frontend') || name.includes('ui') || name.includes('ux')) {
    return `${theme}: user experience and interface perspective`
  }
  if (name.includes('backend') || name.includes('api') || name.includes('server')) {
    return `${theme}: system design and scalability perspective`
  }
  if (name.includes('full') || name.includes('fullstack')) {
    return `${theme}: end-to-end integration perspective`
  }
  if (name.includes('manager') || name.includes('lead') || name.includes('director')) {
    return `${theme}: team and organizational perspective`
  }
  if (name.includes('fde') || name.includes('solutions') || name.includes('customer')) {
    return `${theme}: customer implementation perspective`
  }

  // Default: differentiate by avoiding duplicate angles
  const existingAngles = allPersonas
    .filter((p) => p.persona.id !== persona.id)
    .map((p) => `${theme}: practical implementation perspective`)

  const baseAngle = `${theme}: practical implementation perspective`
  if (existingAngles.includes(baseAngle) && existingAngles.length > 0) {
    return `${theme}: lessons from production experience`
  }
  return baseAngle
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
}

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'them',
  'their', 'what', 'when', 'where', 'which', 'while', 'about', 'would',
  'could', 'should', 'there', 'these', 'those', 'being', 'other', 'after',
  'before', 'through', 'between', 'under', 'over', 'into', 'your', 'just',
  'like', 'some', 'more', 'very', 'will', 'than', 'then', 'also', 'post',
  'posts', 'content', 'write', 'wrote', 'using', 'used', 'based', 'new',
])

/**
 * Check if two content ideas are too similar (for org-level dedup).
 *
 * Uses simple text similarity on titles/topics only.
 */
export function areIdeasTooSimilar(ideaA: string, ideaB: string, threshold = 0.7): boolean {
  const aWords = new Set(extractKeywords(ideaA))
  const bWords = new Set(extractKeywords(ideaB))

  if (aWords.size === 0 || bWords.size === 0) return false

  let intersection = 0
  for (const word of aWords) {
    if (bWords.has(word)) intersection++
  }
  const union = aWords.size + bWords.size - intersection
  const similarity = union === 0 ? 0 : intersection / union

  return similarity >= threshold
}
