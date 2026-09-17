/**
 * Relay Intelligence Benchmark — Outreach Quality Evaluator
 *
 * Evaluates generated outreach messages against golden cases.
 * Does NOT modify the message writer — only evaluates output.
 */

// ── Fabrication patterns ─────────────────────────────────────────────────────

const FABRICATION_PATTERNS = [
  /\b(the devs handed me|a colleague told me|my team said|during a meeting)\b/i,
  /\b(yesterday|today|this morning)\b.{0,30}\b(i|we)\s+(spent|debugged|shipped)\b/i,
  /\b(I noticed that your company (has|is|recently))\b/i,
  /\b(I saw your (recent|last) post about)\b.{0,50}\b(and it really resonated)\b/i,
  /\b(I've been following your (work|company|journey))\b/i,
  /\b(as I was looking through your (profile|portfolio|code))\b/i,
  /\b(one of your (engineers|developers|team members) (mentioned|said|told me))\b/i,
]

// ── Generic opening patterns ─────────────────────────────────────────────────

const GENERIC_OPENINGS = [
  /^(hi|hello|hey)\s+there[,.]?\s/i,
  /^(i hope this (message|email) finds you well)/i,
  /^(i came across your (profile|company|job posting))/i,
  /^(i'm reaching out because)/i,
  /^(i was (browsing|looking at) (linkedin|upwork))/i,
  /^(as a (senior|full.stack|developer|engineer))/i,
  /^(i'm (writing|reaching out) to (express|share|inquire))/i,
]

// ── Generic CTA patterns ──────────────────────────────────────────────────────

const GENERIC_CTAS = [
  /let me know if (you['']re interested|this (resonates|interests you))/i,
  /would love to (connect|chat|hop on a call)/i,
  /happy to (discuss|chat|talk) (more|further|whenever)/i,
  /let me know your thoughts/i,
  /looking forward to (hearing from you|your reply)/i,
  /feel free to (reach out|reply|respond)/i,
]

// ── Surveillance / creepy language ────────────────────────────────────────────

const SURVEILLANCE_PATTERNS = [
  /\b(i (noticed|saw|observed|tracked|found) (that )?you)\b/i,
  /\b(i (have been|'ve been) (following|monitoring|watching|tracking))\b/i,
  /\b(your (recent|last|latest) (activity|post|update|move|change))\b/i,
  /\b(i (know|can see|understand) that (you|your company))\b/i,
  /\b(you (posted|shared|updated|changed).{0,30}(yesterday|last week|recently))\b/i,
]

// ── Evaluation ────────────────────────────────────────────────────────────────

export function evaluateOutreach(caseObj, message) {
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return {
      status: 'UNSAFE',
      reasons: ['No message generated'],
      metrics: { length: 0 },
    }
  }

  const reasons = []
  let status = 'GOOD'

  // 1. Fabrication check
  const fabricationHits = FABRICATION_PATTERNS.filter((p) => p.test(message))
  if (fabricationHits.length > 0) {
    status = 'UNSAFE'
    reasons.push(`FABRICATED: Contains invented observation or claim`)
  }

  // 2. Surveillance / creepy language
  const surveillanceHits = SURVEILLANCE_PATTERNS.filter((p) => p.test(message))
  if (surveillanceHits.length > 0) {
    status = 'UNSAFE'
    reasons.push(`CREEPY: Contains surveillance-style language`)
  }

  // 3. Generic opening
  const genericOpening = GENERIC_OPENINGS.some((p) => p.test(message))
  if (genericOpening) {
    if (status === 'GOOD') status = 'LIGHT_EDIT'
    reasons.push('Generic opening')
  }

  // 4. Specificity — does it reference the actual opportunity signal?
  const expected = caseObj.expected_key_facts ?? {}
  const hasSignalReference = checkSignalReference(message, expected, caseObj)
  if (!hasSignalReference && caseObj.known_outcome !== 'BAD_PROSPECT') {
    if (status === 'GOOD') status = 'LIGHT_EDIT'
    reasons.push('No reference to the actual opportunity signal')
  }

  // 5. Company/person mention
  const hasCompanyMention = expected.company &&
    message.toLowerCase().includes(expected.company.toLowerCase().split(' ')[0].toLowerCase())
  if (!hasCompanyMention && expected.company) {
    if (status === 'GOOD') status = 'LIGHT_EDIT'
    reasons.push(`Does not mention company "${expected.company}"`)
  }

  // 6. Correct Revenue Identity (proof reference)
  const hasRelevantProof = checkProofReference(message, expected)
  if (!hasRelevantProof && caseObj.expected_key_facts?.tech_stack?.length > 0) {
    if (status === 'GOOD') status = 'LIGHT_EDIT'
    reasons.push('No relevant proof/capability reference for the tech stack needed')
  }

  // 7. Natural CTA
  const genericCta = GENERIC_CTAS.some((p) => p.test(message))
  if (genericCta) {
    if (status === 'GOOD') status = 'LIGHT_EDIT'
    reasons.push('Generic CTA')
  }

  // 8. Message length sanity
  if (message.length < 100) {
    if (status === 'GOOD') status = 'LIGHT_EDIT'
    reasons.push('Message too short (< 100 chars)')
  }
  if (message.length > 1200) {
    if (status === 'GOOD') status = 'LIGHT_EDIT'
    reasons.push('Message too long (> 1200 chars)')
  }

  return {
    status,
    reasons,
    metrics: {
      length: message.length,
      hasSignalReference,
      hasCompanyMention,
      hasRelevantProof,
      fabricationHits: fabricationHits.length,
      surveillanceHits: surveillanceHits.length,
    },
  }
}

function checkSignalReference(message, expected, caseObj) {
  const msgLower = message.toLowerCase()

  // Check for signal evidence reference
  if (caseObj.expected_key_facts?.signal_evidence) {
    const evidenceWords = caseObj.expected_key_facts.signal_evidence
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .slice(0, 4)
    const evidenceMatch = evidenceWords.filter((w) => msgLower.includes(w)).length
    if (evidenceMatch >= 2) return true
  }

  // Check for signal type keywords
  const signalKeywords = {
    hiring: ['hiring', 'open role', 'growing team', 'engineering team', 'join'],
    understaffed: ['solo', 'one person', 'small team', 'doing everything'],
    funding: ['raised', 'funding', 'seed', 'series', 'round', 'invest'],
    stale: ['outdated', 'old version', 'hasn\'t updated', 'last update'],
    weak_stack: ['legacy', 'outdated', 'old framework', 'migrating'],
    pain: ['struggling', 'stuck', 'pain', 'frustrated', 'delay', 'months'],
    asking: ['looking for', 'need help', 'seeking', 'reaching out', 'hiring'],
  }

  const keywords = signalKeywords[expected.signal] ?? []
  return keywords.some((kw) => msgLower.includes(kw))
}

function checkProofReference(message, expected) {
  if (!expected.tech_stack) return false
  const msgLower = message.toLowerCase()
  const techMatches = expected.tech_stack.filter((t) => msgLower.includes(t.toLowerCase())).length
  return techMatches >= 1
}

// ── Cross-message similarity ─────────────────────────────────────────────────

export function computeMessageSimilarity(messages) {
  if (!messages || messages.length < 2) return { maxSimilarity: 0, pairs: [] }

  const pairs = []
  let maxSim = 0

  for (let i = 0; i < messages.length; i++) {
    for (let j = i + 1; j < messages.length; j++) {
      const sim = textSimilarity(messages[i], messages[j])
      if (sim > maxSim) maxSim = sim
      if (sim > 0.6) {
        pairs.push({ i, j, similarity: sim })
      }
    }
  }

  // Check for repeated openings
  const openings = messages.map((m) => m.split(/[.!?]/)[0]?.trim().toLowerCase() ?? '')
  const openingCounts = {}
  for (const o of openings) {
    if (o.length > 5) openingCounts[o] = (openingCounts[o] ?? 0) + 1
  }
  const repeatedOpenings = Object.entries(openingCounts)
    .filter(([, count]) => count > 2)
    .map(([opening, count]) => ({ opening, count }))

  // Check for repeated CTAs
  const ctas = messages.map((m) => {
    const sentences = m.split(/[.!?]/).filter(s => s.trim().length > 0)
    return sentences[sentences.length - 1]?.trim().toLowerCase() ?? ''
  })
  const ctaCounts = {}
  for (const c of ctas) {
    if (c.length > 5) ctaCounts[c] = (ctaCounts[c] ?? 0) + 1
  }
  const repeatedCTAs = Object.entries(ctaCounts)
    .filter(([, count]) => count > 2)
    .map(([cta, count]) => ({ cta, count }))

  return {
    maxSimilarity: maxSim,
    similarPairs: pairs.length,
    repeatedOpenings,
    repeatedCTAs,
    isTemplateHeavy: maxSim > 0.7 || repeatedOpenings.length > 0 || repeatedCTAs.length > 0,
  }
}

function textSimilarity(a, b) {
  const tokenize = (s) => s.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.length === 0 || tb.length === 0) return 0
  const setA = new Set(ta)
  const setB = new Set(tb)
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  return intersection.size / Math.sqrt(setA.size * setB.size)
}
