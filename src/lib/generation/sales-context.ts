/**
 * Canonical sales generation context.
 *
 * One builder every outbound generation path reads: selected profile + target
 * (job/lead/client) + channel rules + conversation + canonical proof. No path
 * may assemble its own prompt facts from raw profile rows — that is how proof
 * got dropped (the Upwork proposal read one proof item; the LinkedIn draft
 * built profile intelligence and then discarded it).
 *
 * The builder is pure. Routes load canonical rows and pass them in, so the
 * ranking, claim classification and prompt formatting are testable without a
 * database and identical on every surface.
 */
import type { Profile, ProofCard, ProofItem, StyleCard } from '@/lib/domain/types'
import { isProductionSafeProof } from '@/lib/relay/profile-intelligence'

export type GenerationChannel = 'linkedin' | 'upwork' | 'email'

/**
 * Hard claim classification. UNKNOWN must never become a claim in an artifact;
 * the generator is told to reference only the VERIFIED_* / CLIENT_STATED /
 * SAFE_GENERAL evidence this context carries.
 */
export type GenerationClaimSafety =
  | 'VERIFIED_PROFILE_FACT'
  | 'VERIFIED_PROJECT_PROOF'
  | 'VERIFIED_CONVERSATION_FACT'
  | 'CLIENT_STATED_FACT'
  | 'SAFE_GENERAL_STATEMENT'
  | 'UNKNOWN'

export interface GenerationPortfolioProject {
  id: string
  title: string
  role: string | null
  description: string | null
  technologies: string[]
  clientCompany: string | null
  outcome: string | null
  startDate?: string | null
  endDate?: string | null
}

export interface GenerationExperience {
  id: string
  role: string | null
  company: string | null
  startDate: string | null
  endDate: string | null
  isCurrent: boolean
}

export interface GenerationReview {
  id: string
  text: string
  reviewerName: string | null
  reviewerCompany: string | null
  projectContext: string | null
  safeForOutreach: boolean
}

export interface GenerationClaimRow {
  id: string
  key: string
  value: string
  inferred: boolean
  userCorrected: boolean
  userRejected: boolean
}

/** Canonical profile evidence, already loaded. Nothing here is invented. */
export interface ProfileEvidence {
  proofCards: ProofCard[]
  proofItems: ProofItem[]
  portfolioProjects: GenerationPortfolioProject[]
  experience: GenerationExperience[]
  reviews: GenerationReview[]
  claims: GenerationClaimRow[]
}

export interface GenerationTarget {
  channel: GenerationChannel
  title?: string | null
  description?: string | null
  requiredSkills?: string[]
  budget?: string | null
  timeline?: string | null
  screeningQuestions?: string[]
  applicationRequirements?: string[]
  company?: string | null
  contactName?: string | null
  contactTitle?: string | null
  signalEvidence?: string | null
  tags?: string[]
}

export interface GenerationConversation {
  priorMessages: Array<{ direction: 'inbound' | 'outbound'; text: string; sentAt?: string | null }>
  clientMessage: string | null
  alreadySentClaims: string[]
  questionsRequiringResponse: string[]
  commitments: string[]
}

export interface RankedProof {
  id: string
  kind: 'proof_card' | 'proof_item' | 'portfolio_project' | 'review' | 'experience'
  title: string
  claim: string
  /** Only ever a URL that exists in canonical profile data. */
  url: string | null
  technologies: string[]
  strength: 'strong' | 'moderate' | 'weak'
  verified: boolean
  relevanceScore: number
  matchingTags: string[]
}

export interface SalesGenerationContext {
  profile: {
    id: string
    displayName: string
    title: string | null
    summary: string | null
    headline: string | null
    platform: string
    profileUrl: string | null
    skills: string[]
    technologies: string[]
    industries: string[]
    yearsExperience: number | null
    seniority: string | null
    serviceCapabilities: string[]
    positioning: string | null
  }
  evidence: ProfileEvidence
  voice: StyleCard | null
  channel: GenerationChannel
  target: GenerationTarget
  conversation: GenerationConversation
  rankedProof: RankedProof[]
  /** Every string the generator may claim. */
  claimableText: string[]
  /** Numbers that may appear, from verified proof and profile facts. */
  allowedNumbers: Set<string>
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'have', 'what', 'when',
  'where', 'would', 'could', 'should', 'about', 'into', 'need', 'needs', 'help', 'just',
  'than', 'them', 'they', 'their', 'there', 'here', 'also', 'only', 'will', 'very',
  'more', 'most', 'much', 'many', 'you', 'our', 'ours', 'are', 'was', 'were', 'been',
  'being', 'who', 'whom', 'whose', 'why', 'how', 'can', 'any', 'all', 'one', 'work',
  'working', 'project', 'projects', 'client', 'clients', 'team', 'using', 'based',
])

/**
 * A sentence containing one of these is making a claim about delivery, clients
 * or outcomes. Such a sentence is never a "safe general statement" — it is
 * either grounded in the profile/proof or it is UNKNOWN.
 */
const CLAIM_INDICATOR = /\b(?:project|projects|client|clients|platform|platforms|product|integration|integrations|migration|onboarded|implemented|delivered|shipped|built|launched|managed|speciali[sz]ed|experience|years|metrics|results|successfully)\b/i

/** First-person delivery claim: the model asserting it did work. */
const DELIVERY_CLAIM_RE = /\b(?:i|we|i'?ve|we'?ve|i\s+have|we\s+have|i'?m|we'?re)\b[^.!?\n]{0,80}\b(?:built|shipped|delivered|led|managed|migrated|designed|implemented|launched|onboarded|speciali[sz]ed|worked)\b/i

/** Third-person project/outcome claim that still needs evidence. */
const PROJECT_CLAIM_RE = /\b(?:notable\s+project|project\s+involved|projects?\s+involving|successfully\s+onboarded|multiple\s+clients|track\s+record|proven\s+track)\b/i

/**
 * Domain-generic words that cannot ground a claim on their own. A sentence
 * that only shares these with the proof ("a retail platform") is not evidence
 * of that project — it is exactly the vague claim the profile cannot support.
 */
const GENERIC_TOKENS = new Set([
  'platform', 'platforms', 'retail', 'brand', 'commerce', 'project', 'projects',
  'client', 'clients', 'experience', 'years', 'multiple', 'successfully', 'notable',
  'involved', 'similar', 'various', 'several', 'company', 'companies', 'product',
  'products', 'system', 'systems', 'solution', 'solutions', 'service', 'services',
  'business', 'team', 'teams', 'user', 'users', 'customer', 'customers', 'internal',
  'external', 'enterprise', 'consumer', 'mobile', 'website', 'store', 'shop',
  'marketplace', 'dashboard', 'tool', 'tools', 'online', 'digital', 'technical',
  'technology', 'technologies', 'software', 'development', 'engineer', 'engineering',
  'manager', 'management', 'senior', 'junior', 'leading', 'built', 'building',
])

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9#+\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function tokens(text: string): string[] {
  return norm(text).split(' ').filter((w) => w.length >= 3 && !STOP.has(w))
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Normalize a number token so "$500." and "$500" compare equal. */
function numberKey(match: string): string {
  return match.replace(/\s+/g, '').replace(/[.,]+$/, '').toLowerCase()
}

function isUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value.trim())
}

function normalizeProfile(profile: Profile): SalesGenerationContext['profile'] {
  return {
    id: profile.id,
    displayName: profile.displayName ?? profile.fullName ?? profile.label ?? 'Sender',
    title: profile.currentRole ?? profile.headline ?? null,
    summary: profile.professionalSummary ?? profile.bio ?? null,
    headline: profile.headline ?? null,
    platform: profile.platform,
    profileUrl: profile.profileUrl ?? null,
    skills: [...(profile.primarySkills ?? []), ...(profile.secondarySkills ?? [])].filter(Boolean),
    technologies: [...(profile.technologies ?? []), ...(profile.serviceCapabilities ?? [])].filter(Boolean),
    industries: [...(profile.industries ?? [])].filter(Boolean),
    yearsExperience: profile.yearsExperience ?? null,
    seniority: profile.seniority ?? null,
    serviceCapabilities: [...(profile.serviceCapabilities ?? [])].filter(Boolean),
    positioning: profile.positioning ?? null,
  }
}

function emptyConversation(): GenerationConversation {
  return {
    priorMessages: [],
    clientMessage: null,
    alreadySentClaims: [],
    questionsRequiringResponse: [],
    commitments: [],
  }
}

/**
 * Rank canonical proof against the target. Specific relevant project first,
 * then quantified proof, then relevant experience, then general capability.
 * Unrelated proof is dropped, not dumped.
 */
export function rankGenerationProof(
  evidence: ProfileEvidence,
  target: GenerationTarget,
  limit = 3,
): RankedProof[] {
  const targetTerms = new Set(
    [
      ...(target.requiredSkills ?? []),
      ...(target.tags ?? []),
      ...(target.title ?? ''),
      ...(target.description ?? ''),
      ...(target.signalEvidence ?? ''),
    ]
      .flatMap(tokens),
  )
  const score = (text: string, technologies: string[]): { score: number; matchingTags: string[] } => {
    const hay = new Set(tokens(`${text} ${technologies.join(' ')}`))
    const matchingTags = [...targetTerms].filter((t) => hay.has(t))
    return { score: matchingTags.length, matchingTags }
  }

  const ranked: RankedProof[] = []

  for (const card of evidence.proofCards) {
    if (!isProductionSafeProof(card)) continue
    const { score: s, matchingTags } = score(`${card.capability} ${card.safeClaim}`, card.tags)
    ranked.push({
      id: card.id,
      kind: 'proof_card',
      title: card.capability,
      claim: clip(card.safeClaim, 220),
      url: isUrl(card.sourceReference) ? card.sourceReference.trim() : null,
      technologies: card.tags,
      strength: card.strength,
      verified: card.verified,
      relevanceScore: s * 3 + (card.strength === 'strong' ? 3 : card.strength === 'moderate' ? 1 : 0) + (card.verified ? 2 : 0),
      matchingTags,
    })
  }

  for (const item of evidence.proofItems) {
    if (!item.permissionOnFile) continue
    const { score: s, matchingTags } = score(item.projectSummary, item.tags)
    ranked.push({
      id: item.id,
      kind: 'proof_item',
      title: item.projectSummary.split('.')[0] ?? item.projectSummary,
      claim: clip(item.projectSummary, 220),
      url: null,
      technologies: item.tags,
      strength: item.reviewQuote ? 'strong' : 'moderate',
      verified: Boolean(item.permissionOnFile),
      relevanceScore: s * 3 + (item.reviewQuote ? 3 : 0) + 2,
      matchingTags,
    })
  }

  for (const project of evidence.portfolioProjects) {
    const { score: s, matchingTags } = score(
      `${project.title} ${project.description ?? ''} ${project.outcome ?? ''}`,
      project.technologies,
    )
    ranked.push({
      id: project.id,
      kind: 'portfolio_project',
      title: project.title,
      claim: clip([project.role, project.description, project.outcome].filter(Boolean).join(' — '), 220),
      url: null,
      technologies: project.technologies,
      strength: project.outcome ? 'strong' : 'moderate',
      verified: false,
      relevanceScore: s * 3 + (project.outcome ? 2 : 0),
      matchingTags,
    })
  }

  for (const review of evidence.reviews) {
    if (!review.safeForOutreach) continue
    const { score: s, matchingTags } = score(`${review.text} ${review.projectContext ?? ''}`, [])
    ranked.push({
      id: review.id,
      kind: 'review',
      title: 'Client review',
      claim: clip(review.text, 220),
      url: null,
      technologies: [],
      strength: 'strong',
      verified: review.safeForOutreach,
      relevanceScore: s * 2 + 2,
      matchingTags,
    })
  }

  for (const role of evidence.experience) {
    const { score: s, matchingTags } = score(`${role.role ?? ''} ${role.company ?? ''}`, [])
    ranked.push({
      id: role.id,
      kind: 'experience',
      title: [role.role, role.company].filter(Boolean).join(' · '),
      claim: clip(`${role.role ?? 'Role'}${role.company ? ` at ${role.company}` : ''}`, 220),
      url: null,
      technologies: [],
      strength: 'moderate',
      verified: false,
      relevanceScore: s * 2 + (role.isCurrent ? 1 : 0),
      matchingTags,
    })
  }

  return ranked
    .filter((p) => p.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit)
}

/**
 * Classify a generated claim against the canonical context. Deterministic and
 * conservative: anything not traceable to profile, project, conversation or
 * the client's own words is UNKNOWN.
 */
export function classifyGenerationClaim(claim: string, context: SalesGenerationContext): GenerationClaimSafety {
  const lower = norm(claim)
  if (lower.length === 0) return 'UNKNOWN'

  for (const forbidden of context.evidence.proofCards.flatMap((c) => c.forbiddenClaims ?? [])) {
    if (forbidden && lower.includes(norm(forbidden))) return 'UNKNOWN'
  }

  // A number the profile/proof cannot support is an invention, whatever else
  // the sentence says.
  for (const match of claim.match(/\d[\d,.]*\s*(?:%|k|x|\+)?/gi) ?? []) {
    const key = numberKey(match)
    if (!context.allowedNumbers.has(key) && !/^\d{1,2}$/.test(key)) return 'UNKNOWN'
  }

  const claimTokens = new Set(tokens(claim))
  if (claimTokens.size === 0) return 'SAFE_GENERAL_STATEMENT'

  const overlap = (text: string): { ratio: number; specificHits: number } => {
    const source = new Set(tokens(text))
    if (source.size === 0) return { ratio: 0, specificHits: 0 }
    let hits = 0
    let specificHits = 0
    for (const t of claimTokens) {
      if (!source.has(t)) continue
      hits++
      if (t.length >= 5 && !GENERIC_TOKENS.has(t)) specificHits++
    }
    return { ratio: hits / claimTokens.size, specificHits }
  }

  // Years of experience is a profile fact, not a project claim. Match it
  // directly so "I have 8 years of experience" is verified only when the
  // profile actually says 8.
  if (/\byears?\s+(?:of\s+)?experience\b/i.test(claim) && context.profile.yearsExperience != null) {
    const stated = claim.match(/(\d+)\s*years?/i)?.[1]
    if (stated && Number(stated) === context.profile.yearsExperience) return 'VERIFIED_PROFILE_FACT'
  }

  for (const proof of context.rankedProof) {
    const { ratio, specificHits } = overlap(`${proof.title} ${proof.claim}`)
    if (specificHits >= 1 && ratio >= 0.5) return 'VERIFIED_PROJECT_PROOF'
  }
  for (const card of context.evidence.proofCards) {
    if (!isProductionSafeProof(card)) continue
    const { ratio, specificHits } = overlap(`${card.capability} ${card.safeClaim}`)
    if (specificHits >= 1 && ratio >= 0.6) return 'VERIFIED_PROJECT_PROOF'
  }
  for (const project of context.evidence.portfolioProjects) {
    const { ratio, specificHits } = overlap(`${project.title} ${project.description ?? ''} ${project.outcome ?? ''}`)
    if (specificHits >= 1 && ratio >= 0.6) return 'VERIFIED_PROJECT_PROOF'
  }

  const profileText = [
    context.profile.displayName,
    context.profile.title,
    context.profile.summary,
    context.profile.headline,
    context.profile.positioning,
    context.profile.seniority,
    context.profile.yearsExperience != null ? `${context.profile.yearsExperience} years of experience` : null,
    ...context.profile.skills,
    ...context.profile.technologies,
    ...context.profile.industries,
    ...context.profile.serviceCapabilities,
    ...context.evidence.experience.map((e) => `${e.role ?? ''} ${e.company ?? ''}`),
    ...context.evidence.claims.filter((c) => !c.userRejected).map((c) => `${c.key} ${c.value}`),
  ].filter(Boolean).join(' ')
  const profileOverlap = overlap(profileText)
  if (profileOverlap.specificHits >= 1 && profileOverlap.ratio >= 0.6) return 'VERIFIED_PROFILE_FACT'

  const clientText = `${context.conversation.clientMessage ?? ''} ${context.target.description ?? ''} ${context.target.title ?? ''}`
  if (clientText && overlap(clientText).ratio >= 0.6) return 'CLIENT_STATED_FACT'

  const conversationText = context.conversation.priorMessages.map((m) => m.text).join(' ')
  if (conversationText && overlap(conversationText).ratio >= 0.6) return 'VERIFIED_CONVERSATION_FACT'

  // A general statement with no claim indicator or entity is safe to say.
  // Numbers were already validated above, so an allowed number does not make
  // the sentence a claim. Only a mid-sentence capitalized word counts as an
  // entity — the first word is just the sentence subject ("Your ...").
  const hasEntity = claim
    .split(/\s+/)
    .slice(1)
    .some((word) => /^[A-Z][a-z]{3,}$/.test(word.replace(/[^A-Za-z]/g, '')))
  if (!CLAIM_INDICATOR.test(claim) && !hasEntity) return 'SAFE_GENERAL_STATEMENT'

  return 'UNKNOWN'
}

/**
 * Claims in the artifact that the canonical context cannot support. These are
 * the sentences a rep must edit before sending.
 *
 * Only delivery claims ("I have successfully onboarded multiple clients") and
 * project claims ("one notable project involved a retail platform") are
 * checked. Plan sentences, questions and references to the client's own job
 * are not claims and are never flagged. A sentence that names a canonical
 * entity (a portfolio project, a skill, a technology) is supported.
 */
export function findUnsupportedClaims(text: string, context: SalesGenerationContext): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const entities = canonicalEntityTokens(context)
  const unsupported: string[] = []
  for (const sentence of sentences) {
    if (sentence.endsWith('?')) continue
    const isDeliveryClaim = DELIVERY_CLAIM_RE.test(sentence)
    const isProjectClaim = PROJECT_CLAIM_RE.test(sentence)
    // A number the profile/proof/job cannot support is an invented price,
    // timeline or metric — always checked, not just delivery claims.
    const hasUnverifiedNumber = /\d/.test(sentence)
    if (!isDeliveryClaim && !isProjectClaim && !hasUnverifiedNumber) continue
    const sentenceTokens = new Set(tokens(sentence))
    const namesCanonicalEntity = [...sentenceTokens].some((t) => entities.has(t))
    if (namesCanonicalEntity) continue
    if (classifyGenerationClaim(sentence, context) === 'UNKNOWN') unsupported.push(sentence)
  }
  return [...new Set(unsupported)]
}

/** Tokens that identify a canonical profile entity, used to spot a supported claim. */
function canonicalEntityTokens(context: SalesGenerationContext): Set<string> {
  const entities = new Set<string>()
  const add = (text: string) => {
    for (const token of tokens(text)) {
      if (token.length >= 4 && !GENERIC_TOKENS.has(token)) entities.add(token)
    }
  }
  for (const proof of context.rankedProof) add(`${proof.title} ${proof.claim}`)
  for (const project of context.evidence.portfolioProjects) add(`${project.title} ${project.description ?? ''} ${project.outcome ?? ''}`)
  for (const role of context.evidence.experience) add(`${role.role ?? ''} ${role.company ?? ''}`)
  for (const skill of context.profile.skills) add(skill)
  for (const technology of context.profile.technologies) add(technology)
  for (const claim of context.evidence.claims) if (!claim.userRejected) add(`${claim.key} ${claim.value}`)
  return entities
}

/** Prompt block: the ranked proof the generator may reference. */
export function formatEvidenceBlock(context: SalesGenerationContext, limit = 3): string {
  const proof = context.rankedProof.slice(0, limit)
  if (proof.length === 0) return ''
  const lines = proof.map((p) => {
    const url = p.url ? ` — ${p.url}` : ''
    const tags = p.technologies.length > 0 ? `\n  Technologies: ${p.technologies.join(', ')}` : ''
    return `• ${p.title} — ${p.claim}${url}${tags}`
  })
  return [
    '## RELEVANT PROOF (reference only what is listed; never invent a project, client, metric or link)',
    ...lines,
  ].join('\n')
}

/** Prompt block: the selected profile, normalized. */
export function formatProfileBlock(context: SalesGenerationContext): string {
  const p = context.profile
  const lines = [
    '## SENDER PROFILE (the identity this artifact is sent from; do not contradict it)',
    `- Name: ${p.displayName}`,
    p.title ? `- Title: ${p.title}` : null,
    p.headline ? `- Headline: ${p.headline}` : null,
    p.summary ? `- Summary: ${clip(p.summary, 400)}` : null,
    p.skills.length > 0 ? `- Skills: ${p.skills.join(', ')}` : null,
    p.technologies.length > 0 ? `- Technologies: ${p.technologies.join(', ')}` : null,
    p.industries.length > 0 ? `- Industries: ${p.industries.join(', ')}` : null,
    p.yearsExperience != null ? `- Years experience: ${p.yearsExperience}` : null,
    p.serviceCapabilities.length > 0 ? `- Services: ${p.serviceCapabilities.join(', ')}` : null,
  ].filter((line): line is string => Boolean(line))
  return lines.join('\n')
}

/** Prompt block: the target, with unknown values omitted rather than invented. */
export function formatTargetBlock(context: SalesGenerationContext): string {
  const t = context.target
  const lines = [
    `## TARGET (${t.channel})`,
    t.company ? `- Company: ${t.company}` : null,
    t.contactName ? `- Contact: ${t.contactName}${t.contactTitle ? `, ${t.contactTitle}` : ''}` : null,
    t.title ? `- Title: ${t.title}` : null,
    t.requiredSkills && t.requiredSkills.length > 0 ? `- Required skills: ${t.requiredSkills.join(', ')}` : null,
    t.budget ? `- Budget: ${t.budget}` : null,
    t.timeline ? `- Timeline: ${t.timeline}` : null,
    t.description ? `- Description: ${clip(t.description, 900)}` : null,
    t.signalEvidence ? `- Signal: ${clip(t.signalEvidence, 400)}` : null,
    t.screeningQuestions && t.screeningQuestions.length > 0
      ? `- Screening questions: ${t.screeningQuestions.map((q, i) => `${i + 1}. ${q}`).join(' | ')}`
      : null,
  ].filter((line): line is string => Boolean(line))
  return lines.join('\n')
}

/** Prompt block: conversation state, so a reply never restarts the pitch. */
export function formatConversationBlock(context: SalesGenerationContext): string {
  const c = context.conversation
  const lines: string[] = []
  if (c.clientMessage) lines.push(`Client said: ${clip(c.clientMessage, 600)}`)
  if (c.priorMessages.length > 0) {
    lines.push('Prior messages (oldest first):')
    for (const m of c.priorMessages.slice(-8)) {
      lines.push(`- ${m.direction === 'inbound' ? 'Client' : 'Me'}: ${clip(m.text, 300)}`)
    }
  }
  if (c.alreadySentClaims.length > 0) {
    lines.push(`Already claimed (do not repeat): ${c.alreadySentClaims.slice(0, 3).join(' | ')}`)
  }
  if (c.questionsRequiringResponse.length > 0) {
    lines.push(`Questions to answer first: ${c.questionsRequiringResponse.join(' | ')}`)
  }
  if (c.commitments.length > 0) {
    lines.push(`Commitments already made: ${c.commitments.join(' | ')}`)
  }
  if (lines.length === 0) return ''
  return ['## CONVERSATION', ...lines].join('\n')
}

/** Every string the generator may claim — fed to the deterministic gates. */
export function toClaimableText(context: SalesGenerationContext): string[] {
  const p = context.profile
  return [
    p.displayName,
    p.title,
    p.summary,
    p.headline,
    p.positioning,
    ...p.skills,
    ...p.technologies,
    ...p.industries,
    ...p.serviceCapabilities,
    ...context.evidence.proofCards.map((c) => `${c.capability} ${c.safeClaim}`),
    ...context.evidence.proofItems.map((i) => i.projectSummary),
    ...context.evidence.portfolioProjects.map((x) => `${x.title} ${x.description ?? ''} ${x.outcome ?? ''}`),
    ...context.evidence.experience.map((e) => `${e.role ?? ''} ${e.company ?? ''}`),
    ...context.evidence.reviews.map((r) => r.text),
    ...context.evidence.claims.filter((c) => !c.userRejected).map((c) => `${c.key} ${c.value}`),
  ].filter((value): value is string => Boolean(value))
}

/** Numbers the generator may use, from verified proof and profile facts. */
export function toAllowedNumbers(context: SalesGenerationContext): Set<string> {
  const numbers = new Set<string>()
  const add = (text: string) => {
    for (const match of text.match(/\d[\d,.]*\s*(?:%|k|x|\+)?/gi) ?? []) {
      numbers.add(numberKey(match))
    }
  }
  for (const card of context.evidence.proofCards) if (isProductionSafeProof(card)) add(`${card.capability} ${card.safeClaim}`)
  for (const item of context.evidence.proofItems) add(item.projectSummary)
  for (const project of context.evidence.portfolioProjects) add(`${project.title} ${project.description ?? ''} ${project.outcome ?? ''}`)
  if (context.profile.yearsExperience != null) add(String(context.profile.yearsExperience))
  for (const claim of context.evidence.claims) if (!claim.userRejected) add(`${claim.key} ${claim.value}`)
  // Numbers the client stated in the job/lead are canonical too — otherwise a
  // proposal that echoes the job's own budget would be flagged as invented.
  add(`${context.target.title ?? ''} ${context.target.description ?? ''} ${context.target.budget ?? ''} ${context.target.timeline ?? ''}`)
  return numbers
}

export function buildSalesGenerationContext(input: {
  profile: Profile
  evidence: ProfileEvidence
  voice?: StyleCard | null
  channel: GenerationChannel
  target: GenerationTarget
  conversation?: Partial<GenerationConversation>
}): SalesGenerationContext {
  const conversation = { ...emptyConversation(), ...input.conversation }
  const context: SalesGenerationContext = {
    profile: normalizeProfile(input.profile),
    evidence: input.evidence,
    voice: input.voice ?? null,
    channel: input.channel,
    target: input.target,
    conversation,
    rankedProof: [],
    claimableText: [],
    allowedNumbers: new Set<string>(),
  }
  context.rankedProof = rankGenerationProof(input.evidence, input.target)
  context.claimableText = toClaimableText(context)
  context.allowedNumbers = toAllowedNumbers(context)
  return context
}
