import { pickModelChain } from '@/lib/ai/routing'
import { structuredJsonChain } from '@/lib/ai/provider'

interface TopicExtractionOutput {
  profile_summary: string
  likely_topics: Array<{
    name: string
    description: string
  }>
  values_and_opinions: string[]
}

const TOPIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['profile_summary', 'likely_topics', 'values_and_opinions'],
  properties: {
    profile_summary: { type: 'string' },
    likely_topics: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    values_and_opinions: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string' },
    },
  },
} as const

export async function extractProfileTopics(profileInput: string): Promise<{
  profileSummary: string
  likelyTopics: Array<{ name: string; description: string }>
  valuesAndOpinions: string[]
}> {
  const chain = pickModelChain('extract')
  if (chain.length === 0) {
    return { profileSummary: '', likelyTopics: [], valuesAndOpinions: [] }
  }

  const result = await structuredJsonChain<TopicExtractionOutput>(chain, {
    system: `You extract content themes from a person's profile text. Return JSON only.

Rules:
- Do not invent. Use only what appears in the input.
- likely_topics should be 3-6 concise themes this person can credibly discuss.
- values_and_opinions should be short statements only when clearly grounded in profile text.
- If a field is unknown, return empty string or empty array.`,
    user: `PROFILE OR BIO INPUT:\n"""\n${profileInput.slice(0, 9000)}\n"""`,
    schema: TOPIC_SCHEMA,
  })

  return {
    profileSummary: (result.data.profile_summary ?? '').trim(),
    likelyTopics: (Array.isArray(result.data.likely_topics) ? result.data.likely_topics : [])
      .map((topic) => ({
        name: String(topic.name ?? '').trim(),
        description: String(topic.description ?? '').trim(),
      }))
      .filter((topic) => topic.name.length > 1),
    valuesAndOpinions: (Array.isArray(result.data.values_and_opinions) ? result.data.values_and_opinions : [])
      .map((v) => String(v).trim())
      .filter(Boolean),
  }
}
