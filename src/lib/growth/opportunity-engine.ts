import type {
  RelayGrowthMemory,
  RelayGrowthEvent,
  RelayContentOpportunity,
  ContentJob,
} from '@/lib/domain/types'

interface GenerateInput {
  memory: RelayGrowthMemory[]
  events: RelayGrowthEvent[]
  existing: RelayContentOpportunity[]
  orgId: string
}

interface OpportunityTemplate {
  sourceType: RelayContentOpportunity['sourceType']
  title: string
  observation: string
  insight: string
  territory: string
  audienceSegment: string
  contentJob: ContentJob
  evidenceStrength: 'strong' | 'medium' | 'weak'
  claimBoundaries: string[]
  audienceRelevance: number
  novelty: number
  specificity: number
  timeliness: number
  relayDifferentiation: number
  conversationPotential: number
  learningValue: number
  repetitionRisk: number
  commercialRelevance: number
}

const TERRITORIES = [
  'building_relay',
  'revenue_systems',
  'ai_human_work',
  'dogfood',
  'building_a_product',
  'proof_results',
]

const AUDIENCES = [
  'software_agency_founder',
  'technical_founder',
  'bd_revenue_lead',
  'small_sales_team',
  'consultancy_owner',
  'ai_native_operator',
  'freelancer_scaling',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateFromMemory(memory: RelayGrowthMemory): OpportunityTemplate[] {
  const templates: OpportunityTemplate[] = []

  for (const territory of memory.territories) {
    for (const audience of memory.audienceSegments) {
      if (memory.memoryType === 'product_fact') {
        templates.push({
          sourceType: 'product_memory',
          title: `Why ${memory.title} matters for ${audience.replace(/_/g, ' ')}`,
          observation: memory.content,
          insight: `Most teams don't realize that ${memory.title.toLowerCase()} changes how they should think about ${territory.replace(/_/g, ' ')}.`,
          territory,
          audienceSegment: audience,
          contentJob: pickRandom(['teach', 'challenge', 'show'] as ContentJob[]),
          evidenceStrength: 'strong',
          claimBoundaries: ['Do not claim specific metrics without verification'],
          audienceRelevance: 70 + Math.floor(Math.random() * 20),
          novelty: 60 + Math.floor(Math.random() * 30),
          specificity: 70 + Math.floor(Math.random() * 20),
          timeliness: 50 + Math.floor(Math.random() * 30),
          relayDifferentiation: 70 + Math.floor(Math.random() * 20),
          conversationPotential: 60 + Math.floor(Math.random() * 30),
          learningValue: 70 + Math.floor(Math.random() * 20),
          repetitionRisk: 0,
          commercialRelevance: 40 + Math.floor(Math.random() * 30),
        })
      }

      if (memory.memoryType === 'product_decision') {
        templates.push({
          sourceType: 'product_memory',
          title: `Why we decided: ${memory.title}`,
          observation: memory.content,
          insight: `This decision reveals a broader principle about ${territory.replace(/_/g, ' ')}.`,
          territory,
          audienceSegment: audience,
          contentJob: 'build_in_public',
          evidenceStrength: 'strong',
          claimBoundaries: ['Frame as our decision, not universal truth'],
          audienceRelevance: 60 + Math.floor(Math.random() * 25),
          novelty: 70 + Math.floor(Math.random() * 25),
          specificity: 80 + Math.floor(Math.random() * 15),
          timeliness: 60 + Math.floor(Math.random() * 30),
          relayDifferentiation: 80 + Math.floor(Math.random() * 15),
          conversationPotential: 70 + Math.floor(Math.random() * 25),
          learningValue: 75 + Math.floor(Math.random() * 20),
          repetitionRisk: 0,
          commercialRelevance: 30 + Math.floor(Math.random() * 30),
        })
      }
    }
  }

  return templates
}

function generateFromEvent(event: RelayGrowthEvent): OpportunityTemplate[] {
  const templates: OpportunityTemplate[] = []

  if (event.eventType === 'build_log_entry' || event.eventType === 'product_change') {
    templates.push({
      sourceType: 'product_event',
      title: event.title,
      observation: event.rawContent,
      insight: `This change reveals something important about how we build.`,
      territory: 'building_relay',
      audienceSegment: 'technical_founder',
      contentJob: 'build_in_public',
      evidenceStrength: 'strong',
      claimBoundaries: ['Only describe what actually happened'],
      audienceRelevance: 65 + Math.floor(Math.random() * 25),
      novelty: 70 + Math.floor(Math.random() * 25),
      specificity: 75 + Math.floor(Math.random() * 20),
      timeliness: 80 + Math.floor(Math.random() * 15),
      relayDifferentiation: 75 + Math.floor(Math.random() * 20),
      conversationPotential: 65 + Math.floor(Math.random() * 25),
      learningValue: 70 + Math.floor(Math.random() * 20),
      repetitionRisk: 0,
      commercialRelevance: 35 + Math.floor(Math.random() * 30),
    })
  }

  if (event.eventType === 'experiment_result' || event.eventType === 'dogfood_result') {
    templates.push({
      sourceType: 'experiment_result',
      title: `What we learned: ${event.title}`,
      observation: event.rawContent,
      insight: `The results challenged our assumptions.`,
      territory: 'dogfood',
      audienceSegment: 'technical_founder',
      contentJob: 'prove',
      evidenceStrength: 'strong',
      claimBoundaries: ['Only report actual results', 'Do not extrapolate beyond data'],
      audienceRelevance: 70 + Math.floor(Math.random() * 20),
      novelty: 75 + Math.floor(Math.random() * 20),
      specificity: 80 + Math.floor(Math.random() * 15),
      timeliness: 70 + Math.floor(Math.random() * 25),
      relayDifferentiation: 70 + Math.floor(Math.random() * 20),
      conversationPotential: 70 + Math.floor(Math.random() * 25),
      learningValue: 80 + Math.floor(Math.random() * 15),
      repetitionRisk: 0,
      commercialRelevance: 40 + Math.floor(Math.random() * 30),
    })
  }

  return templates
}

function isDuplicate(template: OpportunityTemplate, existing: RelayContentOpportunity[]): boolean {
  for (const opp of existing) {
    if (opp.title === template.title) return true
    if (opp.observation === template.observation) return true
  }
  return false
}

function asList(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return fallback
}

function fallbackOpportunities(): OpportunityTemplate[] {
  return [
    {
      sourceType: 'product_memory',
      title: 'AI does the preparation. People make the move.',
      observation: 'Revenue teams have tools for capture, drafting, and tracking, but still decide what to do next in their head.',
      insight: 'The product that wins is the one that prepares the next move without taking the action away from the human.',
      territory: 'ai_human_work',
      audienceSegment: 'technical_founder',
      contentJob: 'challenge',
      evidenceStrength: 'strong',
      claimBoundaries: ['Do not claim specific metrics without verification'],
      audienceRelevance: 82,
      novelty: 74,
      specificity: 78,
      timeliness: 70,
      relayDifferentiation: 88,
      conversationPotential: 76,
      learningValue: 80,
      repetitionRisk: 0,
      commercialRelevance: 55,
    },
    {
      sourceType: 'product_memory',
      title: 'Scattered tools still leave a blank next action',
      observation: 'Leads, conversations, content, and jobs live in different places, so the highest-leverage move is rarely obvious.',
      insight: 'A revenue system is only useful if it can name what deserves attention today.',
      territory: 'revenue_systems',
      audienceSegment: 'bd_revenue_lead',
      contentJob: 'teach',
      evidenceStrength: 'strong',
      claimBoundaries: ['Do not claim specific metrics without verification'],
      audienceRelevance: 84,
      novelty: 68,
      specificity: 76,
      timeliness: 72,
      relayDifferentiation: 80,
      conversationPotential: 70,
      learningValue: 78,
      repetitionRisk: 0,
      commercialRelevance: 62,
    },
    {
      sourceType: 'product_memory',
      title: 'Reps work as assigned Revenue Identities',
      observation: 'Authorization and daily work should match the identity the operator is actually running, not a generic inbox.',
      insight: 'Accountability only works when the identity, the queue, and the targets are the same object.',
      territory: 'building_relay',
      audienceSegment: 'technical_founder',
      contentJob: 'show',
      evidenceStrength: 'strong',
      claimBoundaries: ['Frame as how Relay works, not a universal market claim'],
      audienceRelevance: 76,
      novelty: 80,
      specificity: 84,
      timeliness: 68,
      relayDifferentiation: 90,
      conversationPotential: 72,
      learningValue: 82,
      repetitionRisk: 0,
      commercialRelevance: 48,
    },
  ]
}

export async function generateDailyOpportunities(input: GenerateInput): Promise<OpportunityTemplate[]> {
  const allTemplates: OpportunityTemplate[] = []

  for (const mem of input.memory) {
    allTemplates.push(...generateFromMemory({
      ...mem,
      territories: asList(mem.territories, TERRITORIES.slice(0, 1)),
      audienceSegments: asList(mem.audienceSegments, AUDIENCES.slice(0, 1)),
    }))
  }

  for (const event of input.events) {
    allTemplates.push(...generateFromEvent(event))
  }

  if (allTemplates.length === 0) {
    allTemplates.push(...fallbackOpportunities())
  }

  const unique = allTemplates.filter((t) => !isDuplicate(t, input.existing))
  const pool = unique.length > 0
    ? unique
    : fallbackOpportunities().filter((t) => !isDuplicate(t, input.existing))

  pool.sort((a, b) => {
    const scoreA = a.audienceRelevance + a.novelty + a.specificity
    const scoreB = b.audienceRelevance + b.novelty + b.specificity
    return scoreB - scoreA
  })

  return pool.slice(0, 8)
}
