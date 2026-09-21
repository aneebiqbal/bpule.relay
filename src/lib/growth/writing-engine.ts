import type { PostPlan, RelayContentOpportunity } from '@/lib/domain/types'
import { buildPostPlanFromOpportunity } from './post-plan'

interface WritingInput {
  opportunity: RelayContentOpportunity
  postPlan: PostPlan
}

interface WritingResult {
  caption: string
  hook: string
  qualityScore: number
  qualityNotes: string[]
  structure: string
  platform: string
}

export async function generatePost(input: WritingInput): Promise<WritingResult> {
  const { opportunity, postPlan } = input

  const context = buildPromptContext(opportunity, postPlan)
  const caption = await callWritingEngine(context, postPlan)

  const qualityScore = scoreQuality(caption, postPlan)
  const qualityNotes = generateQualityNotes(caption, postPlan)

  return {
    caption,
    hook: extractHook(caption),
    qualityScore,
    qualityNotes,
    structure: postPlan.structure,
    platform: 'linkedin',
  }
}

function buildPromptContext(opp: RelayContentOpportunity, plan: PostPlan): string {
  return `Write a LinkedIn post for Relay's growth engine.

AUDIENCE: ${plan.audience}
TERRITORY: ${plan.territory}
CONTENT JOB: ${plan.contentJob}
CORE INSIGHT: ${plan.coreInsight}
EVIDENCE: ${plan.evidence.join('; ')}
CLAIM BOUNDARIES: ${plan.claimBoundaries.join('; ')}
OPENING STRATEGY: ${plan.openingStrategy}
STRUCTURE: ${plan.structure}
TAKEAWAY: ${plan.takeaway}
DESIRED REACTION: ${plan.desiredReaction}
PRODUCT MENTION: ${plan.productMention}
CTA: ${plan.cta || 'None'}

RELAY VOICE:
- Specific, experienced, technically aware
- Commercially aware but not salesy
- Slightly opinionated, clear, restrained, human
- NO corporate speak, no motivational guru, no AI evangelist
- NO emojis, no em dashes, no "thoughts?", no "agree?"
- NO "The future is here", "AI is changing everything", "game changer", "10x"
- NO fake vulnerability, no invented founder drama

Write the post now. Keep it under 3000 characters. Use line breaks for readability.`
}

async function callWritingEngine(context: string, plan: PostPlan): Promise<string> {
  const { generate } = await import('@/lib/ai/runtime')

  const result = await generate<string>({
    task: 'DEEP_WRITING',
    system: context,
    user: 'Write the LinkedIn post now.',
    temperature: 0.7,
    maxTokens: 1500,
  })

  return result.data || generateFallbackPost(plan)
}

function generateFallbackPost(plan: PostPlan): string {
  const lines: string[] = []

  lines.push(plan.coreInsight)
  lines.push('')
  lines.push(plan.evidence[0] || '')
  lines.push('')
  lines.push(`The takeaway: ${plan.takeaway}`)

  if (plan.cta) {
    lines.push('')
    lines.push(plan.cta)
  }

  return lines.join('\n')
}

function extractHook(caption: string): string {
  const firstLine = caption.split('\n')[0] || ''
  return firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine
}

function scoreQuality(caption: string, plan: PostPlan): number {
  let score = 70

  if (caption.length > 500) score += 5
  if (caption.length > 1000) score += 5
  if (caption.includes('\n\n')) score += 5
  if (!caption.includes('?') && plan.contentJob === 'start_conversation') score -= 10
  if (caption.includes('The future is here')) score -= 20
  if (caption.includes('AI is changing everything')) score -= 20
  if (caption.includes('game changer')) score -= 20
  if (caption.includes('10x')) score -= 15
  if (caption.includes('—')) score -= 5

  return Math.max(0, Math.min(100, score))
}

function generateQualityNotes(caption: string, plan: PostPlan): string[] {
  const notes: string[] = []

  if (caption.length < 200) notes.push('Too short — may lack depth')
  if (caption.length > 3000) notes.push('Too long — may lose readers')
  if (caption.includes('The future is here')) notes.push('Contains banned phrase')
  if (caption.includes('AI is changing everything')) notes.push('Contains banned phrase')
  if (caption.includes('game changer')) notes.push('Contains banned phrase')
  if (caption.includes('10x')) notes.push('Contains hype language')
  if (caption.includes('—')) notes.push('Contains em dash')
  if (!caption.includes('\n')) notes.push('No line breaks — hard to read')

  if (notes.length === 0) {
    notes.push('Passes basic quality checks')
  }

  return notes
}
