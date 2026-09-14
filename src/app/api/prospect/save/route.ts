import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { computeScore } from '@/lib/score/rubric'
import type { SignalId, ExtractedLead, RoleCategory, MarketRegion } from '@/lib/domain/types'
import { classifyRoleFromTitle, mapLocationToRegion } from '@/lib/leads/targeting'

/**
 * Save Prospect as Lead
 *
 * Converts an ephemeral prospect check into a persisted lead.
 * Reuses already-extracted data — no re-extraction.
 *
 * Expected body: the extracted prospect data + prospect score + connection note + sender.
 */

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const company = typeof body.company === 'string' ? body.company.trim() : ''
  if (!company) {
    return NextResponse.json({ error: 'Company is required.' }, { status: 400 })
  }

  const signalType = body.signalType as SignalId
  if (!signalType || signalType < 1 || signalType > 7) {
    return NextResponse.json({ error: 'signalType is required and must be 1 to 7.' }, { status: 400 })
  }

  const signalEvidence = typeof body.signalEvidence === 'string' ? body.signalEvidence.trim() : ''
  if (!signalEvidence) {
    return NextResponse.json({ error: 'Signal evidence is required.' }, { status: 400 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  const rulebook = await store.getRulebook()
  if (!rulebook) {
    return NextResponse.json({ error: 'Organization rulebook not found.' }, { status: 500 })
  }

  // Check for duplicate by LinkedIn URL or company name
  const linkedinUrl = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null
  const senderProfileId = typeof body.senderProfileId === 'string' ? body.senderProfileId : null
  const connectionNote = typeof body.connectionNote === 'string' ? body.connectionNote.trim() : null
  const prospectScore = typeof body.prospectScore === 'number' ? body.prospectScore : null
  const prospectDimensions = body.prospectDimensions && Array.isArray(body.prospectDimensions)
    ? body.prospectDimensions
    : null

  const extracted: ExtractedLead = {
    name: typeof body.contactName === 'string' && body.contactName.trim() ? body.contactName.trim() : null,
    title: typeof body.contactTitle === 'string' && body.contactTitle.trim() ? body.contactTitle.trim() : null,
    titleRaw: typeof body.titleRaw === 'string' && body.titleRaw.trim()
      ? body.titleRaw.trim()
      : typeof body.contactTitle === 'string' && body.contactTitle.trim()
        ? body.contactTitle.trim()
        : null,
    company,
    url: linkedinUrl,
    locationRaw: typeof body.locationRaw === 'string' && body.locationRaw.trim() ? body.locationRaw.trim() : null,
    aboutSummary: typeof body.aboutSummary === 'string' && body.aboutSummary.trim() ? body.aboutSummary.trim() : null,
    experienceSummary: typeof body.experienceSummary === 'string' && body.experienceSummary.trim() ? body.experienceSummary.trim() : null,
    recentPosts: Array.isArray(body.recentPosts)
      ? (body.recentPosts as Array<{ paraphrase?: unknown; verbatimQuote?: unknown }>)
          .filter((p) => typeof p?.paraphrase === 'string')
          .slice(0, 3)
          .map((p) => ({
            paraphrase: String(p.paraphrase),
            verbatimQuote: typeof p.verbatimQuote === 'string' && p.verbatimQuote.trim() ? p.verbatimQuote.trim() : null,
          }))
      : [],
    roleCategory: typeof body.roleCategory === 'string' && body.roleCategory.trim()
      ? (body.roleCategory as RoleCategory)
      : classifyRoleFromTitle(typeof body.contactTitle === 'string' ? body.contactTitle : null),
    marketRegion: typeof body.marketRegion === 'string' && body.marketRegion.trim()
      ? (body.marketRegion as MarketRegion)
      : mapLocationToRegion(typeof body.locationRaw === 'string' ? body.locationRaw : null),
    signalType,
    signalEvidence,
    extractionConfidence: typeof body.extractionConfidence === 'number'
      ? Math.max(0, Math.min(100, Math.round(body.extractionConfidence)))
      : 50,
    confidenceNotes: Array.isArray(body.confidenceNotes)
      ? (body.confidenceNotes as unknown[]).filter((n): n is string => typeof n === 'string' && n.trim().length > 0).slice(0, 8)
      : [],
    verbatimQuote: typeof body.verbatimQuote === 'string' && body.verbatimQuote.trim() ? body.verbatimQuote.trim() : null,
    tags: Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
  }

  const score = computeScore(extracted, rulebook)

  const result = await store.createLead({
    company,
    contactName: extracted.name,
    contactTitle: extracted.title,
    url: linkedinUrl,
    rawInput: typeof body.rawInput === 'string' && body.rawInput.trim() ? body.rawInput.trim() : null,
    signalType,
    signalEvidence,
    verbatimQuote: extracted.verbatimQuote,
    tags: extracted.tags,
    titleRaw: extracted.titleRaw ?? extracted.title,
    locationRaw: extracted.locationRaw ?? null,
    roleCategory: extracted.roleCategory ?? classifyRoleFromTitle(extracted.title),
    marketRegion: extracted.marketRegion ?? mapLocationToRegion(extracted.locationRaw ?? null),
    extractionConfidence: extracted.extractionConfidence ?? 50,
    extractionProfile: {
      aboutSummary: extracted.aboutSummary ?? null,
      experienceSummary: extracted.experienceSummary ?? null,
      recentPosts: extracted.recentPosts ?? [],
      confidenceNotes: extracted.confidenceNotes ?? [],
      // Store prospect intelligence for calibration
      prospectScore,
      prospectDimensions,
      connectionNote,
      source: 'prospect_check',
    },
  })

  if (result.blocked) {
    // Check if the existing lead has the same LinkedIn URL — offer "open existing"
    const existingLead = result.lead
    if (existingLead) {
      return NextResponse.json(
        {
          blocked: true,
          duplicate: true,
          reason: result.reason,
          existingOwnerName: result.existingOwnerName,
          existingLeadId: existingLead.id,
          existingLeadCompany: existingLead.company,
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { blocked: true, reason: result.reason, existingOwnerName: result.existingOwnerName },
      { status: 409 },
    )
  }

  const lead = result.lead!
  await store.updateLeadScore(lead.id, score)

  // Save the connection note as a draft message
  if (connectionNote) {
    try {
      await store.saveDraft({
        leadId: lead.id,
        type: 'connection',
        draftText: connectionNote,
        modelUsed: 'prospect-check',
      })
    } catch {
      // Non-fatal: note persistence must not break lead creation
    }
  }

  // Persist sender profile
  if (senderProfileId) {
    try {
      await store.updateLeadSenderProfile(lead.id, senderProfileId)
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json(
    { lead: { ...lead, score: score.total, verdict: score.verdict }, score, leadId: lead.id },
    { status: 201 },
  )
}
