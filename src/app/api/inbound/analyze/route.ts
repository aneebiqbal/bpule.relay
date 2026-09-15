import { NextRequest, NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { structuredJsonChain } from '@/lib/ai/provider'
import { pickModelChain } from '@/lib/ai/routing'
import { scanForSecrets } from '@/lib/ai/secrets'
import {
  buildInboundSystemPrompt,
  buildInboundUserPrompt,
  validateInboundInput,
  mapRawToIntelligence,
} from '@/lib/inbound/intelligence'
import type { InboundInput } from '@/lib/domain/types'

export async function POST(req: NextRequest) {
  const store = await createScoutStore().catch(() => null)
  if (!store) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: InboundInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  body.source = body.source ?? 'other'

  const validation = validateInboundInput(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const secretScan = scanForSecrets(body.message)
  if (secretScan.blocked) {
    return NextResponse.json({ error: 'Message contains sensitive credentials. Remove them before analysis.' }, { status: 400 })
  }

  try {
    const [profiles, proofItems] = await Promise.all([
      store.getAssignedProfiles(),
      store.listAllProofItems(),
    ])

    const system = buildInboundSystemPrompt(profiles, proofItems)
    const user = buildInboundUserPrompt(body)
    const chain = pickModelChain('extract')

    const result = await structuredJsonChain<Record<string, unknown>>(chain, {
      system,
      user,
      schema: {
        type: 'object',
        properties: {
          wants: { type: 'string' },
          intent: { type: 'string' },
          fit_score: { type: 'number' },
          fit_relevance: { type: 'string' },
          opportunity_quality: { type: 'string', enum: ['high', 'medium', 'low'] },
          recommended_profile_index: { type: 'number' },
          identity_fit_reason: { type: 'string' },
          matching_skills: { type: 'array', items: { type: 'string' } },
          strongest_proof_indexes: { type: 'array', items: { type: 'number' } },
          missing_info: { type: 'array', items: { type: 'string' } },
          recommended_action: { type: 'string' },
          can_generate_resume: { type: 'boolean' },
          extracted_company: { type: ['string', 'null'] },
          extracted_contact: { type: ['string', 'null'] },
          extracted_title: { type: ['string', 'null'] },
          extracted_url: { type: ['string', 'null'] },
        },
        required: ['wants', 'intent', 'fit_score', 'fit_relevance', 'opportunity_quality', 'recommended_profile_index', 'identity_fit_reason', 'matching_skills', 'strongest_proof_indexes', 'missing_info', 'recommended_action', 'can_generate_resume', 'extracted_company', 'extracted_contact', 'extracted_title', 'extracted_url'],
      },
    })

    const raw = result.data as Record<string, unknown>

    const intelligence = mapRawToIntelligence(
      {
        wants: raw.wants as string,
        intent: raw.intent as string,
        fit_score: raw.fit_score as number,
        fit_relevance: raw.fit_relevance as string,
        opportunity_quality: raw.opportunity_quality as 'high' | 'medium' | 'low',
        recommended_profile_index: raw.recommended_profile_index as number,
        identity_fit_reason: raw.identity_fit_reason as string,
        matching_skills: raw.matching_skills as string[],
        strongest_proof_indexes: raw.strongest_proof_indexes as number[],
        missing_info: raw.missing_info as string[],
        recommended_action: raw.recommended_action as string,
        can_generate_resume: raw.can_generate_resume as boolean,
        extracted_company: raw.extracted_company as string | null,
        extracted_contact: raw.extracted_contact as string | null,
        extracted_title: raw.extracted_title as string | null,
        extracted_url: raw.extracted_url as string | null,
      },
      profiles,
      proofItems,
    )

    return NextResponse.json({
      intelligence,
      extracted: {
        company: intelligence.recommendedIdentity ? (raw.extracted_company as string | null) : null,
        contactName: raw.extracted_contact as string | null,
        contactTitle: raw.extracted_title as string | null,
        url: raw.extracted_url as string | null,
      },
    })
  } catch (err) {
    console.error('[inbound/analyze] failed:', err)
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}
