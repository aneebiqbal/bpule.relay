import { NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/ai/config'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { generate } from '@/lib/ai/runtime'
import { injectStyleCard } from '@/lib/style/inject'
import { sanitizeDraft } from '@/lib/facts/sanitize'
import { evaluateCoverLetter, evaluateScreeningAnswers, hasGenericShape, COVER_LETTER_WORDS } from '@/lib/upwork/application-gate'
import { AI_TELL_PHRASES, BANNED_PHRASES } from '@/lib/writing/engine'
import { checkHumanization, rewriteToHumanize } from '@/lib/ai/humanization'
import { rankProfilesForOpportunity, recommendBestProfile } from '@/lib/profile-match'
import {
  assignedProfileName,
  filterAssignedProfilesByChannel,
  listAssignedProfiles,
  listAssignedProfilesForRep,
} from '@/lib/profiles/assigned-profiles'
import { getAuthContext } from '@/lib/auth/organization'
import type { Profile } from '@/lib/domain/types'
import {
  buildSalesGenerationContext,
  formatEvidenceBlock,
  formatProfileBlock,
  formatTargetBlock,
  findUnsupportedClaims,
  toClaimableText,
  toAllowedNumbers,
} from '@/lib/generation/sales-context'

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
  // Demo-mode ids are not UUIDs; the guard protects the real store only.
  if ((!UUID_PATTERN.test(id)) && !isDemoMode()) {
    return NextResponse.json({ error: 'Job id must be a UUID.' }, { status: 400 })
  }

  let body: { profileId?: string; proofId?: string; generationMode?: 'standard' | 'premium'; repId?: string }
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

  // Only Upwork-capable profiles assigned to this rep. An owned-but-unassigned
  // LinkedIn profile must never appear here, and an assigned Upwork identity
  // whose profile someone else owns must still be eligible.
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Admin/owner on-behalf: the acting rep must belong to the caller's org.
  // A client-supplied repId is never trusted on its own.
  const requestedRepId = typeof body.repId === 'string' ? body.repId : null
  const isAdmin = Boolean(authCtx.isAdmin || authCtx.isOwner)
  let actingRepId = user.rep.id
  if (requestedRepId && requestedRepId !== user.rep.id) {
    if (!isAdmin) {
      return NextResponse.json({ error: 'Not authorized to generate for another rep.' }, { status: 403 })
    }
    const { data: repRow } = await store
      .getSupabaseClient()
      .from('reps')
      .select('id')
      .eq('id', requestedRepId)
      .eq('organization_id', authCtx.orgId)
      .maybeSingle()
    if (!repRow) {
      return NextResponse.json({ error: 'That rep is not in your organization.' }, { status: 403 })
    }
    actingRepId = repRow.id as string
  }

  const [assignedProfiles, facts, plays] = await Promise.all([
    actingRepId === user.rep.id
      ? listAssignedProfiles()
      : listAssignedProfilesForRep(authCtx.orgId, actingRepId),
    store.listFacts(),
    store.listPlays(),
  ])
  const upworkProfiles = filterAssignedProfilesByChannel(assignedProfiles, 'upwork')
  const profiles = upworkProfiles.map((a) => a.profile)

  // Never trust a client-selected profile: it must be one of the eligible
  // Upwork-capable profiles assigned to the acting rep. An ineligible id is
  // rejected, not silently replaced — a silent fallback would generate in a
  // profile the rep never chose and attribute it to them.
  const requestedProfileId = typeof body.profileId === 'string' ? body.profileId : null
  const profile = requestedProfileId
    ? profiles.find((p) => p.id === requestedProfileId) ?? null
    : profiles[0] ?? null

  if (requestedProfileId && !profile) {
    return NextResponse.json(
      { error: 'That profile is not assigned to you for Upwork. Select an eligible profile.' },
      { status: 403 },
    )
  }
  if (!profile) {
    return NextResponse.json({ error: 'No Upwork profile is assigned to you.' }, { status: 400 })
  }

  if (process.env.RELAY_PROFILE_DEBUG === '1') {
    console.info('[upwork/generate] eligibility', {
      actingRepId,
      orgId: authCtx.orgId,
      channel: 'upwork',
      eligibleProfileCount: profiles.length,
      eligibleIdentityCount: upworkProfiles.reduce((n, a) => n + a.assignedIdentityIds.length, 0),
      profileId: profile.id,
    })
  }

  const voiceProfile = await store.getVoiceProfile()
  const styleCard = injectStyleCard(voiceProfile?.styleCard)

  // Canonical profile evidence: verified proof cards, portfolio projects, role
  // history, reviews and approved claims. This is the only proof the proposal
  // may reference — never a second, prompt-local copy of profile facts.
  const evidence = await store.getProfileEvidence(profile.id)
  const budget = job.budgetMin || job.hourlyRateMin
    ? job.budgetMin
      ? `$${job.budgetMin}–$${job.budgetMax} fixed`
      : `$${job.hourlyRateMin}–$${job.hourlyRateMax}/hr`
    : null
  const screeningQuestions = job.screeningQuestions ?? []
  const generationContext = buildSalesGenerationContext({
    profile,
    evidence,
    voice: voiceProfile?.styleCard ?? null,
    channel: 'upwork',
    target: {
      channel: 'upwork',
      title: job.title,
      description: job.description,
      requiredSkills: job.requiredSkills ?? [],
      budget,
      timeline: job.duration ?? job.weeklyHours ?? null,
      screeningQuestions,
      applicationRequirements: job.applicationRequirements ?? [],
      tags: job.tags ?? [],
    },
    conversation: {
      priorMessages: (job.messages ?? [])
        .filter((m) => m.sentText)
        .map((m) => ({ direction: m.type === 'reply' ? 'inbound' : 'outbound', text: m.sentText as string, sentAt: m.sentAt })),
      alreadySentClaims: (job.messages ?? [])
        .filter((m) => m.type === 'cover' && m.sentText)
        .map((m) => m.sentText as string)
        .slice(0, 2),
    },
  })

  // An explicit proofId still wins, but only when it is real canonical proof.
  if (body.proofId) {
    const card = evidence.proofCards.find((c) => c.id === body.proofId)
    const item = evidence.proofItems.find((p) => p.id === body.proofId)
    const explicit = generationContext.rankedProof.find((p) => p.id === body.proofId)
      ?? (card
        ? {
            id: card.id,
            kind: 'proof_card' as const,
            title: card.capability,
            claim: card.safeClaim,
            url: /^https?:\/\/[^\s]+$/i.test(card.sourceReference ?? '') ? card.sourceReference!.trim() : null,
            technologies: card.tags,
            strength: card.strength,
            verified: card.verified,
            relevanceScore: 0,
            matchingTags: [],
          }
        : item
          ? {
              id: item.id,
              kind: 'proof_item' as const,
              title: item.projectSummary.split('.')[0] ?? item.projectSummary,
              claim: item.projectSummary,
              url: null,
              technologies: item.tags,
              strength: item.reviewQuote ? 'strong' as const : 'moderate' as const,
              verified: Boolean(item.permissionOnFile),
              relevanceScore: 0,
              matchingTags: [],
            }
          : null)
    if (explicit) {
      generationContext.rankedProof = [
        explicit,
        ...generationContext.rankedProof.filter((p) => p.id !== explicit.id),
      ]
    }
  }
  const matchedProof = generationContext.rankedProof[0] ?? null

  // Profile matching: suggest best profile for this job
  const profileMatches = await rankProfilesForOpportunityForUpwork(job, profiles, store)
  const bestProfileSuggestion = profileMatches[0] ?? null
  const currentProfileMatch = profile?.id
    ? profileMatches.find((p: { profileId: string }) => p.profileId === profile.id) ?? null
    : null

  const profileBlock = formatProfileBlock(generationContext)
  const evidenceBlock = formatEvidenceBlock(generationContext)
  const targetBlock = formatTargetBlock(generationContext)

  // Length follows the job, not a fixed band: a two-line bug fix and a complex
  // architecture role should not read the same length.
  const complexity = [
    (job.description ?? '').length > 1200,
    (job.requiredSkills ?? []).length > 6,
    screeningQuestions.length > 2,
    (job.applicationRequirements ?? []).length > 2,
  ].filter(Boolean).length
  const wordBand: [number, number] = complexity >= 2 ? [120, 220] : complexity === 1 ? [90, 180] : [60, 120]

  const systemPrompt = [
    'You are a senior Upwork proposal strategist. The proposal is copy-pasted by a human; you never send anything yourself.',
    '',
    styleCard ? `SENDER VOICE (mandatory):\n${styleCard}` : '',
    '',
    '## UPWORK PROPOSAL STRATEGY',
    '',
    'Busy clients skim 50+ proposals. Yours must stand out in the first 2 lines.',
    '',
    '### CRITICAL: REFERENCE THEIR SPECIFIC JOB',
    '- You MUST reference at least 2 specific details from the job description (project type, tech, problem, client need)',
    '- Use their EXACT terminology — if they say "Replit", say "Replit"',
    '- Mention their specific project name or core need in the hook',
    '',
    '### STRUCTURE (choose what fits this job — never force a template):',
    'Pick the shape that answers THIS job best. Natural options:',
    '- problem recognition → direct relevant proof → short approach',
    '- a specific technical observation → relevant experience → a useful question',
    '- proof first → how you would handle the issue',
    '- a short direct answer → relevant proof → close',
    'A small bug fix may be two or three sentences. A complex architecture role may',
    'carry a short plan. Do not pad to a fixed number of paragraphs.',

    '### OPENING (the first two sentences decide everything):',
    '- Do NOT restate the job title, the client, or their whole stack.',
    '- Never open with "I came across...", "Hi, I\'m...", "I have X+ years...",',
    '  "I understand you\'re looking for...", "Your app..." or "Your project...".',
    '- Prove you read the job: a direct experience, a specific technical observation,',
    '  a problem recognition, a proof-first line, a short question, or an outcome.',
    '- Vary the opening structure across proposals — never the same grammatical',
    '  opening every time.',
    '- Reference 1-3 concrete job signals (their stack, their problem, their scale)',
    '  in your own words. Never quote the job description back at them.',

    '### PLAN (optional):',
    '- Include a plan only when the client has a debugging, migration or delivery',
    '  problem. Do not invent a timeline ("In the first three days...") unless the',
    '  job asks for one.',

    '### QUESTION (optional):',
    '- Ask one only if it reveals a real unknown, starts a technical conversation,',
    '  or changes the implementation. Otherwise end after the useful point.',
    '- Never ask "Would you like to discuss?" or "Let\'s connect."',

    '### CLOSING:',
    '- Do not add a formal closing unless it is natural. "Looking forward to',
    '  hearing from you", "I\'d love to discuss" and "Let\'s connect" are not',
    '  required — the proposal is often stronger without them.',
    '',
    '### SCREENING QUESTIONS:',
    '- The proposal body must NOT contain the screening answers. Upwork shows them in separate fields.',
    '- Return each answer only in the questionAnswers array, answering that exact question.',
    '- Use real examples from the RELEVANT PROOF block, never generic statements',
    '- Keep answers 2-4 sentences each',
    '- If asked about availability/hours, be explicit',
    '- If asked about approach, give a concrete methodology',
    '',
    '### EXAMPLE SHAPE (illustrative only — never copy these words or facts):',
    '"I\'ve spent recent years on exactly this kind of integration work. At one',
    'previous client I debugged the callback and token-refresh path across several',
    'identity providers, so the provider-specific edge cases are familiar territory.',
    'I\'d start by tracing the callback flow for each provider, then look at',
    'retries and session state before changing anything. Which provider is failing',
    'most often right now?"',
    'It works because it names the exact problem, cites one real project, gives a',
    'concrete first step and asks one earned question — no generic marketing.',
    '',

    '### SELF-CHECK (rate before outputting):',
    '- Does the opening prove I read their specific job — without restating it?',
    '- Is the proof the strongest relevant evidence, not the most metadata?',
    '- Did I avoid all banned phrases and AI tells?',
    '- Is any question earned? Is any plan useful here?',
    '- Would a busy client stop scrolling and read this?',
    '',
    `### LENGTH: aim for ${wordBand[0]}-${wordBand[1]} words. Short wins on Upwork.`,
    '- Simple jobs stay short. Complex roles go longer only when the extra detail is useful.',
    '- Never a wall of text.',
    '- Write like a human consultant, not a cover letter. Conversational, direct.',
    '- Reference your actual past projects/products by name only when they appear in the RELEVANT PROOF block.',
    '',
    '### METRICS RULE:',
    '- ONLY include specific numbers/metrics that come from the RELEVANT PROOF block or the profile facts',
    '- NEVER invent a price, rate, budget or timeline. If a screening question asks for one, say it depends on scope and the client\'s review process — no specific number.',
    '- NEVER write "by %", "by [X]%", or placeholder metrics',
    "- If you don't have a specific metric, describe the outcome qualitatively instead",
    '- Example: "improved deployment speed" (NOT "improved deployment efficiency by %")',
    '',
    '### NO GENERIC CLAIMS:',
    '- Never write "I\'ve worked extensively...", "I understand the intricacies...",',
    '  "seamless", "robust", "cutting-edge", "leverage", "streamline",',
    '  "One of my recent projects involved...", "I am eager to...",',
    '  "I\'m well-equipped...", "ensures...", "scalable app/solution/platform".',
    '- Every sentence must carry a specific, checkable detail: a technology, a',
    '  project name from the proof block, a number, or the client\'s own problem.',
    '- If a sentence cannot be supported by the proof block or the job, delete it.',
    '- Do NOT add a sign-off or your name; the client already knows who you are.',

    '### NEVER USE:',
    '- "I came across your job posting..."',
    '- "I\'d love the opportunity..."',
    '- "With X+ years of experience..."',
    '- "I am confident that..."',
    '- "As you can see from my profile..."',
    '- Generic technology lists without context',
    '- Emojis, em dashes (!!!), exclamation marks',
    '- Any phrase that could apply to any job',
    '- "Building AI...", "Building [product]...", "Creating AI..." — these are generic first-contact openers that ignore the specific prospect',
    '- Placeholder metrics like "%", "[X]%", "by %" — if you dont have a real number, describe qualitatively',
    '',
    profileBlock,
    '',
    evidenceBlock,
    '',
    '### HARD RULES:',
    `- Claim ONLY facts from the SENDER PROFILE and RELEVANT PROOF blocks. Never fabricate experience, projects, clients, metrics or links.`,
    `- If a required skill is missing from the profile, acknowledge it honestly and explain how you'd ramp up.`,
    `- No banned phrases: ${BANNED_PHRASES.slice(0, 12).join(', ')}.`,
    `- No AI tells: ${AI_TELL_PHRASES.slice(0, 10).join(', ')}.`,
  ].filter(Boolean).join('\n\n')

  const screeningBlock = screeningQuestions.length > 0
    ? `\nSCREENING QUESTION(S) — answer each one in the questionAnswers array only. Do NOT put these answers in the proposal body:\n${screeningQuestions.map((q: string, i: number) => `  ${i + 1}. ${q}`).join('\n')}\n`
    : ''

  const skillMatchBlock = currentProfileMatch
    ? `\nSKILL MATCH: ${currentProfileMatch.matchScore}% match. Matched: ${currentProfileMatch.matchingCapabilities.slice(0, 5).join(', ') || 'none'}. Missing: ${currentProfileMatch.missingCapabilities.slice(0, 3).join(', ') || 'none'}.\n`
    : ''

  const userPrompt = [
    `Write a world-class Upwork proposal for this job. Make it impossible to ignore.`,
    '',
    targetBlock,
    '',
    skillMatchBlock,
    screeningBlock,
    '',
    '## OUTPUT FORMAT',
    'Return JSON:',
    '{',
    '  "proposal": "the proposal text only — hook, proof, plan, question. No screening answers here.",',
    '  "questionAnswers": [{"question": "the exact screening question", "answer": "a direct answer grounded in the proof"}]',
    '  "self_check_passed": boolean,',
    '  "self_check_note": "specific reasons this proposal would/wouldn\'t win — be critical",',
    '  "quality_score": 1-10 — rate your own proposal on: hook specificity, proof relevance, plan actionability, question quality',
    '}',
  ].filter(Boolean).join('\n')

  const schema = {
    type: 'object',
    required: ['proposal', 'questionAnswers', 'self_check_passed', 'self_check_note', 'quality_score'],
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
      quality_score: { type: 'number', minimum: 1, maximum: 10 },
    },
  } as const

  type ProposalResult = {
    proposal: string
    questionAnswers: Array<{ question: string; answer: string }>
    self_check_passed: boolean
    self_check_note: string
    quality_score: number
  }

  // Premium adds reasoning depth and an opening-selection pass. No client-history
  // source is wired, so no "unknown" block is emitted — an unknown value must
  // never reach the prompt.
  const premiumBrief = generationMode === 'premium'
    ? `\n## PREMIUM MODE\n- Reason about the client's underlying problem before writing, not just the stated requirements.\n- Choose the strongest evidence for THIS job, not the item with the most metadata.\n- Draft two candidate openings, keep the stronger one, delete the other.\n- Use the sender's canonical voice; do not flatten it toward a house style.\n`
    : ''

  // Runtime V3 handles provider routing: OpenCode Go → Groq → GPT → LongCat
  let best: ProposalResult | null = null

  try {
    const result = await generate<ProposalResult>({
      task: 'DEEP_WRITING',
      system: systemPrompt + premiumBrief,
      user: userPrompt,
      schema: schema as unknown as Record<string, unknown>,
      maxTokens: generationMode === 'premium' ? 2048 : 1536,
      temperature: generationMode === 'premium' ? 0.5 : 0.6,
      ...(generationMode === 'premium' ? { tier: 'sol' as const } : {}),
      feature: 'upwork_proposal',
      callSite: screeningQuestions.length > 0 ? 'upwork:proposal+screening_answers' : 'upwork:proposal',
      jobId: id,
    })
    best = result.data
  } catch {
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 })
  }

  let proposal = best.proposal.trim()

  // Fix placeholder metrics: "by %", "[X]%", etc.
  proposal = proposal.replace(/\bby\s*%/g, 'significantly')
  proposal = proposal.replace(/\b%\s*(increase|reduction|improvement|faster|better|decrease)/g, 'substantially')
  proposal = proposal.replace(/\bby\s*\[?\w*\]?\s*%/g, 'substantially')
  proposal = proposal.replace(/\[\s*%\s*]/g, '')
  proposal = proposal.replace(/\(\s*%\s*\)/g, '')
  proposal = proposal.replace(/%\s*during/g, 'during')
  proposal = proposal.replace(/(\w)\s+%\s/g, '$1 — ')
  proposal = proposal.replace(/\s*%\s*$/gm, '')

  // Remove lines that are just placeholders
  proposal = proposal.split('\n').filter(line => {
    const t = line.trim()
    return t.length > 0 && !/^[\s%[\]()]*$/.test(t) && t !== '%'
  }).join('\n')

  // Remove banned phrases
  for (const phrase of BANNED_PHRASES.slice(0, 15)) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    proposal = proposal.replace(re, '')
  }

  // Collapse runs of spaces/tabs but keep paragraph breaks.
  proposal = proposal.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

  // Sanitize against facts table
  const sanitized = sanitizeDraft(proposal, facts)

  // Humanization pass (§23): only when the draft shows a structural tell.
  // It may change phrasing, structure, rhythm and length — never facts.
  const humanization = checkHumanization(sanitized.text)
  const needsHumanize = !humanization.passed || hasGenericShape(sanitized.text)
  const humanized = needsHumanize
    ? { ...sanitized, text: rewriteToHumanize(sanitized.text, humanization.flaggedTells) }
    : sanitized

  // Deterministic quality gate (the model's self-check is advisory only).
  const profileCtx = {
    claimableText: [...toClaimableText(generationContext), ...facts.map((f) => `${f.label} ${f.value}`)],
    proof: generationContext.rankedProof.map((p) => `${p.title} ${p.claim}`),
    allowedNumbers: [...toAllowedNumbers(generationContext), ...facts.flatMap((f) => (`${f.value}`.match(/\d[\d,.]*\s*(?:%|k|x|\+)?/gi) ?? []).map((n) => n.replace(/\s+/g, '').toLowerCase()))],
  }
  const jobCtx = { title: job.title, description: job.description, skills: job.requiredSkills ?? [], screeningQuestions }
  const letterGate = evaluateCoverLetter(humanized.text, jobCtx, profileCtx, wordBand)
  const answersGate = evaluateScreeningAnswers(best.questionAnswers ?? [], jobCtx, profileCtx, letterGate.text)
  // Unsupported claims are checked in the proposal AND in every screening
  // answer — an invented price or timeline in an answer is still an invention.
  // The claim gate runs again after humanization: a rewrite may not introduce
  // a fact the profile cannot support.
  const unsupportedClaims = [
    ...findUnsupportedClaims(letterGate.text, generationContext),
    ...(best.questionAnswers ?? []).flatMap((answer) =>
      findUnsupportedClaims(answer.answer, generationContext).map((claim) => `[Screening] ${claim}`),
    ),
  ]
  const blockers = [
    ...letterGate.issues.filter((issue) => issue.severity === 'block').map((issue) => issue.message),
    ...answersGate.issues.filter((issue) => issue.severity === 'block').map((issue) => issue.message),
    ...unsupportedClaims,
  ]
  // Coarse, actionable readiness only — never a 0-100 score for the rep.
  // Substantive warnings also mean "needs review" — a proposal that reads as
  // template output is not sendable, even when no claim is unsafe.
  const reviewWarnings = [
    ...letterGate.issues
      .filter((issue) => issue.severity === 'warn' && ['NO_PROOF', 'GENERIC_LANGUAGE', 'FORMAL_SIGNOFF', 'PARROTS_JOB', 'TOO_MANY_QUESTIONS'].includes(issue.code))
      .map((issue) => issue.message),
    ...answersGate.issues.filter((issue) => issue.severity === 'warn').map((issue) => issue.message),
  ]
  const readiness = {
    status: blockers.length > 0 || reviewWarnings.length > 0 ? 'needs_review' : 'ready',
    reasons: [...blockers, ...reviewWarnings].slice(0, 6),
  }

  return NextResponse.json({
    draft: {
      text: letterGate.text,
      questionAnswers: answersGate.answers.map((a) => ({ question: a.question, answer: a.answer })),
      selfCheckPassed: best.self_check_passed,
      selfCheckNote: best.self_check_note,
      readiness,
      // The job signals the proposal could legitimately reference — shown so
      // the rep can see what the generator had to work with.
      jobSignals: [...new Set([...(job.requiredSkills ?? []), ...(job.tags ?? [])].filter(Boolean))].slice(0, 8),
      matchedProof: matchedProof ? { id: matchedProof.id, projectSummary: `${matchedProof.title}: ${matchedProof.claim}` } : null,
      // Sentences that claim delivery the profile cannot support. The rep must
      // edit these before sending; they are surfaced, not silently shipped.
      unsupportedClaims,
      // The canonical proof actually available to the generator, so the rep
      // can see what the proposal could and could not cite.
      evidenceUsed: generationContext.rankedProof.map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        url: p.url,
      })),
      // Canonical links only — never an invented portfolio or case-study URL.
      attachmentsOrLinks: [
        ...(generationContext.profile.profileUrl
          ? [{ id: `profile:${generationContext.profile.id}`, title: 'Profile', url: generationContext.profile.profileUrl }]
          : []),
        ...generationContext.rankedProof
          .filter((p) => p.url)
          .map((p) => ({ id: p.id, title: p.title, url: p.url as string })),
      ],
    },
    generationMode,
    // The profile actually used, so the client can prove
    // displayed == generated == persisted instead of assuming it.
    profileId: profile.id,
    eligibleProfiles: upworkProfiles.map((a) => ({
      profileId: a.profile.id,
      name: assignedProfileName(a),
      channel: 'upwork' as const,
    })),
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
