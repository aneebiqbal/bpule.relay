import { NextResponse } from 'next/server'
import { computeScore } from '@/lib/score/rubric'
import type { ExtractedLead, SignalId } from '@/lib/domain/types'
import { createScoutStore } from '@/lib/store'

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const company = typeof body.company === 'string' ? body.company.trim() : ''
  if (!company) {
    return NextResponse.json(
      { error: 'Company is required.' },
      { status: 400 },
    )
  }

  const signalType = body.signalType as SignalId
  if (!signalType || signalType < 1 || signalType > 7) {
    return NextResponse.json(
      { error: 'signalType is required and must be 1 to 7.' },
      { status: 400 },
    )
  }

  const signalEvidence =
    typeof body.signalEvidence === 'string' ? body.signalEvidence.trim() : ''
  if (!signalEvidence) {
    return NextResponse.json(
      { error: 'Signal evidence is required.' },
      { status: 400 },
    )
  }

  const extracted: ExtractedLead = {
    name:
      typeof body.contactName === 'string' && body.contactName.trim()
        ? body.contactName.trim()
        : null,
    title:
      typeof body.contactTitle === 'string' && body.contactTitle.trim()
        ? body.contactTitle.trim()
        : null,
    company,
    url:
      typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null,
    signalType,
    signalEvidence,
    verbatimQuote:
      typeof body.verbatimQuote === 'string' && body.verbatimQuote.trim()
        ? body.verbatimQuote.trim()
        : null,
    tags: Array.isArray(body.tags)
      ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
  }

  const score = computeScore(extracted)

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  const result = await store.createLead({
    company,
    contactName: extracted.name,
    contactTitle: extracted.title,
    url: extracted.url,
    rawInput:
      typeof body.rawInput === 'string' && body.rawInput.trim()
        ? body.rawInput.trim()
        : null,
    signalType,
    signalEvidence,
    verbatimQuote: extracted.verbatimQuote,
    tags: extracted.tags,
  })

  if (result.blocked) {
    return NextResponse.json(
      {
        blocked: true,
        reason: result.reason,
        existingOwnerName: result.existingOwnerName,
      },
      { status: 409 },
    )
  }

  const lead = result.lead!
  await store.updateLeadScore(lead.id, score)

  return NextResponse.json(
    { lead: { ...lead, score: score.total, verdict: score.verdict }, score },
    { status: 201 },
  )
}