import type { ContentMemory, ContentMemoryType } from '@/lib/domain/types'

/**
 * Content Memory service.
 *
 * Tracks what a person has already covered so Relay can avoid repetition
 * and intentionally diversify future content.
 *
 * Uses structured SQL as the source of truth. No embeddings needed for
 * the core repetition-detection path.
 */

export interface MemoryCheckResult {
  isDuplicate: boolean
  similarMemories: Array<{ type: ContentMemoryType; content: string; similarity: number }>
  reason: string
}

/**
 * Check whether a topic/angle/hook has been covered before.
 *
 * Uses normalized text comparison (prefix + keyword overlap) rather than
 * embeddings — deterministic, fast, no model cost.
 */
export function checkMemoryForDuplicates(
  text: string,
  existingMemories: ContentMemory[],
  threshold = 0.7,
): MemoryCheckResult {
  const normalized = normalizeText(text)
  const similarMemories: MemoryCheckResult['similarMemories'] = []

  for (const memory of existingMemories) {
    const memNorm = normalizeText(memory.content)
    const similarity = computeSimilarity(normalized, memNorm)
    if (similarity >= threshold) {
      similarMemories.push({ type: memory.memoryType, content: memory.content, similarity })
    }
  }

  const isDuplicate = similarMemories.length > 0
  const reason = isDuplicate
    ? `Similar to ${similarMemories.length} previous ${similarMemories[0].type.replace('_', ' ')}: "${similarMemories[0].content.slice(0, 60)}..."`
    : ''

  return { isDuplicate, similarMemories, reason }
}

/**
 * Extract memories from a published or accepted draft.
 *
 * Called after a post is accepted to record what was covered.
 */
export function extractMemoriesFromDraft(caption: string, hook: string): Array<{ type: ContentMemoryType; content: string }> {
  const memories: Array<{ type: ContentMemoryType; content: string }> = []

  // Record the hook
  if (hook.trim()) {
    memories.push({ type: 'hook_used', content: hook.trim().slice(0, 200) })
  }

  // Extract key phrases as topics (simple noun-phrase extraction)
  const sentences = caption.split(/[.!?]+/).filter((s) => s.trim().length > 10)
  for (const sentence of sentences.slice(0, 3)) {
    const topic = sentence.trim().slice(0, 100)
    if (topic.length > 10) {
      memories.push({ type: 'topic_covered', content: topic })
    }
  }

  return memories
}

/**
 * Extract memories from a user's idea/angle description.
 */
export function extractMemoriesFromIdea(idea: string, angle: string): Array<{ type: ContentMemoryType; content: string }> {
  const memories: Array<{ type: ContentMemoryType; content: string }> = []
  if (angle.trim()) {
    memories.push({ type: 'angle_used', content: angle.trim().slice(0, 200) })
  }
  const topic = idea.trim().split(/[.!?]/)[0]?.trim().slice(0, 100) ?? ''
  if (topic.length > 5) {
    memories.push({ type: 'topic_covered', content: topic })
  }
  return memories
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function computeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1

  // Prefix match (30 chars)
  if (a.slice(0, 30) === b.slice(0, 30)) return 0.9

  // Word overlap (Jaccard)
  const aWords = new Set(a.split(' '))
  const bWords = new Set(b.split(' '))
  let intersection = 0
  for (const word of aWords) {
    if (bWords.has(word)) intersection++
  }
  const union = aWords.size + bWords.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Build a memory-aware prompt block for generation.
 */
export function buildMemoryPromptBlock(memories: ContentMemory[]): string {
  if (memories.length === 0) return ''

  const recentTopics = memories
    .filter((m) => m.memoryType === 'topic_covered')
    .slice(0, 5)
    .map((m) => m.content)

  const recentHooks = memories
    .filter((m) => m.memoryType === 'hook_used')
    .slice(0, 3)
    .map((m) => m.content)

  const sections: string[] = []
  if (recentTopics.length > 0) {
    sections.push(`Topics recently covered: ${recentTopics.join('; ')}`)
  }
  if (recentHooks.length > 0) {
    sections.push(`Hooks recently used: ${recentHooks.join('; ')}`)
  }

  if (sections.length === 0) return ''
  return `RECENT CONTENT MEMORY (do not repeat these topics/hooks):\n${sections.join('\n')}`
}
