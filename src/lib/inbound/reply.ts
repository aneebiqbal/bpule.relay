import type { Lead, Message, Profile, ProofItem, InboundIntelligence } from '@/lib/domain/types'

export interface InboundReplyInput {
  lead: Lead
  intelligence?: InboundIntelligence | null
  profile: Profile | null
  proofItems: ProofItem[]
  history?: Message[]
  styleCard: string | null
  strategy?: string | null
}

export interface InboundReplyResult {
  text: string
  selfCheckPassed: boolean
  selfCheckNote: string | null
}

const STOP_WORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'your', 'have', 'what', 'when', 'where', 'would',
  'could', 'should', 'about', 'into', 'need', 'needs', 'help', 'just', 'than', 'them', 'they',
  'their', 'there', 'here', 'also', 'only', 'will', 'very', 'more', 'most', 'much', 'many',
  'you', 'our', 'ours', 'ourselves', 'mine', 'my', 'i', 'we', 'it', 'its', 'for', 'are', 'was',
  'were', 'been', 'being', 'who', 'whom', 'whose', 'why', 'how', 'can', 'any', 'all', 'one',
])

const COLD_PHRASES = [
  /i came across your profile/i,
  /i noticed you'?re looking for/i,
  /i saw that you/i,
  /your profile caught my attention/i,
  /i found you on linkedin/i,
  /i was browsing/i,
  /saw your company/i,
]

const FLUFF_PATTERNS = [
  /\bwould love to connect\b/i,
  /\blet me know if (this|that) sounds good\b/i,
  /\blet me know your thoughts\b/i,
  /\bhappy to help\b/i,
  /\bgreat question\b/i,
  /\bi can definitely help\b/i,
  /\bwe can help with that\b/i,
]

const BIO_ASK_PATTERN = /\b(experience|background|portfolio|resume|cv|case studies|examples|worked with|who are you|about you)\b/i
const DIRECT_CLAIM_PATTERN = /\b(i|we)\s+(have\s+)?(built|shipped|delivered|worked|led|managed|speciali[sz]ed|have\s+experience|am\s+experienced|spent\s+\d+\s+years)\b/i

const CHANNEL_GUIDANCE: Record<string, string> = {
  linkedin: 'LinkedIn channel: keep it to 3-5 short sentences, conversational and direct. No formal email framing.',
  upwork: 'Upwork channel: answer scope clearly, mention one relevant project shape, and keep it practical.',
  email: 'Email channel: use a clear answer-first structure with one short paragraph break if needed.',
  referral: 'Referral channel: acknowledge the intro context briefly, then answer the ask directly.',
  other: 'Use a concise professional tone and answer-first structure.',
}

export const INBOUND_REPLY_SYSTEM = `You are Relay's inbound response writer. A client has contacted YOUR team first. This is NOT a cold outreach — the client initiated contact.

HARD RULES:
- NEVER open with "I came across your profile" or "I noticed you're looking for..." — they contacted YOU.
- NEVER pitch cold. The client already wants something — find out what and respond directly.
- If the client asked a direct question, ANSWER IT before anything else.
- Do not repeat bio credentials already shared in prior messages unless they asked for them again.
- Acknowledge their request first, then provide credibility, then suggest an easy next step.
- Use ONLY the proof items provided. Never invent credentials or projects.
- Keep it concise. Inbound clients expect a direct response, not a marketing email.
- Match the tone of their message: formal if they're formal, casual if they're casual.
- If important information is missing, recommend a useful clarification question instead of forcing a sales pitch.
- The goal is to move toward a conversation, not close a deal in the first reply.
- NEVER use em dashes — use hyphens only.
- NEVER use exclamation marks.

Structure: Acknowledge → Answer/Question → Relevant credibility → Easy next step`

export function classifyInboundReplyIntent(
  message: string,
  hintedIntent?: string | null,
): string {
  const m = message.toLowerCase()
  if (/\b(not interested|no thanks|pass|stop|not a fit)\b/i.test(m)) return 'not_interested'
  if (/\b(price|pricing|budget|rate|cost|how much)\b/i.test(m)) return 'pricing'
  if (/\b(schedule|call|meeting|zoom|book|calendar|availability)\b/i.test(m)) return 'meeting_request'
  if (/\b(deadline|timeline|by\s+\w+day|how soon|eta|urgency)\b/i.test(m)) return 'timeline'
  if (/\b(resume|cv|portfolio)\b/i.test(m)) return 'proof_request'
  if (extractQuestions(message).length > 0) return 'question'

  const hint = (hintedIntent ?? '').trim().toLowerCase()
  if (hint.length === 0) return 'unclear'
  if (hint.includes('question')) return 'question'
  if (hint.includes('price') || hint.includes('budget')) return 'pricing'
  if (hint.includes('meeting') || hint.includes('call')) return 'meeting_request'
  if (hint.includes('not interested')) return 'not_interested'
  return hint
}

export function buildDeterministicConversationSummary(input: InboundReplyInput): string {
  const inbound = input.lead.inboundMessage?.trim() ?? ''
  const intent = classifyInboundReplyIntent(inbound, input.intelligence?.intent ?? null)
  const questions = extractQuestions(inbound).slice(0, 3)
  const prior = (input.history ?? [])
    .map((m) => ({ text: m.sentText ?? m.draftText ?? '', at: m.sentAt ?? m.createdAt }))
    .filter((m) => m.text.trim().length > 0)
    .sort((a, b) => a.at.localeCompare(b.at))
  const alreadyShared = dedupe(
    prior.flatMap((m) => extractBioFacts(m.text)).map((f) => clipSentence(f, 140)),
  ).slice(0, 3)

  const lines = [
    `- Channel: ${input.lead.source ?? 'other'}`,
    `- Intent pre-classification: ${intent}`,
    `- Prospect asked ${questions.length} direct question${questions.length === 1 ? '' : 's'}`,
  ]

  if (questions.length > 0) {
    lines.push(`- Questions to answer first: ${questions.join(' | ')}`)
  }
  if (alreadyShared.length > 0) {
    lines.push(`- Already shared bio/proof facts (avoid repeating unless asked): ${alreadyShared.join(' | ')}`)
  }

  return lines.join('\n')
}

export function buildInboundReplyUserPrompt(input: InboundReplyInput): string {
  const parts: string[] = []
  const inboundMessage = input.lead.inboundMessage ?? '(no message)'
  const deterministicIntent = classifyInboundReplyIntent(
    inboundMessage,
    input.intelligence?.intent ?? null,
  )
  const channel = input.lead.source ?? 'other'

  parts.push(`## Client's inbound message`)
  parts.push(inboundMessage)

  parts.push(`\n## Deterministic conversation summary (pre-generation)`)
  parts.push(buildDeterministicConversationSummary(input))

  parts.push(`\n## Channel behavior`)
  parts.push(CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.other)

  parts.push(`\n## Intent pre-check`)
  parts.push(deterministicIntent)

  if (input.intelligence) {
    parts.push(`\n## What they want`)
    parts.push(input.intelligence.wants)
    parts.push(`\n## Intent`)
    parts.push(input.intelligence.intent)
    if (input.intelligence.missingInfo.length > 0) {
      parts.push(`\n## Missing information`)
      parts.push(input.intelligence.missingInfo.join('\n'))
    }
  }

  if (input.profile) {
    parts.push(`\n## Your Revenue Identity`)
    parts.push(`Profile: ${input.profile.label ?? input.profile.platform}`)
    if (input.profile.headline) parts.push(`Headline: ${input.profile.headline}`)
    if (input.profile.profileUrl) parts.push(`URL: ${input.profile.profileUrl}`)
  }

  if (input.proofItems.length > 0) {
    parts.push(`\n## Relevant proof (use only this)`)
    for (const p of input.proofItems) {
      parts.push(`- ${p.projectSummary}`)
      if (p.reviewQuote) parts.push(`  Quote: "${p.reviewQuote.slice(0, 150)}"`)
    }
  }

  if (input.history && input.history.length > 0) {
    parts.push(`\n## Prior conversation`)
    for (const m of input.history) {
      if (m.sentText) parts.push(`You: ${m.sentText.slice(0, 300)}`)
    }

    const alreadyShared = dedupe(
      input.history
        .flatMap((m) => extractBioFacts(m.sentText ?? m.draftText ?? ''))
        .map((line) => clipSentence(line, 140)),
    ).slice(0, 3)
    if (alreadyShared.length > 0) {
      parts.push(`\n## Already established facts`)
      for (const fact of alreadyShared) {
        parts.push(`- ${fact}`)
      }
      parts.push('Do not repeat these unless the prospect asked directly for background/proof again.')
    }
  }

  const questions = extractQuestions(inboundMessage)
  if (questions.length > 0) {
    parts.push(`\n## Questions you must answer first`)
    for (const q of questions.slice(0, 3)) {
      parts.push(`- ${q}`)
    }
  }

  return parts.join('\n')
}

export function validateInboundReply(
  text: string,
  input?: InboundReplyInput,
): { valid: boolean; note: string } {
  for (const phrase of COLD_PHRASES) {
    if (phrase.test(text)) {
      return {
        valid: false,
        note: `Inbound reply contains cold-outreach language: "${phrase.source}". Rewrite as a direct response.`,
      }
    }
  }

  if (/\u2014|\u2013/.test(text)) {
    return { valid: false, note: 'Contains em dashes. Use hyphens only.' }
  }

  if (/!/.test(text)) {
    return { valid: false, note: 'Contains exclamation marks. Use periods.' }
  }

  if (text.length > 1500) {
    return { valid: false, note: 'Reply is too long. Inbound replies should be concise.' }
  }

  if (input) {
    const inboundMessage = input.lead.inboundMessage ?? ''
    const questions = extractQuestions(inboundMessage)
    if (questions.length > 0 && !answersDirectQuestion(text, questions)) {
      return {
        valid: false,
        note: 'Prospect asked a direct question, but the reply does not answer it concretely.',
      }
    }

    if (!BIO_ASK_PATTERN.test(inboundMessage) && repeatsKnownBioFact(text, input.history ?? [])) {
      return {
        valid: false,
        note: 'Reply repeats bio/proof facts already shared in this conversation without being asked.',
      }
    }

    const groundingIssue = detectGroundingIssue(text, input)
    if (groundingIssue) {
      return {
        valid: false,
        note: groundingIssue,
      }
    }

    if (isGenericFluff(text, input)) {
      return {
        valid: false,
        note: 'Reply is generic fluff without enough conversation-specific substance.',
      }
    }
  }

  return { valid: true, note: '' }
}

export function sanitizeInboundReply(text: string): string {
  let clean = text.replace(/[\u2014\u2013]/g, '-')
  clean = clean.replace(/!/g, '.')
  clean = clean.replace(/  +/g, ' ').trim()
  return clean
}

function extractQuestions(text: string): string[] {
  return (text.match(/[^?\n]+\?/g) ?? [])
    .map((q) => q.trim())
    .filter((q) => q.length >= 6)
}

function answersDirectQuestion(reply: string, questions: string[]): boolean {
  const lowerReply = reply.toLowerCase()
  if (/\b(happy to discuss|we can discuss|let'?s discuss|can we hop on|book a call)\b/i.test(lowerReply) && !/\b(typically|around|usually|because|it depends|yes|no)\b/i.test(lowerReply)) {
    return false
  }

  const keywords = dedupe(
    questions.flatMap((q) => tokenize(q)).filter((w) => w.length >= 4),
  )
  if (keywords.length === 0) return true

  const overlap = keywords.filter((word) => lowerReply.includes(word)).length
  const needed = Math.min(3, Math.max(1, Math.ceil(keywords.length / 4)))
  const hasDeclarative = /[a-z0-9][^.?!]{4,}\./i.test(reply) || /\b(typically|usually|depends|yes|no)\b/i.test(lowerReply)
  return hasDeclarative && overlap >= needed
}

function repeatsKnownBioFact(reply: string, history: Message[]): boolean {
  const priorFacts = dedupe(
    history
      .flatMap((m) => extractBioFacts(m.sentText ?? m.draftText ?? ''))
      .map((f) => tokenize(f).join(' '))
      .filter((f) => f.length > 0),
  )
  if (priorFacts.length === 0) return false

  const replyFacts = extractBioFacts(reply).map((f) => tokenize(f).join(' '))
  if (replyFacts.length === 0) return false

  return replyFacts.some((fact) => priorFacts.some((prev) => tokenOverlap(fact, prev) >= 0.6))
}

function detectGroundingIssue(text: string, input: InboundReplyInput): string | null {
  const claimSentences = splitSentences(text).filter((s) => DIRECT_CLAIM_PATTERN.test(s))
  if (claimSentences.length === 0) return null

  const allowedTokens = collectAllowedGroundingTokens(input)
  const allowedNames = collectAllowedNames(input)

  for (const sentence of claimSentences) {
    const tokens = tokenize(sentence).filter((w) => !['built', 'shipped', 'delivered', 'worked', 'managed', 'specialized', 'experience', 'years'].includes(w))
    if (tokens.length > 0) {
      const overlap = tokens.filter((t) => allowedTokens.has(t)).length
      if (overlap < Math.min(2, tokens.length)) {
        return 'Reply makes identity/proof claims that are not grounded in the selected profile or proof.'
      }
    }

    const nameMatches = [...sentence.matchAll(/\b(?:at|for)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})/g)]
    for (const match of nameMatches) {
      const named = (match[1] ?? '').trim().toLowerCase()
      if (named && !allowedNames.has(named)) {
        return `Reply references "${match[1]}" but that identity/proof is not in allowed context.`
      }
    }
  }

  return null
}

function isGenericFluff(text: string, input: InboundReplyInput): boolean {
  const fluffHits = FLUFF_PATTERNS.filter((p) => p.test(text)).length
  const specificity = hasContextAnchor(text, input)
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (fluffHits >= 2 && !specificity) return true
  if (words.length < 10 && !specificity) return true
  return false
}

function hasContextAnchor(text: string, input: InboundReplyInput): boolean {
  const lower = text.toLowerCase()
  const company = input.lead.company.toLowerCase()
  if (company && lower.includes(company)) return true

  const messageTokens = tokenize(input.lead.inboundMessage ?? '')
  const proofTokens = input.proofItems.flatMap((p) => tokenize(`${p.projectSummary} ${p.reviewQuote ?? ''}`))
  const anchors = new Set([...messageTokens, ...proofTokens].filter((w) => w.length >= 5))
  let hits = 0
  for (const token of anchors) {
    if (lower.includes(token)) hits++
    if (hits >= 2) return true
  }
  return false
}

function collectAllowedGroundingTokens(input: InboundReplyInput): Set<string> {
  const parts = [
    input.profile?.label ?? '',
    input.profile?.headline ?? '',
    ...(input.intelligence?.matchingSkills ?? []),
    ...input.proofItems.map((p) => p.projectSummary),
    ...input.proofItems.map((p) => p.reviewQuote ?? ''),
  ]
  return new Set(parts.flatMap((p) => tokenize(p)).filter((w) => w.length >= 4))
}

function collectAllowedNames(input: InboundReplyInput): Set<string> {
  const names = [
    input.lead.company,
    input.lead.contactName,
    input.profile?.label ?? null,
    ...input.proofItems
      .filter((p) => p.permissionOnFile && p.clientName)
      .map((p) => p.clientName),
  ]
  return new Set(
    names
      .map((n) => (n ?? '').trim().toLowerCase())
      .filter((n) => n.length > 0),
  )
}

function extractBioFacts(text: string): string[] {
  return splitSentences(text)
    .filter((s) => /\b(i|we)\b/i.test(s))
    .filter((s) => /\b(experience|years|worked|built|shipped|speciali[sz]ed|portfolio|project)\b/i.test(s))
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
}

function tokenOverlap(a: string, b: string): number {
  const at = new Set(a.split(/\s+/).filter(Boolean))
  const bt = new Set(b.split(/\s+/).filter(Boolean))
  if (at.size === 0 || bt.size === 0) return 0
  let shared = 0
  for (const t of at) {
    if (bt.has(t)) shared++
  }
  return shared / Math.max(at.size, bt.size)
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function clipSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1).trim()}...`
}
