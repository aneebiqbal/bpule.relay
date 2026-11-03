import { NextResponse } from 'next/server'
import { safeErrorResponse } from '@/lib/errors'
import { loadLeadPreview } from '@/lib/leads/preview'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Lightweight record context for the Lead preview drawer. Bounded by design:
 * no conversation bodies, no raw source, no scoring internals — those load
 * only when their tab is opened.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const preview = await loadLeadPreview(id)
    if (!preview) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    return NextResponse.json(preview)
  } catch (err) {
    return safeErrorResponse(err, 500, 'Failed to load the lead.', 'leads/[id]/preview')
  }
}
