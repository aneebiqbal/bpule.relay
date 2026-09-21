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

export async function generateDailyOpportunities(input: GenerateInput): Promise<OpportunityTemplate[]> {
  const allTemplates: OpportunityTemplate[] = []

  for (const mem of input.memory) {
    allTemplates.push(...generateFromMemory(mem))
  }

  for (const event of input.events) {
    allTemplates.push(...generateFromEvent(event))
  }

  const unique = allTemplates.filter((t) => !isDuplicate(t, input.existing))

  unique.sort((a, b) => {
    const scoreA = a.audienceRelevance + a.novelty + a.specificity + a.evidenceStrength.length
    const scoreB = b.audienceRelevance + b.novelty + b.specificity + b.evidenceStrength.length
    return scoreB - scoreA
  })

  return unique.slice(0, 30)
}
