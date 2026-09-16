import type { ContentProfile, ContentPlatform } from '@/lib/domain/types'

type IdentityShape = {
  role?: string
  seniority?: string
  industries?: string[]
  expertise?: ContentProfile['expertise']
  opinions?: ContentProfile['opinions']
  projects?: ContentProfile['projects']
  experiences?: ContentProfile['experiences']
  technologies?: string[]
  audiences?: string[]
  territories?: string[]
  contentGoals?: string[]
} | null

export interface OnboardingCompleteInput {
  displayName?: string
  platforms?: string[]
  personaRole?: string
  personaCompany?: string
  personaLocation?: string
  contentComfort?: string[]
  selectedGoals?: string[]
  selectedAudiences?: string[]
  selectedTerritories?: string[]
  voiceSelection?: string
  humorStyle?: string
  identity?: IdentityShape
}

export interface NormalizedOnboardingPayload {
  displayName: string
  platforms: ContentPlatform[]
  personaRole: string
  personaCompany: string
  personaLocation: string
  contentComfort: string[]
  selectedGoals: string[]
  selectedAudiences: string[]
  selectedTerritories: string[]
  voiceSelection: string
  humorStyle: string
  identity: {
    role: string
    seniority: string
    industries: string[]
    expertise: ContentProfile['expertise']
    opinions: ContentProfile['opinions']
    projects: ContentProfile['projects']
    experiences: ContentProfile['experiences']
    technologies: string[]
    audiences: string[]
    territories: string[]
    contentGoals: string[]
  }
}

export function normalizeOnboardingPayload(input: OnboardingCompleteInput): NormalizedOnboardingPayload {
  const displayName = normalizeText(input.displayName)
  const personaRole = normalizeText(input.personaRole)
  const identity = normalizeIdentity(input.identity ?? {}, personaRole)

  const selectedTerritories = uniqueTextList(
    input.selectedTerritories,
    identity.territories,
  )

  const selectedAudiences = uniqueTextList(
    input.selectedAudiences,
    identity.audiences,
    ['Peers in my field'],
  )

  const selectedGoals = uniqueTextList(
    input.selectedGoals,
    identity.contentGoals,
    ['share_what_i_learn'],
  )

  const roleForVoice = personaRole || identity.role

  return {
    displayName,
    platforms: normalizePlatforms(input.platforms),
    personaRole: roleForVoice,
    personaCompany: normalizeText(input.personaCompany),
    personaLocation: normalizeText(input.personaLocation),
    contentComfort: uniqueTextList(input.contentComfort),
    selectedGoals,
    selectedAudiences,
    selectedTerritories,
    voiceSelection: normalizeText(input.voiceSelection),
    humorStyle: normalizeText(input.humorStyle) || (roleForVoice.toLowerCase().includes('founder') ? 'conversational' : 'professional'),
    identity: {
      ...identity,
      audiences: selectedAudiences.length > 0 ? selectedAudiences : identity.audiences,
      territories: selectedTerritories.length > 0 ? selectedTerritories : identity.territories,
      contentGoals: selectedGoals.length > 0 ? selectedGoals : identity.contentGoals,
    },
  }
}

function normalizeIdentity(identity: IdentityShape, personaRole: string) {
  const role = normalizeText(identity?.role) || personaRole || 'Professional'
  const seniority = normalizeText(identity?.seniority) || inferSeniority(role)

  return {
    role,
    seniority,
    industries: uniqueTextList(identity?.industries),
    expertise: Array.isArray(identity?.expertise) ? identity.expertise : [],
    opinions: Array.isArray(identity?.opinions) ? identity.opinions : [],
    projects: Array.isArray(identity?.projects) ? identity.projects : [],
    experiences: Array.isArray(identity?.experiences) ? identity.experiences : [],
    technologies: uniqueTextList(identity?.technologies),
    audiences: uniqueTextList(identity?.audiences),
    territories: uniqueTextList(identity?.territories),
    contentGoals: uniqueTextList(identity?.contentGoals),
  }
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function uniqueTextList(...values: Array<string[] | undefined>): string[] {
  const deduped = new Set<string>()
  for (const list of values) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const normalized = normalizeText(item)
      if (normalized) deduped.add(normalized)
    }
  }
  return [...deduped]
}

function normalizePlatforms(platforms: string[] | undefined): ContentPlatform[] {
  const normalized = uniqueTextList(platforms)
    .map((platform) => platform.toLowerCase())
    .filter((platform): platform is ContentPlatform => platform === 'linkedin' || platform === 'x' || platform === 'instagram')

  return normalized.length > 0 ? normalized : ['linkedin']
}

function inferSeniority(role: string): string {
  const lower = role.toLowerCase()
  if (lower.includes('staff') || lower.includes('principal') || lower.includes('vp') || lower.includes('cto') || lower.includes('ceo')) {
    return 'senior'
  }
  if (lower.includes('senior')) {
    return 'senior'
  }
  if (lower.includes('lead') || lower.includes('manager') || lower.includes('founder')) {
    return 'mid'
  }
  return 'mid'
}
