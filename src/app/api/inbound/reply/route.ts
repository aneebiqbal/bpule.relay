import { NextRequest, NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { generate } from '@/lib/ai/runtime'
import {
  buildInboundReplyUserPrompt,
  validateInboundReply,
  sanitizeInboundReply,
  INBOUND_REPLY_SYSTEM,
} from '@/lib/inbound/reply'
import type { ProofItem } from '@/lib/domain/types'
import type { InboundReplyInput } from '@/lib/inbound/reply'

export const maxDuration = 60

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

  if (!body.leadId) {
    return NextResponse.json({ error: 'leadId is required.' }, { status: 400 })
  }

  try {
    const lead = await store.getLead(body.leadId)
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }

    const [profile, allProofItems, messages, styleCard] = await Promise.all([
      body.profileId ? store.getProfile(body.profileId) : Promise.resolve(null),
      store.listAllProofItems(),
      store.listMessages(lead.id),
      store.getVoiceProfile().then((vp) => vp?.styleCard?.summary ?? null),
    ])

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
      styleCard,
    }

    const basePrompt = buildInboundReplyUserPrompt(input)

    let text = ''
    let attemptPrompt = basePrompt
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await generate<string>({
        task: 'INTERACTIVE_WRITING',
        system: INBOUND_REPLY_SYSTEM,
        user: attemptPrompt,
        temperature: 0.7,
        maxTokens: 1024,
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
