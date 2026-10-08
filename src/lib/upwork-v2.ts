/**
 * Upwork V2 — structured job extraction + application generation.
 *
 * Flow: Paste job page → extract structured data → match against profile →
 * generate proposal + screening answers.
 *
 * Extraction uses AI first, then deterministic fallback to fill any fields
 * the AI missed. This ensures structured fields are never empty when the
 * raw text contains the information.
 */

import { fetchOpenAI, withRetry } from '@/lib/intelligence-v3/retry-utils'
import { generate } from '@/lib/ai/runtime'

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
  engagementType: string | null
  weeklyHours: string | null
  duration: string | null
  applicationRequirements: string[]
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
    title: { type: 'string', description: 'Job title exactly as stated' },
    description: { type: 'string', description: 'Clean job description without navigation noise. Preserve all requirements, responsibilities, and application instructions.' },
    skills: { type: 'array', items: { type: 'string' }, description: 'ALL technical skills, technologies, frameworks, platforms mentioned. Be thorough — list every one.' },
    budget: { type: 'number', nullable: true, description: 'Budget amount if fixed price' },
    budgetType: { type: 'string', enum: ['fixed', 'hourly', null] },
    hourlyRateMin: { type: 'number', nullable: true, description: 'Minimum hourly rate in USD' },
    hourlyRateMax: { type: 'number', nullable: true, description: 'Maximum hourly rate in USD' },
    experienceLevel: { type: 'string', nullable: true, description: 'Entry, Intermediate, Expert, or specific years' },
    projectLength: { type: 'string', nullable: true, description: 'Duration: e.g. 3 months, 6+ months, ongoing' },
    locationRestrictions: { type: 'array', items: { type: 'string' } },
    clientName: { type: 'string', nullable: true },
    screeningQuestions: { type: 'array', items: { type: 'string' }, description: 'ALL questions the applicant must answer verbatim' },
    engagementType: { type: 'string', nullable: true, description: 'Full-time, part-time, contract, contract-to-hire' },
    weeklyHours: { type: 'string', nullable: true, description: 'Hours per week if stated' },
    duration: { type: 'string', nullable: true, description: 'Project duration if stated' },
    applicationRequirements: { type: 'array', items: { type: 'string' }, description: 'What the applicant must submit: resume, portfolio, rate, availability, references, etc.' },
  },
  required: ['title', 'description', 'skills', 'screeningQuestions', 'applicationRequirements'],
  additionalProperties: false,
} as const

export type UpworkExtractionError =
  | 'INVALID_INPUT'
  | 'AI_PROVIDER_FAILURE'
  | 'SCHEMA_FAILURE'
  | 'TIMEOUT'

export interface UpworkExtractionResult {
  job: ExtractedUpworkJob | null
  error: UpworkExtractionError | null
  degraded: boolean
  diagnostics: {
    provider: string
    textLength: number
    stage: string
  }
}

// ── Deterministic Backfill ───────────────────────────────────────────────────
// When AI extraction misses fields that are clearly present in the raw text,
// these functions fill the gaps. Zero AI cost.

const TECH_KEYWORDS = [
  'react native', 'react', 'javascript', 'typescript', 'node.js', 'nodejs', 'node',
  'java', 'python', 'swift', 'kotlin', 'flutter', 'dart',
  'rest api', 'restful', 'graphql', 'json',
  'postgresql', 'mysql', 'mongodb', 'firebase', 'sqlite',
  'aws', 'google cloud', 'gcp', 'azure', 'heroku',
  'docker', 'kubernetes', 'ci/cd', 'devops',
  'git', 'github', 'gitlab',
  'gps', 'geolocation', 'maps', 'google maps',
  'stripe', 'payment', 'paypal',
  'erp', 'crm',
  'redis', 'elasticsearch', 'kafka',
  'html', 'css', 'sass', 'tailwind',
  'vue', 'angular', 'svelte',
  'next.js', 'nextjs', 'express', 'fastapi', 'django', 'flask',
  'spring', 'rails', 'laravel',
  'terraform', 'ansible', 'jenkins',
  'prometheus', 'grafana', 'datadog',
  'ios', 'android', 'web', 'frontend', 'backend', 'full-stack', 'fullstack',
]

interface BackfillInput {
  rawText: string
  aiSkills: string[]
  aiQuestions: string[]
  aiReqs: string[]
  aiHourlyMin: number | null
  aiHourlyMax: number | null
  aiBudget: number | null
  aiBudgetType: 'fixed' | 'hourly' | null
  aiExperience: string | null
  aiProjectLength: string | null
  aiEngagement: string | null
  aiWeeklyHours: string | null
  aiDuration: string | null
}

interface BackfillResult {
  skills: string[]
  hourlyRateMin: number | null
  hourlyRateMax: number | null
  budget: number | null
  budgetType: 'fixed' | 'hourly' | null
  experienceLevel: string | null
  projectLength: string | null
  screeningQuestions: string[]
  engagementType: string | null
  weeklyHours: string | null
  duration: string | null
  applicationRequirements: string[]
}

function backfillFromRawText(input: BackfillInput): BackfillResult {
  const { rawText } = input
  const lower = rawText.toLowerCase()

  // Skills: merge AI + deterministic scan
  const skills = mergeSkills(input.aiSkills, extractSkillsFromRaw(rawText))

  // Budget: use AI if present, else scan
  let hourlyRateMin = input.aiHourlyMin
  let hourlyRateMax = input.aiHourlyMax
  let budget = input.aiBudget
  let budgetType = input.aiBudgetType

  if (hourlyRateMin === null) {
    const rate = extractHourlyRate(rawText)
    hourlyRateMin = rate.min
    hourlyRateMax = rate.max
  }
  if (budget === null && budgetType !== 'hourly') {
    budget = extractFixedBudget(rawText)
  }
  if (budgetType === null) {
    if (hourlyRateMin !== null) budgetType = 'hourly'
    else if (budget !== null) budgetType = 'fixed'
  }

  // Experience
  const experienceLevel = input.aiExperience ?? extractExperience(rawText)

  // Project length / duration
  const projectLength = input.aiProjectLength ?? extractProjectLength(rawText)

  // Engagement type
  const engagementType = input.aiEngagement ?? extractEngagementType(rawText)

  // Weekly hours
  const weeklyHours = input.aiWeeklyHours ?? extractWeeklyHours(rawText)

  // Duration
  const duration = input.aiDuration ?? extractDuration(rawText)

  // Screening questions: use AI if present, else extract from text
  const screeningQuestions = input.aiQuestions.length > 0
    ? input.aiQuestions
    : extractScreeningQuestions(rawText)

  // Application requirements
  const applicationRequirements = input.aiReqs.length > 0
    ? input.aiReqs
    : extractApplicationRequirements(rawText)

  return {
    skills,
    hourlyRateMin,
    hourlyRateMax,
    budget,
    budgetType,
    experienceLevel,
    projectLength,
    screeningQuestions,
    engagementType,
    weeklyHours,
    duration,
    applicationRequirements,
  }
}

function extractSkillsFromRaw(text: string): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []
  for (const tech of TECH_KEYWORDS) {
    if (lower.includes(tech.toLowerCase()) && !found.some(f => f.toLowerCase() === tech.toLowerCase())) {
      found.push(tech)
    }
  }
  return found
}

function mergeSkills(aiSkills: string[], rawSkills: string[]): string[] {
  const all = new Map<string, string>()
  for (const s of aiSkills) all.set(s.toLowerCase(), s)
  for (const s of rawSkills) all.set(s.toLowerCase(), s)
  return Array.from(all.values())
}

function extractHourlyRate(text: string): { min: number | null; max: number | null } {
  // Normalize whitespace (Upwork often splits across lines)
  const normalized = text.replace(/\s+/g, ' ').trim()

  // Patterns: $5-$15/hour, $5 - $15 per hour, $10/hr, $10 per hour
  const rangeMatch = normalized.match(/\$\s*(\d+(?:\.\d+)?)\s*[-–]\s*\$\s*(\d+(?:\.\d+)?)\s*(?:\/|per\s*)?(?:hour|hr)?/i)
  if (rangeMatch) {
    return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) }
  }
  // Also check for separate lines: $25.00 / $60.00 with "Hourly" nearby
  const looseMatch = normalized.match(/\$\s*(\d+(?:\.\d+)?)\s*[-–]\s*.*?\$\s*(\d+(?:\.\d+)?)/i)
  if (looseMatch && /\b(hourly|hour|hr|per hour)\b/i.test(normalized)) {
    return { min: parseFloat(looseMatch[1]), max: parseFloat(looseMatch[2]) }
  }
  const singleMatch = normalized.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:\/|per\s*)?(?:hour|hr)/i)
  if (singleMatch) {
    const rate = parseFloat(singleMatch[1])
    return { min: rate, max: rate }
  }
  return { min: null, max: null }
}

function extractFixedBudget(text: string): number | null {
  const match = text.match(/\$\s*(\d{4,6})(?:\s*(?:budget|total|price))/i)
  return match ? parseFloat(match[1]) : null
}

function extractExperience(text: string): string | null {
  if (/\bexpert\b/i.test(text)) return 'Expert'
  if (/\bintermediate\b/i.test(text)) return 'Intermediate'
  if (/\bentry[- ]?level\b/i.test(text)) return 'Entry'
  const yearsMatch = text.match(/(\d+)\+?\s*years?(?:\s*of)?\s*experience/i)
  if (yearsMatch) return `${yearsMatch[1]}+ years`
  return null
}

function extractProjectLength(text: string): string | null {
  if (/\bongoing\b/i.test(text)) return 'Ongoing'
  if (/\blong[- ]term\b/i.test(text)) return 'Long-term'
  const match = text.match(/(\d+)\+?\s*(?:months?|weeks?)/i)
  return match ? match[0] : null
}

function extractEngagementType(text: string): string | null {
  if (/\bcontract[- ]to[- ]hire\b/i.test(text)) return 'Contract-to-hire'
  if (/\bfull[- ]time\b/i.test(text)) return 'Full-time'
  if (/\bpart[- ]time\b/i.test(text)) return 'Part-time'
  if (/\bcontract\b/i.test(text)) return 'Contract'
  // Upwork "Hourly" engagement type
  if (/\bhourly\b/i.test(text)) return 'Hourly'
  return null
}

function extractWeeklyHours(text: string): string | null {
  const match = text.match(/(\d+)\+?\s*hrs?\s*(?:\/|per)\s*week/i)
  return match ? `${match[1]}+ hrs/week` : null
}

function extractDuration(text: string): string | null {
  if (/\bmore than 6 months\b/i.test(text)) return '6+ months'
  if (/\bmore than 3 months\b/i.test(text)) return '3+ months'
  const match = text.match(/(\d+)\+?\s*months?/i)
  return match ? `${match[1]}+ months` : null
}

function extractScreeningQuestions(text: string): string[] {
  const questions: string[] = []
  // Look for "How to Apply" or "To Apply" sections
  const applySection = text.match(/(?:how to apply|to apply|interested candidates should|applicants should submit)[:\s]*\n([\s\S]*?)(?:\n\n|\n#{3,}|_{10,})/i)
  if (applySection) {
    const lines = applySection[1].split('\n').map(l => l.trim()).filter(l => l.length > 10)
    for (const line of lines) {
      // Lines ending with ? are questions
      if (line.endsWith('?')) questions.push(line)
      // Lines that ask for specific info
      if (/\b(share|describe|provide|submit|include|tell us|explain)\b/i.test(line)) {
        questions.push(line)
      }
    }
  }
  return questions
}

function extractApplicationRequirements(text: string): string[] {
  const reqs: string[] = []
  const patterns = [
    { pattern: /resume|cv|curriculum vitae/i, label: 'Updated résumé or CV' },
    { pattern: /portfolio|examples of (?:previous|past) work/i, label: 'Work portfolio or examples' },
    { pattern: /hourly rate|monthly retainer|proposed rate|your rate/i, label: 'Proposed rate (hourly or monthly)' },
    { pattern: /availability|preferred working arrangement|weekly hours/i, label: 'Availability and working arrangement' },
    { pattern: /references|client testimonials/i, label: 'Professional references or testimonials' },
    { pattern: /cover letter|summary of experience/i, label: 'Cover letter or experience summary' },
    { pattern: /github|source code/i, label: 'GitHub or code samples' },
  ]
  for (const { pattern, label } of patterns) {
    if (pattern.test(text)) reqs.push(label)
  }
  return reqs
}

function extractTitleFromRaw(text: string): string {
  // First line is usually the title
  const firstLine = text.split('\n').map(l => l.trim()).filter(Boolean)[0] || ''
  return firstLine.slice(0, 120) || 'Unknown Job'
}

/**
 * Extract structured data from raw Upwork job paste.
 *
 * Returns typed failure with diagnostics instead of silent null.
 */
export async function extractUpworkJob(input: UpworkJobInput): Promise<UpworkExtractionResult> {
  const textLength = input.rawText.trim().length
  if (textLength < 50) {
    return { job: null, error: 'INVALID_INPUT', degraded: false, diagnostics: { provider: 'none', textLength, stage: 'validation' } }
  }

  const systemPrompt = `You are a structured data extractor for Upwork job postings.

Your job: extract EVERY piece of structured information from the raw job text.

Rules:
1. skills: List ALL technologies, frameworks, platforms, tools mentioned anywhere in the job. Include mobile, backend, database, cloud, DevOps, domain-specific. Never leave empty if tech is mentioned.
2. hourlyRateMin/Max: Extract from patterns like "$5-$15/hour", "$10/hr", "budget: $20/hour". If only one number, use it for both min and max.
3. budget: Extract fixed-price budget if stated.
4. budgetType: "hourly" if hourly rates mentioned, "fixed" if fixed price, null if unclear.
5. experienceLevel: Extract "Expert", "Intermediate", "Entry", or years like "5+ years".
6. projectLength / duration: Extract "3 months", "6+ months", "ongoing", "long-term".
7. weeklyHours: Extract "30+ hrs/week", "40 hours per week", "part-time".
8. engagementType: "full-time", "part-time", "contract", "contract-to-hire".
9. screeningQuestions: Extract ALL questions applicants must answer. Look for numbered lists, "How to Apply" sections.
10. applicationRequirements: What must the applicant submit? (resume, portfolio, rate, availability, references, etc.)
11. description: Clean description preserving all requirements and responsibilities.

Be thorough. If information exists in the text, extract it. Do not leave fields empty when the raw text contains the data.`

  const userPrompt = `Extract ALL structured data from this Upwork job posting:

${input.rawText.slice(0, 10000)}`

  // Helper: parse AI output into structured job
  const parseJob = (data: Record<string, unknown>, provider: string, degraded: boolean): UpworkExtractionResult => {
    const rawText = input.rawText
    const aiSkills = Array.isArray(data.skills) ? (data.skills as string[]) : []
    const aiQuestions = Array.isArray(data.screeningQuestions) ? (data.screeningQuestions as string[]) : []
    const aiReqs = Array.isArray(data.applicationRequirements) ? (data.applicationRequirements as string[]) : []

    // Backfill any fields the AI missed. Isolated in try-catch so a backfill
    // failure never crashes the entire extraction.
    let backfilled: BackfillResult
    try {
      backfilled = backfillFromRawText({
        rawText,
        aiSkills,
        aiQuestions,
        aiReqs,
        aiHourlyMin: (data.hourlyRateMin as number) ?? null,
        aiHourlyMax: (data.hourlyRateMax as number) ?? null,
        aiBudget: (data.budget as number) ?? null,
        aiBudgetType: (data.budgetType as 'fixed' | 'hourly' | null) ?? null,
        aiExperience: (data.experienceLevel as string) ?? null,
        aiProjectLength: (data.projectLength as string) ?? null,
        aiEngagement: (data.engagementType as string) ?? null,
        aiWeeklyHours: (data.weeklyHours as string) ?? null,
        aiDuration: (data.duration as string) ?? null,
      })
    } catch (backfillErr) {
      console.warn('[upwork-extract] Backfill failed, using AI data only:', backfillErr instanceof Error ? backfillErr.message : String(backfillErr))
      backfilled = {
        skills: aiSkills,
        hourlyRateMin: (data.hourlyRateMin as number) ?? null,
        hourlyRateMax: (data.hourlyRateMax as number) ?? null,
        budget: (data.budget as number) ?? null,
        budgetType: (data.budgetType as 'fixed' | 'hourly' | null) ?? null,
        experienceLevel: (data.experienceLevel as string) ?? null,
        projectLength: (data.projectLength as string) ?? null,
        screeningQuestions: aiQuestions,
        engagementType: (data.engagementType as string) ?? null,
        weeklyHours: (data.weeklyHours as string) ?? null,
        duration: (data.duration as string) ?? null,
        applicationRequirements: aiReqs,
      }
    }

    return {
      job: {
        title: (data.title as string) || extractTitleFromRaw(rawText),
        description: (data.description as string) || rawText.slice(0, 3000),
        skills: backfilled.skills,
        budget: backfilled.budget,
        budgetType: backfilled.budgetType,
        hourlyRateMin: backfilled.hourlyRateMin,
        hourlyRateMax: backfilled.hourlyRateMax,
        experienceLevel: backfilled.experienceLevel,
        projectLength: backfilled.projectLength,
        locationRestrictions: Array.isArray(data.locationRestrictions) ? (data.locationRestrictions as string[]) : [],
        clientName: (data.clientName as string) ?? null,
        screeningQuestions: backfilled.screeningQuestions,
        engagementType: backfilled.engagementType,
        weeklyHours: backfilled.weeklyHours,
        duration: backfilled.duration,
        applicationRequirements: backfilled.applicationRequirements,
      },
      error: null,
      degraded,
      diagnostics: { provider, textLength, stage: 'parsed' },
    }
  }

  // Try runtime router first (supports Groq, OpenAI, LongCat with failover)
  try {
    const result = await generate<Record<string, unknown>>({
      task: 'FAST_STRUCTURED',
      system: systemPrompt,
      user: userPrompt,
      schema: UPWORK_EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
      schemaName: 'upwork_extraction',
      maxTokens: 2000,
      callSite: 'upwork-v2:extract',
      feature: 'upwork_extraction',
    })

    if (result.data && typeof result.data === 'object') {
      try {
        return parseJob(result.data, 'runtime', false)
      } catch (parseErr) {
        console.error('[upwork-extract] Runtime parse failed:', parseErr instanceof Error ? parseErr.message : JSON.stringify(parseErr))
        // Fall through to raw extraction
      }
    }
  } catch (err) {
    console.error('[upwork-extract] Runtime router failed:', err instanceof Error ? err.message : JSON.stringify(err))
  }

  // Fallback: direct OpenAI call
  try {
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

    if (result.data) {
      try {
        const parsed = JSON.parse(result.data) as Record<string, unknown>
        if (parsed && typeof parsed === 'object') {
          return parseJob(parsed, 'openai-fallback', true)
        }
      } catch {
        console.error('[upwork-extract] Schema parse failure')
        return { job: null, error: 'SCHEMA_FAILURE', degraded: false, diagnostics: { provider: 'openai', textLength, stage: 'parse' } }
      }
    }
  } catch (err) {
    console.error('[upwork-extract] OpenAI fallback failed:', err instanceof Error ? err.message : JSON.stringify(err))
  }

  return { job: null, error: 'AI_PROVIDER_FAILURE', degraded: false, diagnostics: { provider: 'all', textLength, stage: 'all-providers-failed' } }
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
Engagement: ${job.engagementType ?? 'Not specified'} ${job.weeklyHours ? `(${job.weeklyHours})` : ''}
Duration: ${job.duration ?? job.projectLength ?? 'Not specified'}
Budget: ${job.hourlyRateMin ? `$${job.hourlyRateMin}-$${job.hourlyRateMax ?? job.hourlyRateMin}/hour` : job.budget ? `$${job.budget} ${job.budgetType ?? ''}` : 'Not specified'}
Experience: ${job.experienceLevel ?? 'Not specified'}
Skills needed: ${job.skills.join(', ')}
Description: ${job.description.slice(0, 3000)}
${job.applicationRequirements.length > 0 ? `\nApplication Requirements:\n${job.applicationRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : ''}
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
