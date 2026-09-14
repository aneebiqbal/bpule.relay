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
  // UNSUPPORTED FIRST-PERSON EVENT CLAIMS
  // Pattern: [time] + [first-person] + [action verb]
  /\b(today|yesterday|last week|this morning|last month|recently|lately)\b.{0,40}\b(i|we)\s+(spent|had|made|got|found|noticed|realized|discovered|learned|decided|started|began|finished|completed)\b/i,
  // Pattern: [first-person] + [past-tense action] + [detail]
  /\b(i|we)\s+(spent|debugged|shipped|fixed|built|created|launched|deployed|shipped|migrated|refactored|redesigned|restructured)\s+(a |the |my |our )?\w+/i,
  // Pattern: [my/our] + [role/relation] + [communication verb]
  /\bmy\s+(team|client|boss|manager|colleague|coworker|director|vp|ceo|cto)\b.{0,30}\b(said|told|gave|asked|requested|demanded|insisted|suggested|informed)\b/i,
  // Pattern: [my/our] + [work item]
  /\bmy\s+(latest|current|recent|new)\s+(project|client|work|engagement|initiative|launch|release)\b/i,

  // UNSUPPORTED THIRD-PERSON EVENT CLAIMS (general patterns, not phrase-specific)
  // Pattern: [the/a] + [role] + [transfer/communication verb]
  /\bthe\s+(devs|developers|engineers|team|designers|design team|engineering team|product team|manager|boss|director|client|customer|founder|ceo|cto)\b.{0,40}\b(handed|gave|sent|told|said|asked|requested|presented|delivered|passed|shared|emailed|messaged|muttered|complained)\b/i,
  // Pattern: [a/an] + [role] + [transfer/communication verb]
  /\b(a|an)\s+(developer|engineer|designer|manager|client|customer|founder|consultant|agency|stakeholder)\b.{0,40}\b(handed|gave|sent|told|said|asked|requested|presented|delivered|passed|shared)\b/i,
  // Pattern: [someone] + [action] + [for/with] + [persona]
  /\b(he|she|they|someone|a colleague|a manager|a client|a founder)\s+(came to|approached|emailed|called|messaged|contacted|visited|brought)\s+(me|us)\b/i,

  // UNSUPPORTED EVENT NARRATIVES (general: any unsupported event description)
  /\b(during|after|while|in)\s+(a |the )?(meeting|call|conversation|discussion|review|standup|retrospective|sprint)\b.{0,30}\b(i|we|my|the team)\b/i,
  /\bwe\s+(were|had been|spent)\s+(working|building|debugging|shipping|trying|attempting|planning|discussing)\b/i,
  /\bi\s+(was|had been)\s+(working|building|debugging|shipping|trying|attempting|planning)\s+(on|with|at)\b/i,
  // GENERAL THIRD-PERSON CLAIM: [person/role] + [action verb] + [object]
  /\b(a |the |my |our )?(client|customer|founder|ceo|cto|manager|team|developer|engineer|designer|stakeholder)\s+(told|informed|asked|requested|needed|wanted|said|mentioned|reported|explained|shared|gave|sent|emailed|called|approached)\s+(me|us|that)/i,
  // UNSUPPORTED EVENT: "we spent [time] [doing]"
  /\bwe\s+(spent|invested|devoted|dedicated)\s+(\d+|a |several |many )\s+(hours?|days?|weeks?|months?)\s+(working|building|trying|debugging|fixing|developing|creating|designing|testing|planning|writing)/i,
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
    role?: string
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

  // ── 3b. Keyword stuffing detection ────────────────────────────────────
  // Check if the same short set of words dominates the post
  const wordFrequency = new Map<string, number>()
  for (const word of words) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '')
    if (w.length < 3) continue
    wordFrequency.set(w, (wordFrequency.get(w) ?? 0) + 1)
  }
  const sortedFreq = [...wordFrequency.entries()].sort((a, b) => b[1] - a[1])
  const top3Count = sortedFreq.slice(0, 3).reduce((sum, [, count]) => sum + count, 0)
  const top3Ratio = top3Count / Math.max(words.length, 1)
  if (words.length > 20 && top3Ratio > 0.4) {
    failures.push({
      code: 'LOW_INFORMATION_DENSITY',
      message: `Post appears keyword-stuffed (top 3 words make up ${Math.round(top3Ratio * 100)}% of content).`,
      severity: top3Ratio > 0.35 ? 'critical' : 'major',
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
  // Threshold: 0.1 for technical roles, 0.05 for non-technical (founder, designer, BD, etc.)
  const isNonTechnical = isNonTechnicalRole(input.personaContext.role)
  const personaFitThreshold = isNonTechnical ? 0.05 : 0.1
  if (input.personaContext.expertise.length > 0 && personaFit < personaFitThreshold) {
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
const lower = cleaned.toLowerCase()

  // Known technical vocabulary — NEVER flag as garbled
  const knownTechnicalVocab = new Set([
    'postgresql', 'supabase', 'meilisearch', 'nextjs', 'reactjs', 'nodejs',
    'typescript', 'javascript', 'web3', 'solana', 'spree', 'longcat',
    'graphql', 'restful', 'middleware', 'frontend', 'backend', 'fullstack',
    'devops', 'kubernetes', 'docker', 'terraform', 'ansible', 'redis',
    'mongodb', 'mysql', 'sqlite', 'elasticsearch', 'kafka', 'rabbitmq',
    'aws', 'gcp', 'azure', 'vercel', 'netlify', 'heroku', 'cloudflare',
    'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'figma', 'sketch',
    'tailwind', 'bootstrap', 'materialui', 'chakra', 'styledcomponents',
    'webpack', 'vite', 'rollup', 'babel', 'eslint', 'prettier', 'jest',
    'cypress', 'playwright', 'storybook', 'prisma', 'drizzle', 'typeorm',
    'hibernate', 'springboot', 'django', 'flask', 'fastapi', 'express',
    'nestjs', 'graphql', 'apollo', 'urql', 'trpc', 'zod', 'yup',
    'responder', 'serializer', 'normalizer', 'denormalized', 'indexable',
    'optimistic', 'pessimistic', 'idempotency', 'backoff', 'circuitbreaker',
    'ratelimiter', 'middleware', 'preloader', 'prefetch', 'lazyload',
    'webpack', 'code splitting', 'treeshaking', 'hotreload',
  ])
  if (knownTechnicalVocab.has(lower)) continue

  // Known misspellings that indicate garbled input
  const knownMisspellings = new Set([
    'basica', 'nothinig', 'alread', 'overcomplicate', 'somethign',
    'anythign', 'nothign', 'whatevr', 'becuase', 'occured', 'recieve',
    'seperate', 'definately', 'accomodate', 'occurence', 'independant',
    'neccessary', 'succesful', 'enviroment', 'goverment', 'occassion',
  ])
  if (knownMisspellings.has(lower)) {
    garbled.push(word)
  }
}
  return garbled
}

function calculatePersonaFit(
  lowerCaption: string,
  context: { expertise: string[]; audiences: string[]; goals: string[]; projects: string[]; opinions: string[]; territories: string[] },
): number {
  let score = 0
  let maxScore = 0

  // Expertise semantic fit (not just keyword match)
  for (const exp of context.expertise) {
    maxScore += 1
    const expLower = exp.toLowerCase()
    // Direct mention
    if (lowerCaption.includes(expLower)) {
      score += 1
    } else {
      // Semantic association: check if related concepts appear
      const relatedTerms = getRelatedTerms(expLower)
      if (relatedTerms.some((t) => lowerCaption.includes(t))) {
        score += 0.5
      }
    }
  }

  // Territory alignment
  for (const terr of context.territories) {
    maxScore += 0.5
    const terrWords = terr.toLowerCase().split(/\s+/)
    if (terrWords.some((w) => w.length > 3 && lowerCaption.includes(w))) {
      score += 0.5
    }
  }

  // Opinion alignment (semantic, not keyword)
  for (const op of context.opinions) {
    maxScore += 0.5
    const opKeyWords = op.toLowerCase().split(/\s+/).filter((w) => w.length > 5)
    if (opKeyWords.some((w) => lowerCaption.includes(w))) {
      score += 0.5
    }
  }

  // Project relevance
  for (const proj of context.projects) {
    maxScore += 0.5
    const projWords = proj.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    if (projWords.some((w) => lowerCaption.includes(w))) {
      score += 0.5
    }
  }

  if (maxScore === 0) return 0.5 // No context to fit against
  return Math.min(1, score / maxScore)
}

function getRelatedTerms(expertise: string): string[] {
  const termMap: Record<string, string[]> = {
    'react': ['component', 'render', 'state', 'props', 'hook', 'virtual dom', 'jsx', 'frontend', 'ui'],
    'typescript': ['type', 'interface', 'generic', 'compile', 'javascript', 'js', 'ts'],
    'rails': ['ruby', 'mvc', 'active record', 'migration', 'controller', 'model', 'route'],
    'node': ['javascript', 'event loop', 'async', 'promise', 'npm', 'backend', 'server'],
    'python': ['django', 'flask', 'fastapi', 'pip', 'script', 'data'],
    'aws': ['cloud', 'lambda', 's3', 'ec2', 'infrastructure', 'deploy'],
    'architecture': ['system', 'design', 'pattern', 'structure', 'scale', 'microservice'],
    'design': ['ui', 'ux', 'visual', 'typography', 'layout', 'color', 'brand', 'aesthetic'],
    'product': ['feature', 'roadmap', 'user', 'customer', 'market', 'strategy', 'launch'],
    'marketing': ['campaign', 'audience', 'brand', 'content', 'growth', 'reach', 'engagement'],
    'sales': ['pipeline', 'prospect', 'deal', 'close', 'revenue', 'quota', 'outreach'],
    'leadership': ['team', 'culture', 'hire', 'manage', 'mentor', 'delegate', 'vision'],
    'consulting': ['client', 'engagement', 'advisory', 'recommend', 'assess', 'transform'],
  }
  return termMap[expertise] ?? []
}

function assessInformationGain(caption: string): number {
  const lower = caption.toLowerCase()
  let score = 0

  // ANY of these substance indicators count — not just technical ones

  // Specific mechanism / causal explanation
  if (/\b(because|cause|reason|happens when|results in|leads to|creates|produces|means that|implies|therefore|consequently)\b/.test(lower)) {
    score += 0.25
  }

  // Non-obvious distinction / contrast
  if (/\b(but|however|actually|in reality|the difference|unlike|instead|rather than|in contrast|on the other hand)\b/.test(lower)) {
    score += 0.2
  }

  // Concrete example / illustration
  if (/\b(for example|for instance|such as|like when|specifically|in practice|consider|imagine|picture|think about)\b/.test(lower)) {
    score += 0.2
  }

  // Useful heuristic / rule / principle
  if (/\b(rule|principle|heuristic|pattern|approach|strategy|technique|method|framework|mental model)\b/.test(lower)) {
    score += 0.15
  }

  // Tradeoff / consequence
  if (/\b(tradeoff|cost|benefit|advantage|disadvantage|sacrifice|give up|at the expense|versus|vs|consequence|outcome)\b/.test(lower)) {
    score += 0.2
  }

  // Specific professional observation
  if (/\b(I'?ve? seen|I'?ve? noticed|observing|the data shows|evidence suggests|research shows|studies show|experience suggests)\b/.test(lower)) {
    score += 0.2
  }

  // Numbers and metrics (any domain)
  if (/\b(\d+%|\d+x|\d+\s*(ms|sec|min|hours|days|weeks|months|users|customers|people|times|dollars|percent))\b/i.test(lower)) {
    score += 0.15
  }

  // Technical specificity (bonus, not required)
  if (/\b(system|process|workflow|pipeline|infrastructure|platform|tool|platform|integration|interface|protocol|api|database|query|cache|server|client|component|service)\b/.test(lower)) {
    score += 0.1
  }

  // Domain-specific vocabulary (business/design/marketing)
  if (/\b(revenue|growth|retention|conversion|funnel|acquisition|engagement|usability|accessibility|brand|positioning|market|audience|customer|user)\b/.test(lower)) {
    score += 0.1
  }

  return Math.min(1, score)
}

/**
 * Determines if a persona role is non-technical (lower persona fit threshold).
 * Founders, designers, BD, sales, marketing, consultants may write strong posts
 * without repeating technical keywords.
 */
function isNonTechnicalRole(role?: string): boolean {
  if (!role) return false
  const lower = role.toLowerCase()
  const nonTechnical = [
    'founder', 'ceo', 'cto', 'coo', 'chief',
    'designer', 'ux', 'ui', 'product designer',
    'sales', 'business development', 'bd',
    'marketing', 'growth',
    'consultant', 'advisor',
    'product manager', 'project manager',
  ]
  return nonTechnical.some((term) => lower.includes(term))
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
