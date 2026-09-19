import { NextResponse } from 'next/server'
import { safeErrorResponse } from '@/lib/errors'
import { createScoutStore } from '@/lib/store'
import { computeScore } from '@/lib/score/rubric'
import type { SignalId, ExtractedLead, RoleCategory, MarketRegion } from '@/lib/domain/types'
import { classifyRoleFromTitle, mapLocationToRegion } from '@/lib/leads/targeting'
import { evaluateProspectQualification } from '@/lib/prospect/qualification-gate'

/**
 * Save Prospect as Lead
 *
 * Converts an ephemeral prospect check into a persisted lead.
 * Reuses already-extracted data — no re-extraction.
 *
 * Expected body: the extracted prospect data + prospect score + connection note + sender.
 */

export async function POST(request: Request) {
  try {
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

    const signalTypeRaw = Number(body.signalType)
    if (!Number.isInteger(signalTypeRaw) || signalTypeRaw < 1 || signalTypeRaw > 7) {
      return NextResponse.json({ error: 'signalType is required and must be 1 to 7.' }, { status: 400 })
    }
    const signalType = signalTypeRaw as SignalId

    const signalEvidence = typeof body.signalEvidence === 'string' ? body.signalEvidence.trim() : ''
    if (!signalEvidence) {
      return NextResponse.json({ error: 'Signal evidence is required.' }, { status: 400 })
    }

    const allowPotentialDuplicate = body.allowPotentialDuplicate === true

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
        && Number.isFinite(body.extractionConfidence)
        ? Math.max(0, Math.min(100, Math.round(body.extractionConfidence)))
        : 50,
      confidenceNotes: Array.isArray(body.confidenceNotes)
        ? (body.confidenceNotes as unknown[]).filter((n): n is string => typeof n === 'string' && n.trim().length > 0).slice(0, 8)
        : [],
      verbatimQuote: typeof body.verbatimQuote === 'string' && body.verbatimQuote.trim() ? body.verbatimQuote.trim() : null,
      tags: Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    }

    const qualification = evaluateProspectQualification({
      extracted,
      rawText: typeof body.rawInput === 'string' ? body.rawInput : null,
    })
    if (!qualification.qualificationEligibility) {
      return NextResponse.json(
        {
          error: 'NOT ENOUGH INFORMATION. Relay needs richer person, company, and opportunity context before creating a lead.',
          qualification,
        },
        { status: 422 },
      )
    }

    let store
    try {
      store = await createScoutStore()
    } catch {
      return NextResponse.json(
        { error: 'Not signed in.' },
        { status: 401 },
      )
    }

    const rulebook = await store.getRulebook()
    if (!rulebook) {
      return NextResponse.json({ error: 'Organization rulebook not found.' }, { status: 500 })
    }

    const score = computeScore(extracted, rulebook)

    const canonical = body.canonical && typeof body.canonical === 'object'
      ? body.canonical as Record<string, unknown>
      : null
    const canonicalScore = typeof body.canonicalScore === 'number' ? body.canonicalScore : null
    const canonicalQualification = typeof canonical?.qualification === 'string' ? canonical.qualification : null
    const verdictFromCanonical =
      canonicalQualification === 'strong' || canonicalQualification === 'worth_pursuing'
        ? 'send'
        : canonicalQualification === 'maybe'
          ? 'research_more'
          : canonicalQualification === 'skip'
            ? 'skip'
            : null
    const verdict = verdictFromCanonical ?? score.verdict

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
      score: score.total,
      verdict,
      canonicalScore,
      canonicalIntelligence: canonical,
      titleRaw: extracted.titleRaw ?? extracted.title,
      locationRaw: extracted.locationRaw ?? null,
      roleCategory: extracted.roleCategory ?? classifyRoleFromTitle(extracted.title),
      marketRegion: extracted.marketRegion ?? mapLocationToRegion(extracted.locationRaw ?? null),
      extractionConfidence: extracted.extractionConfidence ?? 50,
      assignedProfileId: senderProfileId,
      allowPotentialDuplicate,
      extractionProfile: {
        aboutSummary: extracted.aboutSummary ?? null,
        experienceSummary: extracted.experienceSummary ?? null,
        recentPosts: extracted.recentPosts ?? [],
        confidenceNotes: extracted.confidenceNotes ?? [],
        prospectScore,
        prospectDimensions,
        connectionNote,
        source: 'prospect_check',
      },
    })

    if (result.blocked) {
      const duplicateKind = result.duplicateKind ?? 'hard'
      const existingLead = result.lead
      if (existingLead) {
        return NextResponse.json(
          {
            blocked: true,
            duplicate: true,
            duplicateKind,
            reason: result.reason,
            existingOwnerName: result.existingOwnerName,
            existingLeadId: existingLead.id,
            existingLeadCompany: existingLead.company,
            canCreateSeparate: duplicateKind === 'potential',
          },
          { status: 409 },
        )
      }
      return NextResponse.json(
        {
          blocked: true,
          duplicate: true,
          duplicateKind,
          reason: result.reason,
          existingOwnerName: result.existingOwnerName,
          canCreateSeparate: duplicateKind === 'potential',
        },
        { status: 409 },
      )
    }

    const lead = result.lead!

    if (connectionNote) {
      try {
        await store.saveDraft({
          leadId: lead.id,
          type: 'connection',
          draftText: connectionNote,
          modelUsed: 'prospect-check',
        })
      } catch {
        // Draft persistence is best-effort; lead creation is already committed.
      }
    }

    return NextResponse.json(
      {
        lead: {
          ...lead,
          score: lead.score ?? score.total,
          verdict: lead.verdict ?? verdict,
        },
        score,
        leadId: lead.id,
      },
      { status: 201 },
    )
  } catch (error) {
    return safeErrorResponse(
      error,
      500,
      'Lead was not created. Please try again.',
      '/api/prospect/save',
    )
  }
}
