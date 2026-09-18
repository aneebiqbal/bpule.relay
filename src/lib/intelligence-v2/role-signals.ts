import type { OpportunitySignal } from './types'

const RECRUITER_TITLE =
  /\b(recruiter|talent acquisition|talent partner|talent scout|sourcer|people ops|human resources|\bhrbp\b|staffing specialist)\b/i

const CLINICIAN_TITLE =
  /\b(pmhnp|np-bc|fnp|psychiatrist|psychologist|physician|md\b|do\b|nurse practitioner|registered nurse|\brn\b|therapist|counselor|lcsw|lmft|clinician)\b/i

const CARE_PRACTICE =
  /\b(psychiatry|psychiatric|mental health|telehealth practice|medical practice|clinic|family medicine|primary care)\b/i

const BUYER_LEADERSHIP =
  /\b(ceo|cto|cfo|coo|founder|co[- ]?founder|director|head of|vp|president|owner|chief)\b/i

const LINKEDIN_CHROME =
  /^(posts?|comments?|likes?|reposts?|send|more|show all|activity|highlights|contact info|message|follow|link|images|like|comment|repost)$/i

const BUYER_ONLY_SIGNALS: OpportunitySignal[] = [
  'freelance_project_need',
  'explicit_ask',
  'technical_problem',
  'migration',
  'rebuild',
  'funding',
]

const AMBIGUOUS_TECH = new Set(['react', 'node', 'go', 'java', 'css', 'rls', 'cdn', 'seo'])

export function isRecruiterTitle(title: string | null | undefined): boolean {
  return RECRUITER_TITLE.test((title ?? '').trim())
}

export function isClinicianProfile(title: string | null | undefined, company?: string | null, industry?: string | null): boolean {
  const blob = `${title ?? ''} ${company ?? ''} ${industry ?? ''}`
  return CLINICIAN_TITLE.test(blob) || CARE_PRACTICE.test(blob)
}

export function isBuyerLeadership(title: string | null | undefined, seniority?: string | null): boolean {
  return BUYER_LEADERSHIP.test(`${title ?? ''} ${seniority ?? ''}`)
}

export function isNonBuyerProfessional(input: {
  title?: string | null
  company?: string | null
  industry?: string | null
}): boolean {
  return isRecruiterTitle(input.title) || isClinicianProfile(input.title, input.company, input.industry)
}

export function isLinkedInChromeText(value: string | null | undefined): boolean {
  const text = (value ?? '').trim()
  if (!text) return true
  if (text.length <= 16 && LINKEDIN_CHROME.test(text)) return true
  if (/^view .+ profile/i.test(text)) return true
  return false
}

export function recruiterAllowedSignals(signals: OpportunitySignal[]): OpportunitySignal[] {
  const kept = signals.filter((signal) => !BUYER_ONLY_SIGNALS.includes(signal))
  if (kept.includes('hiring') || kept.includes('hiring_pressure') || kept.includes('growth_signal')) {
    return kept
  }
  return kept.length > 0 ? kept : ['hiring']
}

export function clinicianAllowedSignals(signals: OpportunitySignal[]): OpportunitySignal[] {
  return signals.filter((signal) => signal === 'growth_signal' || signal === 'launch')
}

export function techKeywordMatches(text: string, keyword: string): boolean {
  const lower = text.toLowerCase()
  const key = keyword.toLowerCase()
  if (AMBIGUOUS_TECH.has(key)) {
    if (key === 'react' && /\breact(?:ions?|ed)\b/i.test(text)) return false
    return new RegExp(`(?<![a-z])${escapeRegExp(key)}(?![a-z])`, 'i').test(text)
  }
  return lower.includes(key)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
