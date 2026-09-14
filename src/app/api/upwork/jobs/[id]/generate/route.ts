import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { buildLongcatDraftChain, buildOpenaiDraftChain, pickDraftChain, shouldEscalateToPremium } from '@/lib/ai/routing'
import { structuredJsonChain } from '@/lib/ai/provider'
import { injectStyleCard } from '@/lib/style/inject'
import { signalById } from '@/lib/score/signals'
import { sanitizeDraft } from '@/lib/facts/sanitize'
import { AI_TELL_PHRASES, BANNED_PHRASES } from '@/lib/writing/engine'

export const dynamic = 'force-dynamic'

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

  let body: { profileId?: string; proofId?: string }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

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

  // Proof matching based on job skills
  const tagMatches = await store.matchProofItems(job.requiredSkills ?? [], 8)
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

  // Attempt 1: LongCat
  const chainA = buildLongcatDraftChain()
  let best: ProposalResult | null = null

  if (chainA.length > 0) {
    const resultA = await structuredJsonChain<ProposalResult>(chainA, { system: systemPrompt, user: userPrompt, schema }).then((r) => r.data).catch(() => null)
    if (resultA?.self_check_passed) {
      best = resultA
    } else if (resultA) {
      best = resultA
    }
  }

  // If LongCat passed, return immediately
  if (best?.self_check_passed) {
    const proposal = best.proposal.trim()
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

  // Attempt 2: Groq retry
  const escalation = shouldEscalateToPremium({
    primaryPassed: best?.self_check_passed ?? false,
    primaryScore: best?.self_check_passed ? 8 : 2,
    isHighValue: false,
    malformedOutput: !best,
    attemptCount: 1,
  })

  const fallback = pickDraftChain()
  if (fallback.length > 0 && escalation.shouldEscalate) {
    const resultB = await structuredJsonChain<ProposalResult>(fallback, { system: systemPrompt, user: userPrompt, schema }).then((r) => r.data).catch(() => null)
    if (resultB?.self_check_passed) {
      best = resultB
    } else if (resultB && !best) {
      best = resultB
    }
  }

  if (best?.self_check_passed) {
    const proposal = best.proposal.trim()
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

  // Attempt 3: GPT escalation
  const chainB = buildOpenaiDraftChain()
  if (chainB.length > 0 && escalation.shouldEscalate) {
    const resultC = await structuredJsonChain<ProposalResult>(chainB, { system: systemPrompt, user: userPrompt, schema }).then((r) => r.data).catch(() => null)
    if (resultC) {
      best = resultC
    }
  }

  if (!best) {
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
