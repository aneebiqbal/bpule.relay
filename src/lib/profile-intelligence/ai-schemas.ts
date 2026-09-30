import type { ShapeSchema } from '@/lib/ai/runtime/schemas'

export const PROFILE_DOCUMENT_CLASSIFY_SCHEMA: ShapeSchema = {
  documentType: { type: 'string', required: true, description: 'cv|resume|team_pdf|case_study|portfolio|review_document|project_summary|mixed|unknown' },
  detectedPeople: { type: 'array', required: true },
  sectionBoundaries: { type: 'array', required: false },
  sourceQuality: { type: 'string', required: true, description: 'high|medium|low' },
  language: { type: 'string', required: false, description: 'ISO 639-1 language code, e.g. en' },
}

export const PROFILE_PERSON_SEGMENT_SCHEMA: ShapeSchema = {
  people: { type: 'array', required: true },
}

export const PROFILE_FACT_EXTRACT_SCHEMA: ShapeSchema = {
  fullName: { type: 'string', required: false },
  displayName: { type: 'string', required: false },
  currentRole: { type: 'string', required: false },
  company: { type: 'string', required: false },
  location: { type: 'string', required: false },
  headline: { type: 'string', required: false },
  bio: { type: 'string', required: false },
  professionalSummary: { type: 'string', required: false },
  seniority: { type: 'string', required: false, description: 'junior|mid|senior|lead|principal|executive' },
  yearsExperience: { type: 'number', required: false },
  primarySkills: { type: 'array', required: false },
  secondarySkills: { type: 'array', required: false },
  technologies: { type: 'array', required: false },
  industries: { type: 'array', required: false },
  serviceCapabilities: { type: 'array', required: false },
  specialties: { type: 'array', required: false },
  positioning: { type: 'string', required: false },
  differentiators: { type: 'array', required: false },
  languages: { type: 'array', required: false },
  communicationStyle: { type: 'object', required: false },
  projects: { type: 'array', required: false },
  proofs: { type: 'array', required: false },
  reviews: { type: 'array', required: false },
}

export const PROFILE_PROJECT_EXTRACT_SCHEMA: ShapeSchema = {
  projects: { type: 'array', required: true },
}

export const PROFILE_PROOF_BUILD_SCHEMA: ShapeSchema = {
  proofs: { type: 'array', required: true },
}

export const PROFILE_REVIEW_EXTRACT_SCHEMA: ShapeSchema = {
  reviews: { type: 'array', required: true },
}

export const PROFILE_QUALITY_GATE_SCHEMA: ShapeSchema = {
  passed: { type: 'boolean', required: true },
  issues: { type: 'array', required: true },
  personMixingDetected: { type: 'boolean', required: true },
  fabricatedClaims: { type: 'array', required: true },
  missingProvenance: { type: 'array', required: true },
}

export const PROFILE_SYNTHESIZE_SCHEMA: ShapeSchema = {
  identitySummary: { type: 'string', required: true },
  capabilities: { type: 'array', required: true },
  strongestProof: { type: 'array', required: true },
  industries: { type: 'array', required: true },
  technologies: { type: 'array', required: true },
  differentiators: { type: 'array', required: true },
  voice: { type: 'string', required: false },
  safeClaims: { type: 'array', required: true },
  prohibitedClaims: { type: 'array', required: true },
}
