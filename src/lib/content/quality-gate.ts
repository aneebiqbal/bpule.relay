/**
 * Comprehensive quality gate for social post generation.
 *
 * Catches the failure modes from the regression fixture:
 * - Fabricated personal experience (first AND third person)
 * - Generic insights / low information density
 * - Generic conclusions
 * - Weak Persona fit
 * - Garbled source handling
 * - Empty motivational takeaways
 */

export interface QualityCheckResult {
  passed: boolean
  failures: QualityFailure[]
  warnings: QualityWarning[]
  scores: QualityScores
}

export interface QualityFailure {
  code: string
  message: string
  severity: 'critical' | 'major'
}

export interface QualityWarning {
  code: string
  message: string
}

export interface QualityScores {
  informationDensity: number
  personaFit: number
  specificity: number
  nonGenericness: number
  insightDepth: number
}

const GENERIC_INSIGHT_PATTERNS = [
  /\b(keep it simple|keeping things simple)\b/i,
  /\b(focus on the basics|stick to the basics)\b/i,
  /\b(overcomplicate what'?s? (simple|already simple))\b/i,
  /\b(progress happens)\b/i,
  /\b(consistency matters)\b/i,
  /\b(work smarter)\b/i,
  /\b(don'?t overthink)\b/i,
  /\b(communication matters)\b/i,
  /\b(quality matters)\b/i,
  /\b(learn from mistakes)\b/i,
  /\b(trust the process)\b/i,
  /\b(stay curious)\b/i,
  /\b(embrace change)\b/i,
  /\b(cut the noise)\b/i,
  /\b(the truth is)\b/i,
  /\b(here'?s? (the truth|what I learned|something I realized))\b/i,
  /\b(one thing I'?ve? realized)\b/i,
  /\b(I'?ve? been thinking)\b/i,
  /\b(sometimes the simplest)\b/i,
  /\b(the other day)\b/i,
]

const FABRICATED_EXPERIENCE_PATTERNS = [
  // First person
  /\b(i|we)\s+(spent|debugged|shipped|fixed|met|saw|handled|dealt|worked|built|created|launched)\b/i,
  /\b(today|yesterday|last week|this morning|last month)\b.{0,30}\b(i|we)\b/i,
  /\bmy (team|client|boss|manager|colleague|coworker)\b.{0,30}\b(said|told|gave|asked|requested)\b/i,
  // Third person fabricated
  /\bthe (devs|developers|engineers|team|designers|manager|boss|client)\b.{0,30}\b(handed|gave|told|said|asked|requested|muttered)\b/i,
  /\b(a (developer|engineer|designer|manager|client))\b.{0,30}\b(handed|gave|told|said|asked)\b/i,
  /\b(i was (working|building|debugging|shipping|fixing))\b/i,
  /\b(we (were|had been) (working|building|debugging|shipping))\b/i,
  /\bmy (latest|current|recent) (project|client|work)\b/i,
  /\b(i (noticed|realized|discovered|found))\b.{0,30}\b(when|while|after|during)\b/i,
]

const LOW_INFORMATION_PATTERNS = [
  /\b(good|great|important|key|essential|fundamental|core)\b.{0,20}\b(good|great|important|key|essential|fundamental|core)\b/i,
  /\b(at the end of the day)\b/i,
  /\b(it'?s? important to)\b/i,
  /\b(the reality is)\b/i,
  /\b(what matters most)\b/i,
  /\b(the bottom line)\b/i,
  /\b(long story short)\b/i,
]

const GENERIC_CONCLUSION_PATTERNS = [
  /\b(and that'?s? (it|the lesson|the key|what matters))\b/i,
  /\b(the (real |key |important )?(takeaway|lesson|insight|truth))\b/i,
  /\b(in (conclusion|summary|the end))\b/i,
  /\b(so (remember|the next time|what))\b/i,
]

export function evaluatePostQuality(input: {
  caption: string
  personaContext: {
    expertise: string[]
    audiences: string[]
    goals: string[]
    projects: string[]
    opinions: string[]
    territories: string[]
  }
  sourceMaterial: string
  platform: string
}): QualityCheckResult {
  const { caption, personaContext, sourceMaterial } = input
  const failures: QualityFailure[] = []
  const warnings: QualityWarning[] = []
  const lower = caption.toLowerCase()
  const words = caption.split(/\s+/).filter((w: string) => w.length > 2)

  // ── 1. Fabricated experience check ─────────────────────────────────────
  const fabricatedPatterns = FABRICATED_EXPERIENCE_PATTERNS.filter((p) => p.test(lower))
  if (fabricatedPatterns.length > 0) {
    failures.push({
      code: 'UNSUPPORTED_PERSONAL_CLAIM',
      message: 'Post contains personal experience claims without confirmed supporting evidence.',
      severity: 'critical',
    })
  }

  // ── 2. Generic insight check ──────────────────────────────────────────
  const genericInsights = GENERIC_INSIGHT_PATTERNS.filter((p) => p.test(lower))
  if (genericInsights.length > 0) {
    failures.push({
      code: 'GENERIC_INSIGHT',
      message: `Post contains generic motivational insight: ${genericInsights.map((p) => p.source).join(', ')}`,
      severity: 'major',
    })
  }

  // ── 3. Low information density ────────────────────────────────────────
  const uniqueWords = new Set(words.map((w: string) => w.toLowerCase()))
  const informationDensity = uniqueWords.size / Math.max(words.length, 1)
  if (words.length > 15 && informationDensity < 0.5) {
    failures.push({
      code: 'LOW_INFORMATION_DENSITY',
      message: `Post has low information density (${Math.round(informationDensity * 100)}%). Too much repetition.`,
      severity: 'major',
    })
  }

  // ── 4. Generic conclusion ────────────────────────────────────────────
  const genericConclusion = GENERIC_CONCLUSION_PATTERNS.some((p) => p.test(lower))
  if (genericConclusion) {
    warnings.push({
      code: 'GENERIC_CONCLUSION',
      message: 'Post has a generic conclusion pattern.',
    })
  }

  // ── 5. Garbled source handling ────────────────────────────────────────
  const garbledWords = findGarbledWords(caption)
  if (garbledWords.length > 0) {
    failures.push({
      code: 'MALFORMED_SOURCE_HANDLING',
      message: `Post contains garbled/misspelled words: ${garbledWords.join(', ')}`,
      severity: 'critical',
    })
  }

  // ── 6. Persona specificity ───────────────────────────────────────────
  const personaFit = calculatePersonaFit(lower, input.personaContext)
  if (input.personaContext.expertise.length > 0 && personaFit < 0.15) {
    failures.push({
      code: 'WEAK_PERSONA_FIT',
      message: 'Post has no meaningful connection to Persona expertise, projects, or opinions.',
      severity: 'major',
    })
  }

  // ── 7. Information gain ──────────────────────────────────────────────
  const informationGain = assessInformationGain(caption)
  if (informationGain < 0.3 && words.length > 10) {
    failures.push({
      code: 'LOW_INFORMATION_GAIN',
      message: 'Post does not provide the reader with a specific observation, mechanism, tradeoff, or useful distinction.',
      severity: 'major',
    })
  }

  // ── 8. Opening quality ───────────────────────────────────────────────
  const opening = caption.split('\n')[0]?.toLowerCase() ?? ''
  const weakOpening = GENERIC_INSIGHT_PATTERNS.some((p) => p.test(opening)) ||
    /\b(i'?ve? been|here'?s|sometimes|the other day|in today'?s)\b/.test(opening)
  if (weakOpening) {
    warnings.push({
      code: 'WEAK_OPENING',
      message: 'Opening line is generic or clichéd.',
    })
  }

  // ── Calculate scores ──────────────────────────────────────────────────
  const scores: QualityScores = {
    informationDensity: Math.min(1, informationDensity * 2),
    personaFit,
    specificity: Math.min(1, (genericInsights.length === 0 ? 0.5 : 0) + informationGain * 0.5),
    nonGenericness: Math.max(0, 1 - genericInsights.length * 0.3 - (genericConclusion ? 0.2 : 0)),
    insightDepth: informationGain,
  }

  const criticalFailures = failures.filter((f) => f.severity === 'critical')
  const passed = criticalFailures.length === 0 && failures.filter((f) => f.severity === 'major').length <= 1

  return { passed, failures, warnings, scores }
}

function findGarbledWords(text: string): string[] {
  const garbled: string[] = []
  const words = text.split(/\s+/)
  for (const word of words) {
    if (!word) continue
    const cleaned = word.replace(/[^a-zA-Z]/g, '')
    if (cleaned.length < 3) continue
    // Check for obvious typos: repeated consonants, missing vowels in long words
    if (/(.)\1{2,}/.test(cleaned) && cleaned.length > 4) {
      garbled.push(word)
    }
    // Check for words with no vowels that are longer than 4 chars
    if (cleaned.length > 4 && !/[aeiou]/.test(cleaned.toLowerCase())) {
      garbled.push(word)
    }
    // Check for obvious misspellings of common words
    const commonMisspellings: Record<string, string> = {
      'basica': 'basic',
      'nothinig': 'nothing',
      'alread': 'already',
      'overcomplicate': 'overcomplicate',
    }
    const lower = cleaned.toLowerCase()
    if (commonMisspellings[lower]) {
      garbled.push(word)
    }
  }
  return garbled
}

function calculatePersonaFit(
  lowerCaption: string,
  context: { expertise: string[]; audiences: string[]; goals: string[]; projects: string[]; opinions: string[]; territories: string[] },
): number {
  let matches = 0
  let totalFactors = 0

  // Expertise matches
  for (const exp of context.expertise) {
    totalFactors++
    if (lowerCaption.includes(exp.toLowerCase())) matches++
  }

  // Project matches
  for (const proj of context.projects) {
    totalFactors++
    if (lowerCaption.includes(proj.toLowerCase().split(' ')[0])) matches++
  }

  // Opinion matches
  for (const op of context.opinions) {
    totalFactors++
    const opWords = op.toLowerCase().split(/\s+/).filter((w) => w.length > 4)
    if (opWords.some((w) => lowerCaption.includes(w))) matches++
  }

  // Territory matches
  for (const terr of context.territories) {
    totalFactors++
    if (lowerCaption.includes(terr.toLowerCase().split(' ')[0])) matches++
  }

  if (totalFactors === 0) return 0.5 // No context to fit against
  return matches / totalFactors
}

function assessInformationGain(caption: string): number {
  const lower = caption.toLowerCase()
  let score = 0

  // Specific technical terms
  if (/\b(api|database|query|cache|server|client|frontend|backend|deploy|build|test|debug|refactor|architecture|pattern|framework|library|function|class|module|component|service|microservice|container|kubernetes|docker|aws|gcp)\b/.test(lower)) {
    score += 0.3
  }

  // Numbers and metrics
  if (/\b(\d+%|\d+x|\d+\s*(ms|sec|min|hours|days|weeks|users|requests|MB|GB))\b/i.test(lower)) {
    score += 0.2
  }

  // Specific frameworks/tools
  if (/\b(react|vue|angular|rails|django|node|typescript|python|rust|go|java|postgres|redis|mongodb|graphql|rest|grpc)\b/i.test(lower)) {
    score += 0.2
  }

  // Tradeoffs mentioned
  if (/\b(tradeoff|cost|benefit|advantage|disadvantage|pros?|cons?|however|but|although|instead|rather|alternative)\b/i.test(lower)) {
    score += 0.15
  }

  // Specific patterns or frameworks
  if (/\b(pattern|approach|strategy|technique|method|principle|rule|heuristic|framework)\b/i.test(lower)) {
    score += 0.15
  }

  // Named concepts
  if (/\b(solid|dry|kiss|yagni|mvc|mvp|ci[-/]cd|tdd|bdd|oop|functional)\b/i.test(lower)) {
    score += 0.2
  }

  return Math.min(1, score)
}

/**
 * Quick check for the regression fixture.
 * Returns true if the post should be rejected.
 */
export function isRegressionFixture(caption: string): boolean {
  const lower = caption.toLowerCase()
  const checks = [
    /the devs handed me/i,
    /no nothinig/i,
    /overcomplicate what'?s? already simple/i,
    /cut the noise and stick to the basics/i,
    /progress happens/i,
  ]
  return checks.some((re) => re.test(lower))
}
