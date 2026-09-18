import { hasProvider } from '@/lib/ai/config'
import { generate } from '@/lib/ai/runtime'

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
  if (!hasProvider()) {
    return { profileSummary: '', likelyTopics: [], valuesAndOpinions: [] }
  }

  const result = await generate<TopicExtractionOutput>({
    task: 'FAST_STRUCTURED',
    system: `You extract content themes from a person's profile text. Return JSON only.

Rules:
- Do not invent. Use only what appears in the input.
- likely_topics should be 3-6 concise themes this person can credibly discuss.
- values_and_opinions should be short statements only when clearly grounded in profile text.
- If a field is unknown, return empty string or empty array.`,
    user: `PROFILE OR BIO INPUT:\n"""\n${profileInput.slice(0, 9000)}\n"""`,
    schema: TOPIC_SCHEMA,
    maxTokens: 1024,
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

interface PastPostsExtractionOutput {
  profile_summary: string
  likely_topics: Array<{ name: string; description: string }>
  values_and_opinions: string[]
  humor_style: string
}

const PAST_POSTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['profile_summary', 'likely_topics', 'values_and_opinions', 'humor_style'],
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
    humor_style: { type: 'string' },
  },
} as const

/**
 * Seeds a voice profile directly from a person's own real past posts —
 * consistently more accurate than a handful of onboarding answers, since the
 * writing itself is the ground truth, not a description of it. No scraping,
 * no connected account: the person pastes the text themselves.
 */
export async function extractFromPastPosts(pastPostsInput: string): Promise<{
  profileSummary: string
  likelyTopics: Array<{ name: string; description: string }>
  valuesAndOpinions: string[]
  humorStyle: string
}> {
  if (!hasProvider()) {
    return { profileSummary: '', likelyTopics: [], valuesAndOpinions: [], humorStyle: '' }
  }

  const result = await generate<PastPostsExtractionOutput>({
    task: 'FAST_STRUCTURED',
    system: `You analyze a person's own real past social posts to extract their voice, themes, and convictions. Return JSON only.

Rules:
- Do not invent. Base every field only on patterns actually present across the pasted posts.
- likely_topics: 3-6 concise themes these posts show this person actually writes about.
- values_and_opinions: short statements only when a post states or clearly implies a real opinion — not a guess at what they might believe.
- humor_style: one short phrase (e.g. "dry", "playful", "mostly serious", "none evident") describing the tone actually observed across the posts, not a generic label.
- If a field cannot be grounded in the pasted text, return empty string or empty array.`,
    user: `PASTED PAST POSTS (one or more, boundaries may be informal):\n"""\n${pastPostsInput.slice(0, 12000)}\n"""`,
    schema: PAST_POSTS_SCHEMA,
    maxTokens: 1024,
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
    humorStyle: (result.data.humor_style ?? '').trim(),
  }
}
