/**
 * Semantic Similarity abstraction.
 *
 * Uses deterministic text similarity as the primary implementation.
 * Provides an embedding-ready interface that can be enabled when pgvector
 * is available in the deployment environment.
 *
 * To enable pgvector:
 * 1. Add `create extension vector;` to a migration
 * 2. Add `embedding vector(1536)` columns to content_memories
 * 3. Set `SCOUT_EMBEDDINGS_ENABLED=true` in env
 * 4. The EmbeddingProvider implementation will be picked up automatically
 */

export interface SimilarityResult {
  content: string
  similarity: number
  source: 'deterministic' | 'embedding'
}

export interface SimilarityProvider {
  isAvailable(): boolean
  findSimilar(query: string, candidates: string[], threshold?: number): Promise<SimilarityResult[]>
}

/**
 * Deterministic similarity using word overlap (Jaccard) and prefix matching.
 *
 * This is the default implementation. It requires no external services
 * and works reliably for:
 * - Duplicate hook detection
 * - Similar topic identification
 * - Angle repetition detection
 *
 * Limitations:
 * - Does not understand semantic similarity (e.g. "car" vs "automobile")
 * - Does not handle paraphrase well
 */
export function findSimilarDeterministic(
  query: string,
  candidates: string[],
  threshold = 0.6,
): SimilarityResult[] {
  const results: SimilarityResult[] = []
  const normalizedQuery = normalizeText(query)
  const queryWords = new Set(normalizedQuery.split(' '))

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate)

    // Prefix match (high confidence) - compare first 30 chars of both
    const prefixLen = Math.min(30, normalizedQuery.length)
    if (prefixLen >= 10 && normalizedQuery.slice(0, prefixLen) === normalized.slice(0, prefixLen)) {
      results.push({ content: candidate, similarity: 0.9, source: 'deterministic' })
      continue
    }

    // Word overlap (Jaccard)
    const candidateWords = new Set(normalized.split(' '))
    let intersection = 0
    for (const word of queryWords) {
      if (candidateWords.has(word)) intersection++
    }
    const union = queryWords.size + candidateWords.size - intersection
    const similarity = union === 0 ? 0 : intersection / union

    if (similarity >= threshold) {
      results.push({ content: candidate, similarity, source: 'deterministic' })
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity)
}

/**
 * Check if a query is a duplicate of any candidate.
 */
export function isDuplicate(
  query: string,
  candidates: string[],
  threshold = 0.7,
): { isDuplicate: boolean; mostSimilar: SimilarityResult | null } {
  const results = findSimilarDeterministic(query, candidates, threshold)
  if (results.length === 0) return { isDuplicate: false, mostSimilar: null }
  return { isDuplicate: true, mostSimilar: results[0] }
}

/**
 * Find the most similar previous post to a new idea.
 */
export function findMostSimilar(
  query: string,
  candidates: string[],
): SimilarityResult | null {
  const results = findSimilarDeterministic(query, candidates, 0.3)
  return results.length > 0 ? results[0] : null
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Embedding provider configuration.
 *
 * When SCOUT_EMBEDDINGS_ENABLED is true and a provider is configured,
 * the system will use embeddings for semantic similarity.
 *
 * Current status: pgvector not enabled in this deployment.
 * The deterministic fallback is used instead.
 *
 * To enable embeddings:
 * 1. Run: create extension if not exists vector;
 * 2. Add embedding columns to content_memories
 * 3. Set SCOUT_EMBEDDINGS_ENABLED=true
 * 4. Configure SCOUT_EMBEDDING_MODEL (default: text-embedding-3-small)
 */
export function areEmbeddingsEnabled(): boolean {
  return process.env.SCOUT_EMBEDDINGS_ENABLED === 'true' && Boolean(process.env.EMBEDDING_API_KEY)
}
