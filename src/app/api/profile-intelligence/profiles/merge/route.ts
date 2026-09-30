import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { createServiceSupabase } from '@/lib/supabase/service'
import { executeProfileMerge, previewProfileMerge } from '@/lib/profile-intelligence/enrichment-service'
import { enrichmentErrorResponse } from '@/lib/profile-intelligence/enrichment-http'

/**
 * Safe duplicate-profile merge: Profile B (source) → Profile A (target).
 * Never runs automatically. Admin/owner only.
 *
 *   { mode: 'preview', sourceProfileId, targetProfileId }
 *     → identity check + full dry-run report (all changes rolled back) + previewToken
 *   { mode: 'execute', sourceProfileId, targetProfileId, previewToken, acknowledgeIdentityRisk? }
 *     → re-runs the dry-run, refuses if anything changed since the preview,
 *       then commits in one transaction and archives B.
 */
export async function POST(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!auth.isAdmin && !auth.isOwner) return NextResponse.json({ error: 'Only admins can merge profiles.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const sourceId = typeof body?.sourceProfileId === 'string' ? body.sourceProfileId : null
  const targetId = typeof body?.targetProfileId === 'string' ? body.targetProfileId : null
  if (!sourceId || !targetId) return NextResponse.json({ error: 'sourceProfileId and targetProfileId are required.' }, { status: 400 })

  const client = createServiceSupabase()
  try {
    if (body.mode === 'execute') {
      if (typeof body.previewToken !== 'string') return NextResponse.json({ error: 'Run a dry-run preview first.' }, { status: 400 })
      const result = await executeProfileMerge(client, {
        orgId: auth.orgId, sourceId, targetId, actorRepId: auth.repId,
        previewToken: body.previewToken, acknowledgeIdentityRisk: body.acknowledgeIdentityRisk === true,
      })
      return NextResponse.json({ merged: true, result })
    }
    return NextResponse.json(await previewProfileMerge(client, { orgId: auth.orgId, sourceId, targetId }))
  } catch (err) {
    return enrichmentErrorResponse(err, 'profile-merge')
  }
}
