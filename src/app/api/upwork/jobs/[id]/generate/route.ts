import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generate } from '@/lib/ai/runtime'
import { injectStyleCard } from '@/lib/style/inject'
import { sanitizeDraft } from '@/lib/facts/sanitize'
import { AI_TELL_PHRASES, BANNED_PHRASES } from '@/lib/writing/engine'

export const dynamic = 'force-dynamic'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * POST /api/upwork/jobs/[id]/generate
 * Body: { profileId, proofId? }
 * Returns: { draft: { text, selfCheck, ... } }
 *
 * Generate an Upwork proposal using the same premium writing engine as leads,
 * but with Upwork-specific strategy and proof matching.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Job id must be a UUID.' }, { status: 400 })
  }

  let body: { profileId?: string; proofId?: string; generationMode?: 'standard' | 'premium' }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const generationMode = body.generationMode === 'premium' ? 'premium' : 'standard'

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const store = await createScoutStore()
  const job = await store.getUpworkJob(id)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const [profiles, facts, plays] = await Promise.all([
    store.listProfiles(),
    store.listFacts(),
    store.listPlays(),
  ])

  const profile = profiles.find((p) => p.id === body.profileId) ?? profiles[0] ?? null
  const voiceProfile = await store.getVoiceProfile()
  const styleCard = injectStyleCard(voiceProfile?.styleCard)

  const tagMatches = await store.matchProofItems(job.requiredSkills ?? [], 8, profile?.id ?? null)
  let matched = tagMatches
  if (body.proofId) {
    const explicit = matched.find((p) => p.id === body.proofId) ?? null
    if (explicit) matched = [explicit, ...matched.filter((p) => p.id !== body.proofId)]
  }
  const matchedProof = matched[0] ?? null

  // Build the proposal prompt
  const jobContext = [
    `Job Title: ${job.title}`,
    job.budgetMin || job.hourlyRateMin
      ? `Budget: ${job.budgetMin ? `$${job.budgetMin}–$${job.budgetMax} fixed` : `$${job.hourlyRateMin}–$${job.hourlyRateMax}/hr`}`
      : null,
    job.requiredSkills.length > 0 ? `Required skills: ${job.requiredSkills.join(', ')}` : null,
    job.urgencySignal ? `Urgency: ${job.urgencySignal}` : null,
    `Description: ${job.description}`,
  ].filter(Boolean).join('\n')

  const proofBlock = matchedProof
    ? `RELEVANT PROOF (reference naturally, do not dump): ${matchedProof.projectSummary}${matchedProof.reviewQuote ? `\nClient said: "${matchedProof.reviewQuote}"` : ''}`
    : ''

  const systemPrompt = [
    'You write Upwork proposals for a software consultant. The proposal is copy-pasted by a human; you never send anything yourself.',
    '',
    styleCard ? `SENDER VOICE (mandatory):\n${styleCard}` : '',
    '',
    'UPWORK PROPOSAL RULES:',
    '1. Start with understanding of the client\'s problem, not credentials.',
    '2. Reference ONE relevant proof item naturally. Never dump a list.',
    '3. Show what you would do first (specific technical observation).',
    '4. End with a useful question or clear next step.',
    '5. Keep it under 350 words. Busy clients skim.',
    '',
    'NEVER use:',
    '- "I came across your job..."',
    '- "I\'d love the opportunity..."',
    '- "With X+ years of experience..."',
    '- "I am confident..."',
    '- Generic technology lists without context.',
    '- Emojis, em dashes, exclamation marks.',
    '',
    proofBlock,
    '',
    'HARD RULES:',
    `- Claim ONLY facts listed in the facts table. Never fabricate experience.`,
    `- Do not claim experience you cannot prove.`,
    `- No banned phrases: ${BANNED_PHRASES.slice(0, 10).join(', ')}.`,
    `- No AI tells: ${AI_TELL_PHRASES.slice(0, 8).join(', ')}.`,
  ].filter(Boolean).join('\n\n')

  const userPrompt = [
    `Write an Upwork proposal for this job:`,
    '',
    jobContext,
    '',
    'Output JSON: { "proposal": "the proposal text", "self_check_passed": boolean, "self_check_note": "why this would/wouldn\'t win the job" }',
  ].join('\n')

  const schema = {
    type: 'object',
    required: ['proposal', 'self_check_passed', 'self_check_note'],
    properties: {
      proposal: { type: 'string' },
      self_check_passed: { type: 'boolean' },
      self_check_note: { type: 'string' },
    },
  } as const

  type ProposalResult = { proposal: string; self_check_passed: boolean; self_check_note: string }

  // Runtime V3 handles provider routing: OpenCode Go → Groq → GPT → LongCat
  let best: ProposalResult | null = null

  try {
    const result = await generate<ProposalResult>({
      task: 'DEEP_WRITING',
      system: systemPrompt,
      user: userPrompt,
      schema: schema as unknown as Record<string, unknown>,
      maxTokens: 1536,
      temperature: 0.6,
    })
    best = result.data
  } catch {
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 })
  }

  const proposal = best.proposal.trim()

  // Sanitize
  const sanitized = sanitizeDraft(proposal, facts)

  return NextResponse.json({
    draft: {
      text: sanitized.text,
      selfCheckPassed: best.self_check_passed,
      selfCheckNote: best.self_check_note,
      matchedProof: matchedProof ? { id: matchedProof.id, projectSummary: matchedProof.projectSummary } : null,
    },
  })
}
