/**
 * Premium Post Quality Scorer
 *
 * Scores generated posts on dimensions that actually predict reach.
 * Rejects posts that fail minimum thresholds.
 *
 * Dimensions:
 * - hookStrength: Does the first line stop the scroll?
 * - specificity: Concrete details vs vague generalities
 * - opinionStrength: Does it take a position?
 * - novelty: Fresh angle vs recycled advice
 * - credibility: Can this person say this?
 * - personaFit: Matches their expertise and voice
 * - platformFit: Right length, tone, structure for LinkedIn/X
 * - nonGenericness: Would a thousand people write this?
 */

export interface PostQualityInput {
  caption: string
  title: string
  angle: string
  personaRole: string
  expertise: string[]
  territories: string[]
  platform: 'linkedin' | 'x'
  trendGrounded: boolean
}

export interface PostQualityResult {
  passed: boolean
  overall: number // 0-10
  dimensions: {
    hookStrength: number
    specificity: number
    opinionStrength: number
    novelty: number
    credibility: number
    personaFit: number
    platformFit: number
    nonGenericness: number
  }
  failures: string[]
  suggestions: string[]
}

export function scorePostQuality(input: PostQualityInput): PostQualityResult {
  const { caption, title, angle, personaRole, expertise, territories, platform } = input
  const text = caption.toLowerCase()
  const failures: string[] = []
  const suggestions: string[] = []

  // ── 1. Hook Strength (0-10) ──
  const hook = caption.split('\n')[0]?.trim() ?? ''
  let hookStrength = 5

  // Strong hooks: numbers, contrarian claims, specific stories, questions
  if (/\d+%|\d+x|\+\d+/.test(hook)) hookStrength += 2
  if (/^(I |my |our |we |the |after |when |most |every |no one |here's |the real )/i.test(hook)) hookStrength += 1
  if (/\?$/.test(hook) && hook.length < 100) hookStrength += 1.5
  if (/(wrong|myth|mistake|never|always|stop|should|must|actually|truth|reality|problem)/i.test(hook)) hookStrength += 1
  if (hook.length < 15) hookStrength -= 2
  if (hook.length > 200) hookStrength -= 1
  // Weak hooks
  if (/^(have you ever|did you know|think about|consider this|in today|here's why|here's what)/i.test(hook)) { hookStrength -= 3; failures.push('WEAK_HOOK') }
  if (/^(I want to|I'm going to|let me|let's dive|in this post)/i.test(hook)) { hookStrength -= 2; failures.push('FILLER_HOOK') }
  hookStrength = Math.max(0, Math.min(10, hookStrength))

  // ── 2. Specificity (0-10) ──
  let specificity = 3
  const evidencePatterns = [
    /\d+%/, /\d+x/, /\+\d+/, /\$\d+/, /saved \d+/, /reduced \d+/, /increased \d+/,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i,
    /\b\d{4}\b/,
  ]
  for (const p of evidencePatterns) {
    if (p.test(caption)) specificity += 1.5
  }
  // Named tools/products
  const toolPatterns = /\b(aws|gcp|azure|kubernetes|docker|terraform|react|next\.?js|node|postgres|redis|mongodb|graphql|rest|grpc|kafka|elasticsearch|prometheus|grafana|github|vercel|railway|figma|notion|slack|jira)\b/gi
  const toolMatches = caption.match(toolPatterns)
  if (toolMatches && toolMatches.length >= 2) specificity += 2
  else if (toolMatches && toolMatches.length >= 1) specificity += 1
  // Penalize vague language
  const vaguePatterns = [/\b(things?|stuff|lots?|many|various|several|good|great|amazing|awesome|nice|interesting)\b/gi]
  for (const p of vaguePatterns) {
    const matches = caption.match(p)
    if (matches && matches.length >= 3) { specificity -= 2; suggestions.push('Replace vague words with specifics') }
  }
  specificity = Math.max(0, Math.min(10, specificity))

  // ── 3. Opinion Strength (0-10) ──
  let opinionStrength = 3
  const opinionPatterns = [
    /\b(I think|I believe|I've found|in my experience|the truth is|actually|the reality is)\b/i,
    /\b(wrong|myth|mistake|never|always|should|must|stop|avoid|overrated|underrated)\b/i,
    /\b(not|isn't|doesn't|won't|can't|shouldn't)\s.+\b/gi, // negation = taking a position
    /\b(unlike|instead|rather|better than|worse than|the problem with)\b/i,
  ]
  for (const p of opinionPatterns) {
    if (p.test(caption)) opinionStrength += 1.5
  }
  // First-person experience
  if (/\b(I |my |our |we )\b/i.test(caption)) opinionStrength += 1
  opinionStrength = Math.max(0, Math.min(10, opinionStrength))
  if (opinionStrength < 4) suggestions.push('Take a stronger position or share a specific opinion')

  // ── 4. Novelty (0-10) ──
  let novelty = 5
  const genericPatterns = [
    /\b(in today's fast[- ]?paced (world|environment|landscape))\b/i,
    /\b(here are \d+ (tips?|ways?|things?|reasons?))\b/i,
    /\b(game[- ]?changing?)\b/i,
    /\b(let that sink in)\b/i,
    /\b(the future of)\b/i,
    /\b(thoughts\?|agree\?)\s*$/i,
    /\b(here's the thing)\b/i,
    /\b(at the end of the day)\b/i,
    /\b(it is what it is)\b/i,
    /\b(think outside the box)\b/i,
    /\b(moving forward)\b/i,
    /\b(in order to)\b/i,
    /\b(leverage|synergy|paradigm|disrupt|innovate)\b/i,
  ]
  for (const p of genericPatterns) {
    if (p.test(caption)) { novelty -= 2; failures.push('GENERIC_PHRASE') }
  }
  // Contrarian takes boost novelty
  if (/\b(wrong|myth|mistake|not actually|doesn't work|isn't true|the problem with|stop doing)\b/i.test(caption)) novelty += 2
  // Specific numbers boost novelty
  if (/\d+%|\d+x/.test(caption)) novelty += 1
  novelty = Math.max(0, Math.min(10, novelty))

  // ── 5. Credibility (0-10) ──
  let credibility = 4
  // First-person evidence
  if (/\b(I |my |our |we )\b/i.test(caption)) credibility += 2
  // Specific metrics
  if (/\d+%|\d+x|\+\d+/.test(caption)) credibility += 2
  // Named tools/context
  if (toolMatches && toolMatches.length > 0) credibility += 1
  // Years of experience mentioned
  if (/\b\d+\+?\s*years?\b/i.test(caption)) credibility += 1
  // Penalize: no evidence for strong claims
  if (/\b(always|never|every|all|none|best|worst)\b/i.test(caption) && !/\d/.test(caption)) {
    credibility -= 2
    suggestions.push('Add evidence for absolute claims')
  }
  credibility = Math.max(0, Math.min(10, credibility))

  // ── 6. Persona Fit (0-10) ──
  let personaFit = 5
  const roleLower = personaRole.toLowerCase()
  const expertiseLower = expertise.map(e => e.toLowerCase())
  const territoryLower = territories.map(t => t.toLowerCase())

  // Check if post mentions expertise areas
  for (const exp of expertiseLower) {
    if (text.includes(exp)) { personaFit += 1.5; break }
  }
  // Check if post mentions territories
  for (const terr of territoryLower) {
    if (text.includes(terr.toLowerCase())) { personaFit += 1; break }
  }
  // Role-appropriate language
  if (/engineer|developer/.test(roleLower) && /\b(code|system|architecture|deploy|infra|api|database|server)\b/.test(text)) personaFit += 1
  if (/founder|ceo|cto/.test(roleLower) && /\b(company|team|product|customer|revenue|growth|hiring)\b/.test(text)) personaFit += 1
  if (/devops|sre/.test(roleLower) && /\b(infrastructure|deploy|monitoring|reliability|incident|uptime)\b/.test(text)) personaFit += 1
  personaFit = Math.max(0, Math.min(10, personaFit))

  // ── 7. Platform Fit (0-10) ──
  let platformFit = 6
  const wordCount = caption.split(/\s+/).length
  if (platform === 'linkedin') {
    if (wordCount >= 80 && wordCount <= 250) platformFit += 2
    else if (wordCount < 50) { platformFit -= 3; failures.push('TOO_SHORT_FOR_LINKEDIN') }
    else if (wordCount > 350) { platformFit -= 2; suggestions.push('Consider shortening for LinkedIn') }
    // LinkedIn rewards paragraphs
    const paragraphs = caption.split('\n\n').filter(p => p.trim().length > 0)
    if (paragraphs.length >= 3) platformFit += 1
    if (paragraphs.length >= 5) platformFit += 1
  } else {
    // X
    if (caption.length <= 280) platformFit += 2
    else if (caption.length > 280) { platformFit -= 4; failures.push('TOO_LONG_FOR_X') }
    if (wordCount <= 40) platformFit += 1
    if (/\?$/.test(caption.trim())) platformFit += 1 // questions drive engagement on X
  }
  platformFit = Math.max(0, Math.min(10, platformFit))

  // ── 8. Non-Genericness (0-10) ──
  let nonGenericness = 5
  // Unique specifics make it non-generic
  if (/\d+%|\d+x|\+\d+/.test(caption)) nonGenericness += 1.5
  if (/\b(I |my |our )\b/i.test(caption)) nonGenericness += 1
  if (toolMatches && toolMatches.length >= 2) nonGenericness += 1
  // Penalize: could anyone write this?
  const genericAdvice = [
    /\b(never give up|keep going|stay focused|work hard|be yourself)\b/i,
    /\b(the key is|the secret is|the most important thing is)\b/i,
    /\b(in conclusion|to summarize|in summary)\b/i,
  ]
  for (const p of genericAdvice) {
    if (p.test(caption)) { nonGenericness -= 2 }
  }
  nonGenericness = Math.max(0, Math.min(10, nonGenericness))

  // ── Overall Score ──
  const overall = (
    hookStrength * 0.20 +
    specificity * 0.15 +
    opinionStrength * 0.15 +
    novelty * 0.15 +
    credibility * 0.10 +
    personaFit * 0.10 +
    platformFit * 0.10 +
    nonGenericness * 0.05
  )

  // ── Pass/Fail ──
  const passed = failures.length === 0 && overall >= 5.5 && hookStrength >= 4 && specificity >= 3

  if (!passed && failures.length === 0) {
    if (overall < 5.5) failures.push('LOW_OVERALL_QUALITY')
    if (hookStrength < 4) failures.push('WEAK_HOOK')
    if (specificity < 3) failures.push('TOO_VAGUE')
  }

  return {
    passed,
    overall: Math.round(overall * 10) / 10,
    dimensions: {
      hookStrength: Math.round(hookStrength * 10) / 10,
      specificity: Math.round(specificity * 10) / 10,
      opinionStrength: Math.round(opinionStrength * 10) / 10,
      novelty: Math.round(novelty * 10) / 10,
      credibility: Math.round(credibility * 10) / 10,
      personaFit: Math.round(personaFit * 10) / 10,
      platformFit: Math.round(platformFit * 10) / 10,
      nonGenericness: Math.round(nonGenericness * 10) / 10,
    },
    failures,
    suggestions,
  }
}
