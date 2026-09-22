/**
 * Find Jobs — CV-derived search query generation.
 *
 * Turns a voice profile (headline + proof-item tags) into the query, skills,
 * seniority and alternatives used to search every provider and to score hits.
 * Everything here is deterministic so results are reproducible in tests.
 *
 * A saved profile's headline/label is frequently a person's name ("Fizza,
 * LinkedIn") rather than a role. Searching a person's name is the classic cause
 * of a near-empty results page, so every role candidate (manual input, saved
 * profile or CV) is validated before it is allowed to drive provider queries.
 */

import type { CvProfile, GeneratedQuery, JobSearchParams, JobSearchParamsInput } from './types'
import { queryFanOutLimit } from './config'
import { isConcretePlace } from './location'

export interface ProfileLike {
  headline?: string | null
  label?: string | null
  platform?: string | null
  profileUrl?: string | null
}

/** Primary role -> commonly-equivalent role titles used as alternative queries. */
const ROLE_ALTERNATIVES: Record<string, string[]> = {
  'software engineer': ['full stack developer', 'backend developer', 'software developer'],
  'software developer': ['software engineer', 'full stack developer'],
  'backend developer': ['software engineer', 'full stack developer', 'api developer', 'node.js developer'],
  'backend engineer': ['backend developer', 'software engineer', 'software developer'],
  'frontend developer': ['frontend engineer', 'react developer', 'ui engineer', 'web developer', 'javascript developer', 'typescript developer'],
  'frontend engineer': ['frontend developer', 'react developer', 'ui engineer'],
  'react developer': ['frontend developer', 'frontend engineer', 'javascript developer'],
  'full stack developer': ['software engineer', 'backend developer', 'frontend developer', 'full stack engineer'],
  'full stack engineer': ['full stack developer', 'software engineer'],
  'web developer': ['frontend developer', 'javascript developer', 'wordpress developer'],
  'data scientist': ['machine learning engineer', 'data analyst', 'data engineer'],
  'machine learning engineer': ['ai engineer', 'data scientist', 'ml engineer'],
  'data analyst': ['business intelligence analyst', 'data specialist'],
  'ai engineer': ['machine learning engineer', 'ml engineer', 'ai developer'],
  'devops engineer': ['platform engineer', 'site reliability engineer', 'cloud engineer'],
  'site reliability engineer': ['devops engineer', 'platform engineer'],
  'platform engineer': ['devops engineer', 'site reliability engineer'],
  'cloud engineer': ['devops engineer', 'platform engineer', 'aws engineer'],
  'qa engineer': ['quality engineer', 'test automation engineer', 'sdet'],
  'product manager': ['product owner', 'product lead', 'senior product manager'],
  'project manager': ['delivery lead', 'program manager'],
  'ux designer': ['product designer', 'ui designer', 'interaction designer'],
  'product designer': ['ux designer', 'ui designer'],
  'graphic designer': ['visual designer', 'brand designer'],
  'technical writer': ['documentation engineer', 'content engineer'],
  'security engineer': ['application security engineer', 'cloud security engineer'],
  'growth marketer': ['performance marketer', 'demand generation marketer'],
  'content writer': ['blog writer', 'seo copywriter'],
  'customer support specialist': ['customer service representative', 'technical support specialist'],
  'recruiter': ['talent acquisition specialist', 'sourcing specialist'],
  'sales representative': ['account executive', 'business development representative'],
}

/** Skill synonyms used to seed searches when proof tags are thin. */
const ROLE_SKILLS: Record<string, string[]> = {
  'software engineer': ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'SQL', 'Git', 'AWS'],
  backend: ['Python', 'Node.js', 'SQL', 'REST', 'AWS', 'PostgreSQL'],
  frontend: ['React', 'TypeScript', 'JavaScript', 'CSS'],
  'full stack': ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
  devops: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD'],
  data: ['SQL', 'Python', 'Pandas', 'Machine Learning'],
  mobile: ['React Native', 'Swift', 'Kotlin'],
  product: ['Roadmapping', 'User Research', 'Analytics'],
}

/**
 * Generous list of role-ish words. A headline/label that contains none of these
 * is treated as a person's name and never used as a search query.
 */
const ROLE_HINTS =
  /\b(engineer|developer|developerops|devops|programmer|coder|hacker|designer|manager|analyst|architect|scientist|specialist|consultant|lead|leader|head|director|officer|executive|recruiter|marketer|writer|editor|translator|teacher|instructor|nurse|doctor|assistant|coordinator|technician|administrator|representative|agent|strategist|producer|artist|trainer|analyst|accountant|auditor|lawyer|attorney|paralegal|planner|organizer|sourcer|talent|retention|growth|acquisition|ops|operations|front\s?end|back\s?end|full\s?stack|software|web|mobile|ios|android|cloud|security|data|product|project|program|qa|sdet|customer|civil|mechanical|electrical|network|support|devops|sales|marketing|content|social|ui|ux|research|finance|accounting|hr|people|qa|test|automation)\b/i

export function looksLikeJobRole(value: string | null | undefined): boolean {
  if (!value) return false
  const text = value.trim()
  if (!text) return false
  if (/(^|[\s|,])(upwork|linkedin|freelance|freelancer|profile|cv|resume)([\s|,]|$)/i.test(text)) return false
  if (findRoleKey(text)) return true
  return ROLE_HINTS.test(text)
}

function cleanRole(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  // Strip " at Company" / " @ Company" / " — Company" suffixes from headlines.
  const withoutCompany = value
    .replace(/\s*(?:at|@|—|-)\s+[A-Z0-9].*$/i, '')
    .trim()
  // Strip a trailing platform tag ("Fizza, LinkedIn", "Fizza Upwork").
  const withoutPlatform =
    withoutCompany
      .replace(/[\s,·|]*\b(upwork|linkedin|freelancer|freelance|profile|cv)\b.*$/i, '')
      .replace(/[\s,·|]+$/, '')
      .trim()
  return withoutPlatform.slice(0, 80) || undefined
}

export function estimateSeniority(text: string | undefined): string | undefined {
  if (!text) return undefined
  const lower = text.toLowerCase()
  const order = ['intern', 'entry', 'junior', 'mid', 'senior', 'lead', 'principal', 'staff', 'director', 'head']
  for (let i = order.length - 1; i >= 0; i--) {
    if (lower.includes(order[i])) {
      if (order[i] === 'entry') return 'entry-level'
      if (order[i] === 'mid' && /mid-level|\bmiddle\b/.test(lower)) return 'mid-level'
      return order[i]
    }
  }
  return undefined
}

/**
 * Derives a role title from a skill set when the profile provides no role:
 * e.g. React + Next.js + Node.js -> "Full Stack Developer".
 */
export function roleFromSkills(skills: string[]): string | undefined {
  const set = new Set(skills.map((s) => s.toLowerCase().replace(/[^a-z0-9+#. ]/g, '').trim()).filter(Boolean))
  const has = (...tokens: string[]) =>
    tokens.some((t) => [...set].some((s) => new RegExp(`\\b${t.replace(/[.+]/g, '\\$&')}\\b`).test(s)))
  const mobile = has('react native', 'flutter', 'swift', 'kotlin', 'android', 'ios')
  const data = has('pandas', 'tensorflow', 'pytorch', 'machine learning', 'nlp', 'spark', 'scikit')
  const devops = has('terraform', 'ansible', 'kubernetes', 'docker', 'ci/cd', 'cicd')
  const frontend = has('react', 'vue', 'angular', 'typescript', 'javascript', 'next.js', 'nextjs', 'svelte', 'tailwind', 'css', 'html')
  const backend = has('node', 'express', 'django', 'flask', 'php', 'laravel', 'spring', 'go', 'golang', 'rails', 'ruby', 'python', 'postgres', 'postgresql', 'mysql', 'mongodb', 'graphql', 'sql', 'firebase', 'aws', 'java', 'c#', '.net')
  if (mobile) return 'Mobile Developer'
  if (data) return 'Data Scientist'
  if (devops) return 'DevOps Engineer'
  if (frontend && backend) return 'Full Stack Developer'
  if (frontend) return 'Frontend Developer'
  if (backend) return 'Backend Developer'
  return undefined
}

export function buildCvProfile(profile: ProfileLike | null | undefined, proofTags: string[]): CvProfile {
  const headline = firstRoleCandidate(profile)
  const alternativeRoles = headline ? (ROLE_ALTERNATIVES[findRoleKey(headline)] ?? []) : []
  const seniority = estimateSeniority(headline)

  const skillPool = Array.from(new Set([...(proofTags ?? []).map((s) => s.trim()).filter(Boolean)]))
  const seeded: string[] = []
  const roleKey = findRoleKey(headline ?? '')
  if (skillPool.length === 0 && roleKey) {
    for (const [group, skills] of Object.entries(ROLE_SKILLS)) {
      if (roleKey.includes(group) || group.includes(roleKey)) seeded.push(...skills)
    }
  }

  const primaryRole =
    headline ??
    roleFromSkills(skillPool) ??
    roleFromSkills(seeded) ??
    'software engineer'

  return {
    primaryRole,
    alternativeRoles,
    skills: skillPool.length > 0 ? skillPool.slice(0, 20) : seeded.slice(0, 8),
    seniority,
    summary: profile?.headline ?? profile?.label ?? undefined,
    sourceLabel: profile?.platform ?? undefined,
  }
}

/** Picks the first role-looking string from headline, then label. */
function firstRoleCandidate(profile: ProfileLike | undefined | null): string | undefined {
  for (const candidate of [profile?.headline, profile?.label]) {
    if (!candidate) continue
    const raw = candidate.trim()
    const cleaned = cleanRole(raw)
    if (cleaned && looksLikeJobRole(cleaned)) return cleaned
    if (looksLikeJobRole(raw)) return raw.slice(0, 80)
  }
  return undefined
}

function findRoleKey(text: string): string {
  const lower = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  for (const key of Object.keys(ROLE_ALTERNATIVES)) {
    if (lower.includes(key)) return key
  }
  for (const group of Object.keys(ROLE_SKILLS)) {
    if (lower.includes(group)) return group
  }
  return ''
}

/** Public helper for tests + the UI to build the query portion alone. */
export function generateQuery(
  cv: Pick<CvProfile, 'primaryRole' | 'alternativeRoles' | 'skills' | 'seniority'>,
  manualRole?: string | null,
): GeneratedQuery {
  const manual = looksLikeJobRole(manualRole) ? (manualRole ?? '').trim() : ''
  const primary = manual || (looksLikeJobRole(cv.primaryRole) ? cv.primaryRole : 'software engineer')
  const query = primary
  const alternativeQueries = Array.from(
    new Set([
      ...(manual && findRoleKey(manual) ? ROLE_ALTERNATIVES[findRoleKey(manual)] ?? [] : []),
      ...cv.alternativeRoles,
    ]),
  ).slice(0, 6)
  return {
    query,
    alternativeQueries,
    skills: cv.skills.slice(0, 12),
    seniority: cv.seniority,
  }
}

/** Builds the full provider-facing search parameters from user input + CV. */
export function buildSearchParams(input: JobSearchParamsInput, cv: CvProfile): JobSearchParams {
  const generated = generateQuery({ primaryRole: cv.primaryRole, alternativeRoles: cv.alternativeRoles, skills: cv.skills, seniority: cv.seniority }, input.role ?? input.query ?? null)
  const skills = Array.from(new Set([...cv.skills.slice(0, 8), ...(input.skills ?? [])])).slice(0, 16)
  const location = isConcretePlace(input.location?.trim()) ? (input.location as string).trim() : isConcretePlace(cv.location) ? cv.location : undefined
  const country = input.country?.trim() || undefined
  return {
    query: generated.query,
    alternativeQueries: generated.alternativeQueries,
    skills,
    seniority: input.seniority ?? generated.seniority,
    location,
    country,
    remote: input.remote,
    hybrid: input.hybrid,
    onsite: input.onsite,
    minimumSalary: input.minimumSalary,
    salaryCurrency: input.salaryCurrency,
    employmentType: input.employmentType,
    page: input.page,
    limit: input.limit,
  }
}

const QUERY_SKIP_SKILLS = new Set([
  'management',
  'leadership',
  'communication',
  'collaboration',
  'marketing',
  'sales',
  'strategy',
  'remote',
  'teamwork',
  'analysis',
  'research',
])

/** Technologies worth issuing a dedicated `${tech} Developer` query for. */
const TECH_QUERY_SKILLS = new Set([
  'react', 'react.js', 'next.js', 'nextjs', 'typescript', 'javascript', 'vue', 'vue.js', 'angular',
  'node', 'node.js', 'python', 'java', 'go', 'golang', 'ruby', 'rails', 'php', 'laravel',
  'django', 'flask', 'graphql', 'aws', 'docker', 'kubernetes', 'terraform',
  'postgres', 'postgresql', 'mysql', 'mongodb', 'firebase', 'sql',
  'c#', '.net', 'rust', 'swift', 'kotlin', 'flutter', 'react native', 'svelte', 'astro',
])

const NORM_TECH = (value: string): string => value.toLowerCase().replace(/[^a-z0-9+#. ]/g, '').trim()

/**
 * Ordered, deduped set of search queries issued to the credential-free boards
 * (role first, then equivalent roles, then high-demand tech-specific roles,
 * then previous roles). Credentialed providers always receive exactly the
 * primary query to respect their rate limits.
 */
export function deriveQuerySet(cv: CvProfile, manualRole?: string | null): string[] {
  const limit = queryFanOutLimit()
  const out: string[] = []
  const add = (value: string | null | undefined) => {
    const v = (value ?? '').trim()
    if (!v) return
    if (out.some((existing) => existing.toLowerCase() === v.toLowerCase())) return
    out.push(v)
  }

  const primary = looksLikeJobRole(manualRole)
    ? (manualRole as string).trim()
    : looksLikeJobRole(cv.primaryRole)
      ? cv.primaryRole
      : 'software engineer'
  add(primary)

  const family = [primary, cv.primaryRole, ...(cv.alternativeRoles ?? [])].find((role) => findRoleKey(role))
  if (family) {
    for (const candidate of ROLE_ALTERNATIVES[findRoleKey(family)] ?? []) add(candidate)
  }

  const seenTech = new Set<string>()
  for (const skill of (cv.skills ?? []).slice(0, 8)) {
    if (QUERY_SKIP_SKILLS.has(skill.toLowerCase())) continue
    const normalized = NORM_TECH(skill)
    if (!normalized || seenTech.has(normalized)) continue
    seenTech.add(normalized)
    if (TECH_QUERY_SKILLS.has(normalized)) add(`${skill} Developer`)
  }

  for (const previous of (cv.previousRoles ?? []).slice(0, 4)) {
    if (looksLikeJobRole(previous)) add(previous)
  }

  return out.slice(0, limit)
}