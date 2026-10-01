/**
 * Upwork V2 — structured job extraction + application generation.
 *
 * Flow: Paste job page → extract structured data → match against profile →
 * generate proposal + screening answers.
 */

import { fetchOpenAI, withRetry } from '@/lib/intelligence-v3/retry-utils'

export interface UpworkJobInput {
  rawText: string
  url?: string
}

export interface ExtractedUpworkJob {
  title: string
  description: string
  skills: string[]
  budget: number | null
  budgetType: 'fixed' | 'hourly' | null
  hourlyRateMin: number | null
  hourlyRateMax: number | null
  experienceLevel: string | null
  projectLength: string | null
  locationRestrictions: string[]
  clientName: string | null
  screeningQuestions: string[]
}

export interface UpworkApplication {
  coverLetter: string
  questionAnswers: Array<{ question: string; answer: string }>
  fitScore: number
  fitReason: string
  risks: string[]
  matchedProof: Array<{ title: string; description: string }>
}

const UPWORK_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string', description: 'Clean job description without navigation noise' },
    skills: { type: 'array', items: { type: 'string' } },
    budget: { type: 'number', nullable: true },
    budgetType: { type: 'string', enum: ['fixed', 'hourly', null] },
    hourlyRateMin: { type: 'number', nullable: true },
    hourlyRateMax: { type: 'number', nullable: true },
    experienceLevel: { type: 'string', nullable: true },
    projectLength: { type: 'string', nullable: true },
    locationRestrictions: { type: 'array', items: { type: 'string' } },
    clientName: { type: 'string', nullable: true },
    screeningQuestions: { type: 'array', items: { type: 'string' }, description: 'All questions the applicant must answer' },
  },
  required: ['title', 'description', 'skills', 'screeningQuestions'],
  additionalProperties: false,
} as const

/**
 * Extract structured data from raw Upwork job paste.
 */
export async function extractUpworkJob(input: UpworkJobInput): Promise<ExtractedUpworkJob | null> {
  const systemPrompt = `Extract structured data from an Upwork job posting.
Remove navigation, UI elements, and irrelevant content.
Preserve all job requirements, skills, budget info, and screening questions.
If budget is stated as a range, extract both min and max.
If questions are present, extract ALL of them verbatim.`

  const userPrompt = `Extract from this Upwork job posting:

${input.rawText.slice(0, 8000)}`

  const result = await withRetry(
    () => fetchOpenAI(
      process.env.OPENAI_API_KEY || '',
      'gpt-4o-mini',
      'https://api.openai.com/v1',
      systemPrompt,
      userPrompt,
      UPWORK_EXTRACTION_SCHEMA,
      2000,
    ),
    { maxRetries: 1, baseDelayMs: 1000 },
  )

  if (result.error || !result.data) return null

  try {
    const parsed = JSON.parse(result.data) as Record<string, unknown>
    return {
      title: (parsed.title as string) || 'Unknown Job',
      description: (parsed.description as string) || input.rawText.slice(0, 2000),
      skills: Array.isArray(parsed.skills) ? (parsed.skills as string[]) : [],
      budget: (parsed.budget as number) || null,
      budgetType: (parsed.budgetType as 'fixed' | 'hourly' | null) || null,
      hourlyRateMin: (parsed.hourlyRateMin as number) || null,
      hourlyRateMax: (parsed.hourlyRateMax as number) || null,
      experienceLevel: (parsed.experienceLevel as string) || null,
      projectLength: (parsed.projectLength as string) || null,
      locationRestrictions: Array.isArray(parsed.locationRestrictions) ? (parsed.locationRestrictions as string[]) : [],
      clientName: (parsed.clientName as string) || null,
      screeningQuestions: Array.isArray(parsed.screeningQuestions) ? (parsed.screeningQuestions as string[]) : [],
    }
  } catch {
    return null
  }
}

/**
 * Generate Upwork application (cover letter + screening answers).
 */
export async function generateUpworkApplication(
  job: ExtractedUpworkJob,
  profile: {
    identityName: string
    skills: string[]
    technologies: string[]
    expertise: string[]
    industries: string[]
    allowedClaims: string[]
    projects?: Array<{ title: string; description: string; technologies: string[] }>
  },
  matchScore: number,
  matchingCapabilities: string[],
  missingCapabilities: string[],
): Promise<UpworkApplication | null> {
  const hasQuestions = job.screeningQuestions.length > 0

  const systemPrompt = `You write Upwork proposals for a software developer.
Rules:
- Be concise and specific (3-5 short paragraphs max)
- Reference REAL skills from the profile only — never fabricate experience
- Address the client's specific needs from the job description
- If screening questions exist, answer each one separately and truthfully
- Use professional tone
- If a required skill is missing from the profile, acknowledge it honestly rather than claiming false expertise`

  const profileContext = `
Profile: ${profile.identityName}
Skills: ${profile.skills.join(', ')}
Technologies: ${profile.technologies.join(', ')}
Expertise: ${profile.expertise.join(', ')}
Industries: ${profile.industries.join(', ')}
Allowed claims: ${profile.allowedClaims.join(', ')}
${profile.projects && profile.projects.length > 0 ? `Projects:\n${profile.projects.map(p => `- ${p.title}: ${p.description || ''} (${p.technologies.join(', ')})`).join('\n')}` : ''}

Match score: ${matchScore}/100
Matching capabilities: ${matchingCapabilities.join(', ')}
Missing capabilities: ${missingCapabilities.join(', ')}
`

  const jobContext = `
Job: ${job.title}
Budget: ${job.budget ? `$${job.budget} ${job.budgetType || ''}` : 'Not specified'}
Skills needed: ${job.skills.join(', ')}
Description: ${job.description.slice(0, 3000)}
${hasQuestions ? `\nScreening Questions:\n${job.screeningQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}` : ''}
`

  const outputSchema = {
    type: 'object',
    properties: {
      coverLetter: { type: 'string' },
      questionAnswers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
          },
          required: ['question', 'answer'],
        },
      },
      fitReason: { type: 'string' },
      risks: { type: 'array', items: { type: 'string' } },
      matchedProof: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['title'],
        },
      },
    },
    required: ['coverLetter', 'questionAnswers', 'fitReason', 'risks', 'matchedProof'],
    additionalProperties: false,
  }

  const result = await withRetry(
    () => fetchOpenAI(
      process.env.OPENAI_API_KEY || '',
      'gpt-4o-mini',
      'https://api.openai.com/v1',
      systemPrompt,
      `${profileContext}\n\n${jobContext}`,
      outputSchema,
      3000,
    ),
    { maxRetries: 1, baseDelayMs: 1000 },
  )

  if (result.error || !result.data) return null

  try {
    const parsed = JSON.parse(result.data) as Record<string, unknown>
    return {
      coverLetter: (parsed.coverLetter as string) || '',
      questionAnswers: Array.isArray(parsed.questionAnswers)
        ? (parsed.questionAnswers as Array<{ question: string; answer: string }>)
        : [],
      fitScore: matchScore,
      fitReason: (parsed.fitReason as string) || '',
      risks: Array.isArray(parsed.risks) ? (parsed.risks as string[]) : [],
      matchedProof: Array.isArray(parsed.matchedProof)
        ? (parsed.matchedProof as Array<{ title: string; description: string }>)
        : [],
    }
  } catch {
    return null
  }
}
