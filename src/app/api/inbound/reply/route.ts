import { NextRequest, NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { generate } from '@/lib/ai/runtime'
import {
  buildInboundReplyUserPrompt,
  validateInboundReply,
  sanitizeInboundReply,
  INBOUND_REPLY_SYSTEM,
} from '@/lib/inbound/reply'
import { buildConversationMemory, type ConversationMemory } from '@/lib/ai/copilot/memory'
import { understandConversation, type CopilotUnderstandResult } from '@/lib/ai/copilot'
import { hasProvider } from '@/lib/ai/config'
import type { ProofItem } from '@/lib/domain/types'
import type { InboundReplyInput } from '@/lib/inbound/reply'

export const maxDuration = 60

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const store = await createScoutStore().catch(() => null)
  if (!store) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: {
    leadId: string
    intelligence?: unknown
    profileId?: string | null
    generationMode?: 'standard' | 'premium'
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : ''

  if (!leadId) {
    return NextResponse.json({ error: 'leadId is required.' }, { status: 400 })
  }

  if (!UUID_PATTERN.test(leadId)) {
    return NextResponse.json({ error: 'leadId must be a UUID.' }, { status: 400 })
  }

  try {
    const lead = await store.getLead(leadId)
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }

    const [profile, allProofItems, messages, voiceProfileRow] = await Promise.all([
      body.profileId ? store.getProfile(body.profileId) : Promise.resolve(null),
      store.listAllProofItems(),
      store.listMessages(lead.id),
      store.getVoiceProfile(body.profileId ?? undefined),
    ])

    // Inject the full calibrated voice card so replies match outbound voice
    const styleCardSummary = voiceProfileRow?.styleCard?.summary ?? null
    const styleCardVoice = voiceProfileRow?.styleCard
      ? [
          voiceProfileRow.styleCard.contractions ? `Contractions: ${voiceProfileRow.styleCard.contractions}` : '',
          voiceProfileRow.styleCard.formality ? `Formality: ${voiceProfileRow.styleCard.formality}/5` : '',
          voiceProfileRow.styleCard.sentence_length ? `Sentence rhythm: ${voiceProfileRow.styleCard.sentence_length}` : '',
          voiceProfileRow.styleCard.openers ? `Opener style: ${voiceProfileRow.styleCard.openers}` : '',
          voiceProfileRow.styleCard.greeting ? `Greeting: ${voiceProfileRow.styleCard.greeting}` : '',
          voiceProfileRow.styleCard.sign_off ? `Sign-off: ${voiceProfileRow.styleCard.sign_off}` : '',
          voiceProfileRow.styleCard.never_words.length ? `Never use: ${voiceProfileRow.styleCard.never_words.join(', ')}` : '',
        ].filter(Boolean).join('\n')
      : null

    const proofItems = allProofItems
      .filter((p: ProofItem) => !body.profileId || p.profileId === body.profileId)
      .slice(0, 3)

    const input: InboundReplyInput = {
      lead,
      intelligence: body.intelligence && typeof body.intelligence === 'object'
        ? (body.intelligence as InboundReplyInput['intelligence'])
        : null,
      profile,
      proofItems,
      history: messages.filter((m: { sentText: string | null }) => m.sentText),
      styleCard: styleCardSummary,
    }

    // Prepend calibrated voice instructions to the reply prompt
    const voiceBlock = styleCardVoice
      ? `\n## Your calibrated voice (follow this exactly)\n${styleCardVoice}\n`
      : ''

    const basePrompt = buildInboundReplyUserPrompt(input) + voiceBlock

    // Copilot: AI understands the inbound message when a provider is available.
    // Deterministic analysis remains the base; AI enhances interpretation.
    let copilotUnderstanding: CopilotUnderstandResult | null = null
    const inboundMsg = lead.inboundMessage?.trim()
    if (hasProvider() && inboundMsg) {
      try {
        const memory = buildConversationMemory({
          stage: lead.status ?? 'inbound',
          knowledge: null,
          priorMessages: (input.history ?? []).filter((m) => m.sentText),
        })
        const { result } = await understandConversation({
          incomingMessage: inboundMsg,
          memory,
          contactName: lead.contactName,
          leadCompany: lead.company,
        })
        copilotUnderstanding = result
      } catch {
        // Copilot understanding is enhancement only — fall back to deterministic
      }
    }

    const aiContextBlock = copilotUnderstanding
      ? [
          '',
          '## AI Interpretation (use to refine understanding — do not expose to user)',
          `Intent: ${copilotUnderstanding.intent}`,
          `Sentiment: ${copilotUnderstanding.sentiment} (confidence: ${copilotUnderstanding.confidence})`,
          `Objective: ${copilotUnderstanding.objective}`,
          copilotUnderstanding.questions.length ? `Questions detected: ${copilotUnderstanding.questions.join(' | ')}` : '',
          copilotUnderstanding.objection ? `Objection: ${copilotUnderstanding.objection}` : '',
          copilotUnderstanding.commercial_signal ? 'Commercial signal detected' : '',
          copilotUnderstanding.missing_context.length ? `Missing context: ${copilotUnderstanding.missing_context.join(' | ')}` : '',
        ].filter(Boolean).join('\n')
      : ''

    let text = ''
    let attemptPrompt = basePrompt + aiContextBlock
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await generate<string>({
        task: 'INTERACTIVE_WRITING',
        system: INBOUND_REPLY_SYSTEM,
        user: attemptPrompt,
        temperature: 0.7,
        maxTokens: 1024,
        promptVersion: 'inbound-reply-v1',
        feature: 'inbound_reply',
      })
      text = result.data

      text = sanitizeInboundReply(text)

      const check = validateInboundReply(text, input)
      if (check.valid) break

      attemptPrompt = `${basePrompt}\n\nPREVIOUS ATTEMPT REJECTED: ${check.note}\nRewrite without this issue. Keep the reply grounded in selected identity/proof and answer any direct question first.`
    }

    const finalCheck = validateInboundReply(text, input)

    if (!finalCheck.valid) {
      return NextResponse.json(
        {
          error: 'Reply failed quality gate.',
          selfCheckPassed: false,
          selfCheckNote: finalCheck.note,
        },
        { status: 422 },
      )
    }

    return NextResponse.json({
      text,
      selfCheckPassed: true,
      selfCheckNote: null,
    })
  } catch (err) {
    console.error('[inbound/reply] failed:', err)
    return NextResponse.json({ error: 'Failed to generate reply.' }, { status: 500 })
  }
}
