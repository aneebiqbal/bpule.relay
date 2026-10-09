import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generate } from '@/lib/ai/runtime'
import { injectStyleCard } from '@/lib/style/inject'
import { sanitizeDraft } from '@/lib/facts/sanitize'
import { AI_TELL_PHRASES, BANNED_PHRASES } from '@/lib/writing/engine'
import { rankProfilesForOpportunity, recommendBestProfile } from '@/lib/profile-match'
import type { Profile } from '@/lib/domain/types'

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

  // Profile matching: suggest best profile for this job
  const profileMatches = await rankProfilesForOpportunityForUpwork(job, profiles, store)
  const bestProfileSuggestion = profileMatches[0] ?? null
  const currentProfileMatch = profile?.id
    ? profileMatches.find((p: { profileId: string }) => p.profileId === profile.id) ?? null
    : null

  // Screening questions from the job
  const screeningQuestions = job.screeningQuestions ?? []

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

  const screeningBlock = screeningQuestions.length > 0
    ? `\nSCREENING QUESTION(S) — you MUST answer each one. Include answers naturally in the proposal or at the end:\n${screeningQuestions.map((q: string, i: number) => `  ${i + 1}. ${q}`).join('\n')}\n`
    : ''

  const skillMatchBlock = currentProfileMatch
    ? `\nSKILL MATCH: ${currentProfileMatch.matchScore}% match. Matched: ${currentProfileMatch.matchingCapabilities.slice(0, 5).join(', ') || 'none'}. Missing: ${currentProfileMatch.missingCapabilities.slice(0, 3).join(', ') || 'none'}.\n`
    : ''

  const userPrompt = [
    `Write an Upwork proposal for this job:`,
    '',
    jobContext,
    skillMatchBlock,
    screeningBlock,
    '',
    'Output JSON: { "proposal": "the proposal text", "questionAnswers": [{"question": "...", "answer": "..."}], "self_check_passed": boolean, "self_check_note": "why this would/wouldn\'t win the job" }',
  ].filter(Boolean).join('\n')

  const schema = {
    type: 'object',
    required: ['proposal', 'questionAnswers', 'self_check_passed', 'self_check_note'],
    properties: {
      proposal: { type: 'string' },
      questionAnswers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
          },
          required: ['question', 'answer'],
        },
      },
      self_check_passed: { type: 'boolean' },
      self_check_note: { type: 'string' },
    },
  } as const

  type ProposalResult = {
    proposal: string
    questionAnswers: Array<{ question: string; answer: string }>
    self_check_passed: boolean
    self_check_note: string
  }

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
      questionAnswers: best.questionAnswers ?? [],
      selfCheckPassed: best.self_check_passed,
      selfCheckNote: best.self_check_note,
      matchedProof: matchedProof ? { id: matchedProof.id, projectSummary: matchedProof.projectSummary } : null,
    },
    profileSuggestion: bestProfileSuggestion ? {
      bestProfileId: bestProfileSuggestion.profileId,
      bestProfileName: bestProfileSuggestion.identityName,
      bestProfileScore: bestProfileSuggestion.matchScore,
      currentProfileScore: currentProfileMatch?.matchScore ?? null,
      reason: bestProfileSuggestion.reason,
    } : null,
    screeningQuestions,
  })
}

/**
 * Rank profiles for an Upwork job using the profile-match engine.
 * Fetches profile intelligence data and ranks by skill overlap.
 */
async function rankProfilesForOpportunityForUpwork(
  job: { requiredSkills: string[]; description: string },
  profiles: Profile[],
  store: Awaited<ReturnType<typeof createScoutStore>>,
): Promise<Array<import('@/lib/profile-match').ProfileMatchResult & { profileId: string; identityName: string }>> {
  const results: Array<import('@/lib/profile-match').ProfileMatchResult & { profileId: string; identityName: string }> = []

  for (const profile of profiles) {
    const proofCards = await store.listProofCards(profile.id)
    const headlineSkills = profile.headline?.split(/[,·|]/).map((s: string) => s.trim()).filter(Boolean) ?? []

    const profileData = {
      profileId: profile.id,
      identityName: profile.label,
      skills: headlineSkills,
      technologies: [] as string[],
      expertise: [] as string[],
      industries: [] as string[],
      allowedClaims: [] as string[],
      projects: proofCards.map((pc: import('@/lib/domain/types').ProofCard) => ({
        id: pc.id,
        title: pc.capability,
        description: pc.safeClaim ?? '',
        technologies: pc.tags,
      })),
      reviews: proofCards.filter((pc: import('@/lib/domain/types').ProofCard) => pc.sourceReference).map((pc: import('@/lib/domain/types').ProofCard) => ({
        id: pc.id,
        clientName: pc.sourceReference ?? '',
        rating: 5,
        comment: pc.safeClaim ?? '',
      })),
    }

    const match = rankProfilesForOpportunity(
      {
        opportunityCapabilities: job.requiredSkills ?? [],
        opportunityIndustries: [],
        opportunityType: 'upwork_job',
      },
      [{ ...profileData, identityName: profileData.identityName ?? '' }],
    )

    if (match.length > 0) {
      results.push({ ...match[0], profileId: match[0].profileId, identityName: match[0].identityName })
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}
