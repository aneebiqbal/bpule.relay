import OpenAI from 'openai'
import { embeddingApiKey, embeddingBaseUrl, embeddingModel, hasEmbeddingProvider } from '@/lib/ai/config'

/**
 * Lightweight embedding layer for semantic proof matching.
 *
 * Each proof item's summary is embedded once when added (cheap one-time cost).
 * At draft time the lead's context is embedded and matched via pgvector.
 *
 * Defaults to OpenAI text-embedding-3-small (very low cost, 384 dims).
 * The embedding client is separate from the Groq chat client so the provider
 * and base URL can differ.
 */

let client: OpenAI | null = null
let clientKey = ''
let clientBase = ''

function getClient(): OpenAI {
  const key = embeddingApiKey()
  if (!key) {
    throw new Error(
      'Embedding API key is not set. Add EMBEDDING_API_KEY to .env.local for semantic proof matching.',
    )
  }
  const baseURL = embeddingBaseUrl()
  if (!client || clientKey !== key || clientBase !== baseURL) {
    client = new OpenAI({ apiKey: key, baseURL })
    clientKey = key
    clientBase = baseURL
  }
  return client
}

/**
 * Embed a single text string. Returns a 384-dim float array.
 * Falls back to a deterministic hash-based pseudo-embedding when no provider
 * is configured so local development does not crash.
 */
export async function embedText(text: string): Promise<number[]> {
  if (!hasEmbeddingProvider()) {
    return fallbackEmbedding(text)
  }
  const api = getClient()
  const res = await api.embeddings.create({
    model: embeddingModel(),
    input: text.slice(0, 8000),
  })
  const vec = res.data[0]?.embedding
  if (!vec || vec.length === 0) {
    throw new Error('Embedding API returned an empty vector.')
  }
  return vec
}

/**
 * Batch embed multiple texts in one call.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  if (!hasEmbeddingProvider()) {
    return texts.map((t) => fallbackEmbedding(t))
  }
  const api = getClient()
  const res = await api.embeddings.create({
    model: embeddingModel(),
    input: texts.map((t) => t.slice(0, 8000)),
  })
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}

/**
 * DEMO ONLY: deterministic pseudo-embedding so local development can test
 * the similarity pipeline without an embedding API key.
 * Not suitable for production; real vectors are required for meaningful matches.
 */
function fallbackEmbedding(text: string): number[] {
  const vec = new Array(384).fill(0)
  const lower = text.toLowerCase()
  let hash = 0
  for (let i = 0; i < lower.length; i++) {
    hash = (hash * 31 + lower.charCodeAt(i)) % 1000003
    vec[i % 384] += (hash % 1000) / 1000 - 0.5
  }
  // L2-normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map((v) => v / norm)
}
