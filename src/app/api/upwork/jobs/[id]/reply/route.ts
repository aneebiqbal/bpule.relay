import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { generate } from '@/lib/ai/runtime'
import { injectStyleCard } from '@/lib/style/inject'
import { BANNED_PHRASES, AI_TELL_PHRASES } from '@/lib/writing/engine'
import {
  buildSalesGenerationContext,
  formatConversationBlock,
  formatEvidenceBlock,
  formatProfileBlock,
  formatTargetBlock,
} from '@/lib/generation/sales-context'
import {
  filterAssignedProfilesByChannel,
  listAssignedProfiles,
  listAssignedProfilesForRep,
} from '@/lib/profiles/assigned-profiles'

/**
 * POST /api/upwork/jobs/[id]/reply
 * Generate a reply to a client message on Upwork.
 * Body: { clientMessage: string, proposalContext?: string, profileId?: string }
 *
 * The reply is grounded in the same canonical profile evidence as the proposal:
 * the sender profile is the one the cover draft was written for, or an explicit
 * eligible Upwork profile. Without a profile there is no proof to reference.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { clientMessage?: string; proposalContext?: string; profileId?: string; repId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (!body.clientMessage) {
    return NextResponse.json({ error: 'clientMessage is required.' }, { status: 400 })
  }

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const store = await createScoutStore()
  const job = await store.getUpworkJob(id)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

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

  const assigned = actingRepId === authCtx.repId
    ? await listAssignedProfiles()
    : await listAssignedProfilesForRep(authCtx.orgId, actingRepId)
  const upworkProfiles = filterAssignedProfilesByChannel(assigned, 'upwork')

  // The profile the proposal was actually written for is canonical. An explicit
  // profileId must still be one of the acting rep's eligible Upwork profiles.
  const requestedProfileId = typeof body.profileId === 'string' ? body.profileId : null
  const coverSenderProfileId = (job.messages ?? []).find((m) => m.type === 'cover')?.senderProfileId ?? null
  const senderProfile = requestedProfileId
    ? upworkProfiles.find((a) => a.profile.id === requestedProfileId) ?? null
    : upworkProfiles.find((a) => a.profile.id === coverSenderProfileId) ?? upworkProfiles[0] ?? null

  if (requestedProfileId && !senderProfile) {
    return NextResponse.json(
      { error: 'That profile is not assigned to you for Upwork. Select an eligible profile.' },
      { status: 403 },
    )
  }
  if (!senderProfile) {
    return NextResponse.json({ error: 'No Upwork profile is assigned to you.' }, { status: 400 })
  }

  const voiceProfile = await store.getVoiceProfile(senderProfile.profile.id)
  const styleCard = injectStyleCard(voiceProfile?.styleCard)

  const evidence = await store.getProfileEvidence(senderProfile.profile.id)
  const budget = job.budgetMin || job.hourlyRateMin
    ? job.budgetMin
      ? `$${job.budgetMin}–$${job.budgetMax} fixed`
      : `$${job.hourlyRateMin}–$${job.hourlyRateMax}/hr`
    : null
  const generationContext = buildSalesGenerationContext({
    profile: senderProfile.profile,
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
      screeningQuestions: job.screeningQuestions ?? [],
      tags: job.tags ?? [],
    },
    conversation: {
      clientMessage: body.clientMessage,
      priorMessages: (job.messages ?? [])
        .filter((m) => m.sentText)
        .map((m) => ({ direction: m.type === 'reply' ? 'inbound' : 'outbound', text: m.sentText as string, sentAt: m.sentAt })),
      alreadySentClaims: (job.messages ?? [])
        .filter((m) => m.type === 'cover' && m.sentText)
        .map((m) => m.sentText as string)
        .slice(0, 2),
      questionsRequiringResponse: extractQuestions(body.clientMessage),
    },
  })

  const systemPrompt = [
    'You are a senior Upwork freelancer who wins interviews and clients.',
    '',
    styleCard ? `SENDER VOICE (mandatory):\n${styleCard}` : '',
    '',
    '## REPLY STRATEGY',
    '',
    'The client sent you a message on Upwork. Reply to move the deal forward.',
    '',
    '### RULES:',
    '- Be specific to THEIR message — reference what they actually said',
    '- Show you understand their problem',
    '- Be warm, professional, concise (50-150 words max)',
    '- NEVER use first-contact openers ("came across your job", "Building AI...")',
    '- NEVER use placeholders like "%" or "[X]%"',
    '- Reference a past project only when it appears in the RELEVANT PROOF block',
    `- No banned phrases: ${BANNED_PHRASES.slice(0, 8).join(', ')}.`,
    `- No AI tells: ${AI_TELL_PHRASES.slice(0, 8).join(', ')}.`,
    '',
    formatProfileBlock(generationContext),
    '',
    formatEvidenceBlock(generationContext),
    '',
    formatTargetBlock(generationContext),
    '',
    formatConversationBlock(generationContext),
    '',
    body.proposalContext ? `### YOUR ORIGINAL PROPOSAL:\n${body.proposalContext.slice(0, 1200)}` : '',
  ].filter(Boolean).join('\n\n')

  const schema = {
    type: 'object',
    required: ['reply', 'self_check_passed', 'self_check_note'],
    properties: {
      reply: { type: 'string' },
      self_check_passed: { type: 'boolean' },
      self_check_note: { type: 'string' },
    },
  } as const

  try {
    const result = await generate<{ reply: string; self_check_passed: boolean; self_check_note: string }>({
      task: 'FAST_STRUCTURED',
      system: systemPrompt,
      user: 'Write a reply that moves the deal forward. Return JSON: {"reply": "...", "self_check_passed": true/false, "self_check_note": "..."}',
      schema: schema as unknown as Record<string, unknown>,
      maxTokens: 512,
      temperature: 0.6,
      feature: 'reply',
      callSite: 'upwork:reply',
      jobId: id,
    })

    let reply = result.data.reply.trim()

    // Clean placeholders
    reply = reply.replace(/\bby\s*%/g, 'significantly')
    reply = reply.replace(/\b%\s*(increase|reduction|improvement)/g, '$1')
    reply = reply.replace(/\[\s*%\s*]/g, '')
    reply = reply.replace(/\(\s*%\s*\)/g, '')

    // Remove banned phrases
    for (const phrase of BANNED_PHRASES.slice(0, 10)) {
      const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      reply = reply.replace(re, '')
    }

    return NextResponse.json({
      reply: reply.replace(/\s{2,}/g, ' ').trim(),
      selfCheckPassed: result.data.self_check_passed,
      selfCheckNote: result.data.self_check_note,
      profileId: senderProfile.profile.id,
      evidenceUsed: generationContext.rankedProof.map((p) => ({ id: p.id, kind: p.kind, title: p.title, url: p.url })),
    })
  } catch {
    return NextResponse.json({ error: 'Reply generation failed. Please try again.' }, { status: 500 })
  }
}

function extractQuestions(text: string): string[] {
  return (text.match(/[^?\n]+\?/g) ?? []).map((q) => q.trim()).filter((q) => q.length >= 6).slice(0, 3)
}
