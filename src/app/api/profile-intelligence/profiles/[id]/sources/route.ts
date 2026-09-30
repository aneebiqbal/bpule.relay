import { NextResponse } from 'next/server'

/**
 * Retired. This endpoint merged extracted data straight into a profile with no
 * review, no provenance and no transaction (and could update source rows of
 * other profiles that shared a file hash).
 *
 * Use the enrichment flow instead — dry-run diff, human review, one
 * transaction, same profile.id:
 *   POST /api/profile-intelligence/profiles/:id/enrich
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return NextResponse.json(
    { error: 'This endpoint was retired. Use the Add / Import Data flow.', use: `/api/profile-intelligence/profiles/${id}/enrich` },
    { status: 410 },
  )
}
