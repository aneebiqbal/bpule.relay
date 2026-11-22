import type { DiscoveryJob } from './types'

/**
 * Job Requirements Intelligence.
 *
 * Deterministic extraction from the posting text. It separates hard
 * requirements from preferred qualifications and keeps the source line for
 * every claim. Vague marketing prose is never promoted to a requirement.
 */

export interface JobRequirements {
  version: 1
  sourceHash: string | null
  requiredSkills: string[]
  preferredSkills: string[]
  seniority: string | null
  yearsExperience: { min: number | null; max: number | null }
  stack: string[]
  responsibilities: string[]
  domains: string[]
  languages: string[]
  certifications: string[]
  portfolioExpected: boolean
  employmentType: string | null
  hardRequirements: string[]
  preferredQualifications: string[]
  evidence: Array<{ text: string; decision: string }>
  confidence: 'high' | 'medium' | 'low'
}

const SENIORITY: Array<[RegExp, string]> = [
  [/intern|trainee|junior|associate|graduate/i, 'junior'],
  [/mid[- ]level|intermediate|software engineer ii|engineer ii/i, 'mid'],
  [/senior|sr\.?|staff|lead|principal|head of|architect|manager/i, 'senior'],
]

const DOMAINS: Array<[RegExp, string]> = [
  [/fintech|payments?|banking|lending|insur/i, 'fintech'],
  [/health|medical|clinic|pharma/i, 'healthcare'],
  [/e[- ]?commerce|retail|marketplace|shopify/i, 'ecommerce'],
  [/saas|b2b|enterprise software/i, 'saas'],
  [/web3|blockchain|crypto|defi|bitcoin/i, 'web3'],
  [/machine learning|artificial intelligence|\bai\b|llm/i, 'ai'],
  [/education|edtech|learning/i, 'education'],
  [/logistics|supply chain|freight|delivery/i, 'logistics'],
  [/gaming|game/i, 'gaming'],
  [/security|infosec|compliance/i, 'security'],
]

const LANGUAGES = [
  'English', 'German', 'French', 'Spanish', 'Portuguese', 'Dutch',
  'Urdu', 'Hindi', 'Mandarin', 'Japanese', 'Korean', 'Arabic',
]

const CERTIFICATIONS = [
  'AWS', 'Azure', 'GCP', 'PMP', 'Scrum', 'CISSP', 'CKA', 'CKAD',
  'Terraform', 'Salesforce', 'HubSpot', 'Google Analytics',
]

// Curated technical vocabulary. Feed tags are noisy ("marketing", "medical"),
// so requirements only treat recognisable technologies as stack skills.
const TECH_PATTERN = new RegExp(
  '\\b(javascript|typescript|python|ruby|rails|react|node\\.?js|next\\.?js|vue|angular|svelte|express|nest|django|flask|fastapi|java|spring|kotlin|swift|flutter|dotnet|c#|c\\+\\+|golang|\\bgo\\b|rust|php|laravel|postgresql|mysql|mariadb|mongodb|redis|elasticsearch|kafka|rabbitmq|aws|gcp|azure|google cloud|docker|kubernetes|terraform|ci\\/cd|graphql|rest\\b|sql|nosql|linux|git|tensorflow|pytorch|machine learning|devops|sre|security|testing|jest|cypress|playwright)\\b',
  'i',
)

const HARD_MARKERS = /\b(must|required|requirements?|at least|proven|demonstrated|strong|solid|extensive|ability to|experience with|knowledge of)\b/i
const PREFERRED_MARKERS = /\b(nice to have|preferred|preference|bonus|ideally|ideally you|plus|would be great|advantage|helpful|familiarity with)\b/i

function cleanLine(line: string): string {
  return line
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bulletLines(description: string): string[] {
  return description
    .split(/\n+/)
    .map(cleanLine)
    .filter((line) => line.length > 12)
}

function extractYears(text: string): { min: number | null; max: number | null } {
  const matches = [...text.matchAll(/(\d+)\s*(?:-|–|to)?\s*(\d+)?\s*\+?\s*(?:years?|yrs?)\b/gi)]
  let min: number | null = null
  let max: number | null = null
  for (const match of matches) {
    const first = Number(match[1])
    const second = match[2] ? Number(match[2]) : null
    if (!Number.isFinite(first) || first > 40) continue
    const low = second && second > first ? first : (second ? Math.min(first, second) : first)
    const high = second && second > first ? second : null
    min = min === null ? low : Math.min(min, low)
    max = max === null ? high : Math.max(max ?? 0, high ?? 0) || high
  }
  return { min, max }
}

function normalizeSkills(skills: string[]): string[] {
  return [...new Set(skills.map((skill) => skill.replace(/\u0000/g, '').replace(/[\uD800-\uDFFF]/g, '').trim()).filter(Boolean))]
}

export function extractJobRequirements(job: DiscoveryJob, sourceHash: string | null = null): JobRequirements {
  // PostgreSQL jsonb rejects \u0000; strip it from the source text first.
  const stripNul = (value: string): string => value.replace(/\u0000/g, '').replace(/[\uD800-\uDFFF]/g, '')
  const description = stripNul(job.description ?? '')
  const title = stripNul(job.title ?? '')
  const text = `${title}\n${description}`
  const lines = bulletLines(description)

  const hard: string[] = []
  const preferred: string[] = []
  for (const line of lines) {
    if (PREFERRED_MARKERS.test(line)) preferred.push(line.slice(0, 220))
    else if (HARD_MARKERS.test(line)) hard.push(line.slice(0, 220))
  }

  const requiredSkills = normalizeSkills((job.skills ?? []).filter((skill) => TECH_PATTERN.test(skill)))
  const years = extractYears(text)

  const seniorityFromTitle = SENIORITY.find(([pattern]) => pattern.test(job.title ?? ''))?.[1] ?? null
  const seniority = job.seniority ?? seniorityFromTitle

  const domainText = `${title} ${stripNul(job.company ?? '')}`
  const domains = [...new Set(DOMAINS.filter(([pattern]) => pattern.test(domainText)).map(([, name]) => name))]
  const languages = LANGUAGES.filter((language) => new RegExp(`\\b${language}\\b`, 'i').test(text))
  const certifications = CERTIFICATIONS.filter((cert) => new RegExp(`\\b${cert}\\b`, 'i').test(text))
  const portfolioExpected = /\b(portfolio|github|code samples?|work samples?|past work|case stud)/i.test(text)

  const evidence: Array<{ text: string; decision: string }> = []
  if (requiredSkills.length > 0) evidence.push({ text: `Skills: ${requiredSkills.join(', ')}`, decision: 'Posting lists technical skills' })
  for (const line of hard.slice(0, 4)) evidence.push({ text: line, decision: 'Hard requirement' })
  for (const line of preferred.slice(0, 4)) evidence.push({ text: line, decision: 'Preferred qualification' })
  if (years.min !== null) evidence.push({ text: `${years.min}${years.max ? `-${years.max}` : '+'} years`, decision: 'Experience requirement' })
  if (seniority) evidence.push({ text: `Seniority: ${seniority}`, decision: 'Derived from title / source' })

  const confidence: JobRequirements['confidence'] =
    hard.length > 0 && requiredSkills.length > 0
      ? 'high'
      : hard.length > 0 || preferred.length > 0
        ? 'medium'
        : 'low'

  return {
    version: 1,
    sourceHash,
    requiredSkills,
    preferredSkills: preferred.map((line) => line.replace(/^[\s\-•*]+/, '').slice(0, 220)),
    seniority,
    yearsExperience: years,
    stack: requiredSkills,
    responsibilities: lines.filter((line) => /\b(you will|you'll|responsible for|you own|own the|build|design|drive|lead|develop|maintain|collaborate|ship)\b/i.test(line)).slice(0, 8),
    domains,
    languages,
    certifications,
    portfolioExpected,
    employmentType: job.employmentType ?? null,
    hardRequirements: hard.slice(0, 12),
    preferredQualifications: preferred.slice(0, 12),
    evidence: evidence.slice(0, 16),
    confidence,
  }
}
