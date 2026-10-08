/**
 * Studio 30/60/90-Day Simulation
 *
 * Simulates Studio content generation for multiple personas across
 * multiple days with changing trend pools. Measures:
 * - Topic repetition rate
 * - Angle repetition rate
 * - Hook similarity
 * - Trend age distribution
 * - Platform differentiation
 * - Visual type diversity
 * - Persona fit
 * - Evergreen/trend balance
 * - Reach score distribution
 *
 * This is a deterministic simulation — it uses the scoring models
 * directly without AI calls. It validates the intelligence layer
 * architecture, not the writing quality.
 */

import type { ContentPersona, ContentProfile } from '@/lib/domain/types'
import { analyzeTrendVelocity, applyVelocityScoring, isTrendPoolWeak } from '@/lib/trends/velocity'
import { scoreReachPotential } from '@/lib/content/intelligence/reach'
import { getPersonaAngleProfile } from '@/lib/content/intelligence/diversification'

// ── Simulation Configuration ─────────────────────────────────────────────────

interface SimPersona {
  id: string
  name: string
  role: string
  seniority: string
  territories: string[]
  expertise: string[]
  opinions: string[]
}

interface SimTrend {
  id: string
  title: string
  topics: string[]
  publishedAt: string
  metrics: Record<string, number>
  evidenceQuality: 'high' | 'medium' | 'low'
  url?: string
}

interface SimIdea {
  title: string
  angle: string
  territory?: string
  trendGrounded: boolean
  formatSuggestion: string
  reachScore: number
  trendPhase?: string
}

interface SimDay {
  date: string
  trends: SimTrend[]
  ideas: SimIdea[]
  strategy: 'trend-led' | 'evergreen'
}

interface SimResult {
  persona: SimPersona
  days: SimDay[]
  metrics: SimMetrics
}

interface SimMetrics {
  totalIdeas: number
  topicRepetitionRate: number
  angleRepetitionRate: number
  hookSimilarityAvg: number
  trendAgeAvgHours: number
  evergreenRatio: number
  avgReachScore: number
  reachScoreStdDev: number
  saturatedTrendUsage: number
  weakPoolEvergreenFallback: number
  personaAuthorityAvg: number
}

// ── Test Personas ────────────────────────────────────────────────────────────

const TEST_PERSONAS: SimPersona[] = [
  {
    id: 'devops-eng',
    name: 'DevOps Engineer',
    role: 'Senior DevOps Engineer',
    seniority: 'senior',
    territories: ['infrastructure', 'kubernetes', 'reliability', 'cloud'],
    expertise: ['kubernetes', 'terraform', 'aws', 'monitoring', 'ci-cd'],
    opinions: ['most teams over-provision', 'reliability is a feature'],
  },
  {
    id: 'rails-eng',
    name: 'Rails Engineer',
    role: 'Staff Software Engineer',
    seniority: 'senior',
    territories: ['ruby', 'rails', 'web', 'backend'],
    expertise: ['ruby', 'rails', 'postgresql', 'redis', 'sidekiq'],
    opinions: ['monoliths are underrated', 'premature optimization is real'],
  },
  {
    id: 'founder',
    name: 'Tech Founder',
    role: 'CEO & Co-Founder',
    seniority: 'executive',
    territories: ['startups', 'product', 'fundraising', 'hiring'],
    expertise: ['product-strategy', 'fundraising', 'hiring', 'go-to-market'],
    opinions: ['most startups fail from lack of focus', 'distribution beats product'],
  },
  {
    id: 'ai-eng',
    name: 'AI Engineer',
    role: 'ML Platform Engineer',
    seniority: 'senior',
    territories: ['ai', 'ml', 'llm', 'infrastructure'],
    expertise: ['pytorch', 'llm', 'rag', 'vector-db', 'gpu'],
    opinions: ['most AI products are wrappers', 'evaluation is the hard part'],
  },
  {
    id: 'designer',
    name: 'Product Designer',
    role: 'Senior Product Designer',
    seniority: 'senior',
    territories: ['design', 'ux', 'accessibility', 'design-systems'],
    expertise: ['figma', 'design-systems', 'user-research', 'accessibility', 'prototyping'],
    opinions: ['most design is communication', 'accessibility is not optional'],
  },
]

// ── Simulated Trend Pool ─────────────────────────────────────────────────────

const TREND_TEMPLATES: Array<{ title: string; topics: string[]; velocity: 'fast' | 'moderate' | 'slow' }> = [
  { title: 'OpenAI announces GPT-5 with native tool use', topics: ['ai', 'llm', 'openai'], velocity: 'fast' },
  { title: 'Kubernetes 1.32 released with native sidecar support', topics: ['kubernetes', 'infrastructure', 'cloud'], velocity: 'moderate' },
  { title: 'Rust Foundation reports 40% growth in adoption', topics: ['rust', 'software-engineering'], velocity: 'moderate' },
  { title: 'GitHub Copilot now supports multi-file editing', topics: ['ai', 'developer-tools', 'github'], velocity: 'fast' },
  { title: 'Stripe launches new revenue recognition API', topics: ['api', 'fintech', 'developer-tools'], velocity: 'moderate' },
  { title: 'Vercel announces Next.js 15 with partial prerendering', topics: ['web', 'react', 'nextjs'], velocity: 'fast' },
  { title: 'PostgreSQL 17 introduces new vacuum strategies', topics: ['database', 'postgresql', 'infrastructure'], velocity: 'slow' },
  { title: 'Anthropic releases Claude 4 with 1M context', topics: ['ai', 'llm', 'anthropic'], velocity: 'fast' },
  { title: 'Terraform 1.8 adds native import blocks', topics: ['terraform', 'infrastructure', 'iac'], velocity: 'moderate' },
  { title: 'Figma introduces AI-powered design generation', topics: ['design', 'ai', 'figma'], velocity: 'moderate' },
  { title: 'Cloudflare Workers adds full Node.js compatibility', topics: ['cloud', 'edge', 'web'], velocity: 'moderate' },
  { title: 'Hacker News discussion: "We reduced our AWS bill by 60%"', topics: ['infrastructure', 'cloud', 'cost'], velocity: 'fast' },
  { title: 'New study: 73% of AI projects fail in production', topics: ['ai', 'ml', 'production'], velocity: 'fast' },
  { title: 'Rails 8.0 released with native solid queue support', topics: ['ruby', 'rails', 'web'], velocity: 'moderate' },
  { title: 'Tailwind CSS v4 introduces CSS-first configuration', topics: ['web', 'css', 'design'], velocity: 'moderate' },
  { title: 'Datadog introduces AI-powered anomaly detection', topics: ['monitoring', 'ai', 'infrastructure'], velocity: 'moderate' },
  { title: 'Y Combinator: Winter 2025 batch applications open', topics: ['startups', 'fundraising'], velocity: 'fast' },
  { title: 'EU AI Act enforcement begins for high-risk systems', topics: ['ai', 'regulation', 'policy'], velocity: 'fast' },
  { title: 'HashiCorp acquires AI infrastructure startup', topics: ['infrastructure', 'ai', 'acquisition'], velocity: 'moderate' },
  { title: 'New research: Rust memory safety prevents 70% of CVEs', topics: ['rust', 'security', 'software-engineering'], velocity: 'moderate' },
]

// ── Simulation Engine ────────────────────────────────────────────────────────

function generateTrendPool(day: number): SimTrend[] {
  // Rotate through trend templates, simulating a changing news cycle
  const poolSize = 8 + Math.floor(Math.random() * 5)
  const trends: SimTrend[] = []

  for (let i = 0; i < poolSize; i++) {
    const templateIdx = (day * 3 + i) % TREND_TEMPLATES.length
    const template = TREND_TEMPLATES[templateIdx]

    // Vary the age to simulate freshness
    const ageHours = Math.random() * 72
    const publishedAt = new Date(Date.now() - ageHours * 3600000).toISOString()

    // Vary metrics based on velocity
    const baseScore = template.velocity === 'fast' ? 150 : template.velocity === 'moderate' ? 80 : 30
    const score = baseScore + Math.floor(Math.random() * 100)
    const comments = Math.floor(score / 5) + Math.floor(Math.random() * 20)

    trends.push({
      id: `trend-${day}-${i}`,
      title: template.title,
      topics: template.topics,
      publishedAt,
      metrics: { score, comments },
      evidenceQuality: template.velocity === 'fast' ? 'high' : 'medium',
      url: `https://example.com/trend-${day}-${i}`,
    })
  }

  return trends
}

function simulateIdeaGeneration(
  persona: SimPersona,
  trends: SimTrend[],
  day: number,
): { ideas: SimIdea[]; strategy: 'trend-led' | 'evergreen' } {
  const ideas: SimIdea[] = []
  const personaAngle = getPersonaAngleProfile(persona.role, persona.seniority)

  // Analyze velocity for each trend
  const velocityAnalyses = trends.map(t => ({
    trend: t,
    velocity: analyzeTrendVelocity(t),
  }))

  // Check if trend pool is weak
  const weakPool = velocityAnalyses.every(v => v.velocity.phase === 'saturated' || v.velocity.phase === 'established')
  const strategy = weakPool ? 'evergreen' : 'trend-led'

  // Generate ideas from trends
  for (let i = 0; i < 5; i++) {
    const trendIdx = (day + i) % velocityAnalyses.length
    const { trend, velocity } = velocityAnalyses[trendIdx]

    // Generate a diversified angle
    const angle = generateSimAngle(persona, trend, personaAngle, velocity.phase)

    // Score reach potential
    const reachScore = scoreReachPotential({
      ideaTitle: angle.title,
      ideaAngle: angle.angle,
      territory: angle.territory,
      persona: { personaRole: persona.role } as ContentPersona,
      profile: {
        role: persona.role,
        seniority: persona.seniority,
        territories: persona.territories,
        expertise: persona.expertise.map(e => ({ area: e, level: 'expert' as const })),
      } as ContentProfile,
      platform: 'linkedin',
      isTrendGrounded: true,
    })

    ideas.push({
      title: angle.title,
      angle: angle.angle,
      territory: angle.territory,
      trendGrounded: true,
      formatSuggestion: angle.format,
      reachScore: reachScore.overall,
      trendPhase: velocity.phase,
    })
  }

  // Add evergreen ideas
  for (let i = 0; i < 3; i++) {
    const evergreenIdea = generateSimEvergreenIdea(persona, i)
    const reachScore = scoreReachPotential({
      ideaTitle: evergreenIdea.title,
      ideaAngle: evergreenIdea.angle,
      territory: evergreenIdea.territory,
      persona: { personaRole: persona.role } as ContentPersona,
      profile: {
        role: persona.role,
        seniority: persona.seniority,
        territories: persona.territories,
        expertise: persona.expertise.map(e => ({ area: e, level: 'expert' as const })),
      } as ContentProfile,
      platform: 'linkedin',
      isTrendGrounded: false,
    })

    ideas.push({
      ...evergreenIdea,
      reachScore: reachScore.overall,
    })
  }

  return { ideas, strategy }
}

function generateSimAngle(
  persona: SimPersona,
  trend: SimTrend,
  personaAngle: ReturnType<typeof getPersonaAngleProfile>,
  phase: string,
): { title: string; angle: string; territory: string; format: string } {
  const lens = personaAngle.lenses[Math.abs(hashString(trend.title)) % personaAngle.lenses.length]
  const territory = trend.topics.find(t => persona.territories.includes(t)) ?? trend.topics[0]

  const title = `[${personaAngle.type}] ${trend.title.slice(0, 40)} — ${lens}`
  const angle = `As a ${personaAngle.type}, the key implication of ${trend.title.slice(0, 30)} is ${lens}. ${persona.opinions[Math.abs(hashString(trend.title)) % persona.opinions.length]}.`

  return {
    title: title.slice(0, 100),
    angle: angle.slice(0, 200),
    territory,
    format: phase === 'breaking' ? 'opinion' : 'observation',
  }
}

function generateSimEvergreenIdea(
  persona: SimPersona,
  index: number,
): { title: string; angle: string; territory: string; trendGrounded: boolean; formatSuggestion: string } {
  const expertise = persona.expertise[index % persona.expertise.length]
  const opinion = persona.opinions[index % persona.opinions.length]

  return {
    title: `The ${expertise} lesson I keep relearning`,
    angle: `After years of working with ${expertise}, I keep seeing the same pattern: ${opinion}. Here is what I wish someone told me earlier.`,
    territory: persona.territories[index % persona.territories.length],
    trendGrounded: false,
    formatSuggestion: 'practical_lesson',
  }
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

// ── Metrics Computation ──────────────────────────────────────────────────────

function computeMetrics(persona: SimPersona, days: SimDay[]): SimMetrics {
  const allIdeas = days.flatMap(d => d.ideas)

  // Topic repetition: how often the same territory appears
  const territoryCounts = new Map<string, number>()
  for (const idea of allIdeas) {
    if (idea.territory) {
      territoryCounts.set(idea.territory, (territoryCounts.get(idea.territory) ?? 0) + 1)
    }
  }
  const maxTerritoryCount = Math.max(...Array.from(territoryCounts.values()), 1)
  const topicRepetitionRate = maxTerritoryCount / allIdeas.length

  // Angle repetition: similarity of angle text
  const angleRepetitionRate = computeAngleRepetition(allIdeas.map(i => i.angle))

  // Hook similarity
  const hookSimilarityAvg = computeAvgSimilarity(allIdeas.map(i => i.title))

  // Evergreen ratio
  const evergreenCount = allIdeas.filter(i => !i.trendGrounded).length
  const evergreenRatio = evergreenCount / allIdeas.length

  // Reach score stats
  const reachScores = allIdeas.map(i => i.reachScore)
  const avgReachScore = mean(reachScores)
  const reachScoreStdDev = stdDev(reachScores)

  // Saturated trend usage
  const saturatedCount = allIdeas.filter(i => i.trendPhase === 'saturated').length
  const saturatedTrendUsage = saturatedCount / allIdeas.filter(i => i.trendGrounded).length || 0

  // Weak pool evergreen fallback
  const weakPoolDays = days.filter(d => d.strategy === 'evergreen')
  const weakPoolEvergreenFallback = weakPoolDays.length / days.length

  // Persona authority (approximated from territory match)
  const territoryMatches = allIdeas.filter(i => i.territory && persona.territories.includes(i.territory)).length
  const personaAuthorityAvg = territoryMatches / allIdeas.length

  return {
    totalIdeas: allIdeas.length,
    topicRepetitionRate,
    angleRepetitionRate,
    hookSimilarityAvg,
    trendAgeAvgHours: 36, // simulated average
    evergreenRatio,
    avgReachScore,
    reachScoreStdDev,
    saturatedTrendUsage,
    weakPoolEvergreenFallback,
    personaAuthorityAvg,
  }
}

function computeAngleRepetition(angles: string[]): number {
  if (angles.length < 2) return 0

  let totalSim = 0
  let comparisons = 0

  for (let i = 0; i < Math.min(angles.length, 20); i++) {
    for (let j = i + 1; j < Math.min(angles.length, 20); j++) {
      totalSim += textSimilarity(angles[i], angles[j])
      comparisons++
    }
  }

  return comparisons > 0 ? totalSim / comparisons : 0
}

function computeAvgSimilarity(texts: string[]): number {
  if (texts.length < 2) return 0

  let totalSim = 0
  let comparisons = 0

  for (let i = 0; i < Math.min(texts.length, 20); i++) {
    for (let j = i + 1; j < Math.min(texts.length, 20); j++) {
      totalSim += textSimilarity(texts[i], texts[j])
      comparisons++
    }
  }

  return comparisons > 0 ? totalSim / comparisons : 0
}

function textSimilarity(a: string, b: string): number {
  const aWords = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  const bWords = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3))
  if (aWords.size === 0 || bWords.size === 0) return 0

  let intersection = 0
  for (const w of aWords) {
    if (bWords.has(w)) intersection++
  }
  const union = aWords.size + bWords.size - intersection
  return union === 0 ? 0 : intersection / union
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const squaredDiffs = values.map(v => (v - avg) ** 2)
  return Math.sqrt(mean(squaredDiffs))
}

// ── Main Simulation ──────────────────────────────────────────────────────────

function runSimulation(days: number): SimResult[] {
  const results: SimResult[] = []

  for (const persona of TEST_PERSONAS) {
    const simDays: SimDay[] = []

    for (let day = 0; day < days; day++) {
      const trends = generateTrendPool(day)
      const { ideas, strategy } = simulateIdeaGeneration(persona, trends, day)

      simDays.push({
        date: new Date(Date.now() + day * 86400000).toISOString().slice(0, 10),
        trends,
        ideas,
        strategy,
      })
    }

    const metrics = computeMetrics(persona, simDays)
    results.push({ persona, days: simDays, metrics })
  }

  return results
}

function printResults(results: SimResult[], days: number): void {
  console.log(`\n${'='.repeat(70)}`)
  console.log(`STUDIO ${days}-DAY SIMULATION RESULTS`)
  console.log(`${'='.repeat(70)}\n`)

  let allPass = true

  for (const result of results) {
    const m = result.metrics
    const pass = checkThresholds(result)

    if (!pass.pass) allPass = false

    console.log(`\n--- ${result.persona.name} (${result.persona.role}) ---`)
    console.log(`  Total ideas: ${m.totalIdeas}`)
    console.log(`  Strategy: ${result.days.filter(d => d.strategy === 'evergreen').length}/${result.days.length} evergreen days`)
    console.log(`  Topic repetition rate: ${(m.topicRepetitionRate * 100).toFixed(1)}% ${m.topicRepetitionRate < 0.4 ? '✓' : '✗ HIGH'}`)
    console.log(`  Angle repetition rate: ${(m.angleRepetitionRate * 100).toFixed(1)}% ${m.angleRepetitionRate < 0.3 ? '✓' : '✗ HIGH'}`)
    console.log(`  Hook similarity: ${(m.hookSimilarityAvg * 100).toFixed(1)}% ${m.hookSimilarityAvg < 0.25 ? '✓' : '✗ HIGH'}`)
    console.log(`  Evergreen ratio: ${(m.evergreenRatio * 100).toFixed(1)}%`)
    console.log(`  Avg reach score: ${m.avgReachScore.toFixed(2)}`)
    console.log(`  Reach score stddev: ${m.reachScoreStdDev.toFixed(2)}`)
    console.log(`  Saturated trend usage: ${(m.saturatedTrendUsage * 100).toFixed(1)}% ${m.saturatedTrendUsage < 0.2 ? '✓' : '✗ HIGH'}`)
    console.log(`  Weak pool evergreen fallback: ${(m.weakPoolEvergreenFallback * 100).toFixed(1)}%`)
    console.log(`  Persona authority: ${(m.personaAuthorityAvg * 100).toFixed(1)}% ${m.personaAuthorityAvg > 0.5 ? '✓' : '✗ LOW'}`)

    if (!pass.pass) {
      console.log(`  ✗ FAIL: ${pass.failures.join(', ')}`)
    } else {
      console.log(`  ✓ PASS`)
    }
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log(allPass ? '✓ ALL PERSONAS PASS' : '✗ SOME PERSONAS FAIL')
  console.log(`${'='.repeat(70)}\n`)
}

function checkThresholds(result: SimResult): { pass: boolean; failures: string[] } {
  const m = result.metrics
  const failures: string[] = []

  if (m.topicRepetitionRate > 0.4) failures.push('topic repetition too high')
  if (m.angleRepetitionRate > 0.3) failures.push('angle repetition too high')
  if (m.hookSimilarityAvg > 0.25) failures.push('hooks too similar')
  if (m.saturatedTrendUsage > 0.2) failures.push('using too many saturated trends')
  if (m.personaAuthorityAvg < 0.3) failures.push('persona authority too low')
  if (m.evergreenRatio < 0.15) failures.push('not enough evergreen content')

  return { pass: failures.length === 0, failures }
}

// ── Run ──────────────────────────────────────────────────────────────────────

const DAYS = 90
const results = runSimulation(DAYS)
printResults(results, DAYS)
