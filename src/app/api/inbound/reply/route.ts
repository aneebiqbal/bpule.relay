import { NextRequest, NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { streamChatTextChain } from '@/lib/ai/provider'
import { pickDraftChain } from '@/lib/ai/routing'
import {
  buildInboundReplyUserPrompt,
  validateInboundReply,
  sanitizeInboundReply,
  INBOUND_REPLY_SYSTEM,
} from '@/lib/inbound/reply'
import type { ProofItem } from '@/lib/domain/types'
import type { InboundReplyInput } from '@/lib/inbound/reply'

export async function POST(req: NextRequest) {
  const store = await createScoutStore().catch(() => null)
  if (!store) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: {
    leadId: string
    intelligence?: unknown
    profileId?: string | null
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
      intelligence: body.intelligence as InboundReplyInput['intelligence'],
      profile,
      proofItems,
      history: messages.filter((m: { sentText: string | null }) => m.sentText),
      styleCard,
    }

    const userPrompt = buildInboundReplyUserPrompt(input)
    const chain = pickDraftChain()

    let text = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      text = await streamChatTextChain(chain, {
        system: INBOUND_REPLY_SYSTEM,
        user: userPrompt,
        temperature: 0.7,
        onChunk: () => {},
        onStatus: () => {},
      }).then((r) => r.data)

      text = sanitizeInboundReply(text)

      const check = validateInboundReply(text)
      if (check.valid) break

      userPrompt.concat(`\n\nPREVIOUS ATTEMPT REJECTED: ${check.note}\nRewrite without this issue.`)
    }

    const finalCheck = validateInboundReply(text)

    return NextResponse.json({
      text,
      selfCheckPassed: finalCheck.valid,
      selfCheckNote: finalCheck.note || null,
    })
  } catch (err) {
    console.error('[inbound/reply] failed:', err)
    return NextResponse.json({ error: 'Failed to generate reply.' }, { status: 500 })
  }
}
