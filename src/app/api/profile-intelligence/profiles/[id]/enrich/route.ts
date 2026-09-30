import { NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/service'
import { createEnrichmentRun, ENRICH_MAX_FILES, type UploadFile } from '@/lib/profile-intelligence/enrichment-service'
import { enrichmentErrorResponse, requireProfileManager } from '@/lib/profile-intelligence/enrichment-http'

export const maxDuration = 60

/** Import history for an existing profile. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: profileId } = await params
  const gate = await requireProfileManager()
  if ('response' in gate) return gate.response

  const client = createServiceSupabase()
  const { data, error } = await client
    .from('profile_enrichment_runs')
    .select('id, status, source_ids, created_at, proposed_at, applied_at, error_message, audit, proposal->summary')
    .eq('profile_id', profileId)
    .eq('organization_id', gate.auth.orgId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return enrichmentErrorResponse(error, 'profile-enrich:list')
  return NextResponse.json({ runs: data ?? [] })
}

/**
 * Add / Import Data into an EXISTING profile. Uploads sources and creates an
 * enrichment run. Nothing on the profile changes until the diff is applied.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: profileId } = await params
  const gate = await requireProfileManager()
  if ('response' in gate) return gate.response

  let files: File[]
  try {
    const form = await request.formData()
    files = form.getAll('files').filter((f): f is File => f instanceof File)
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }
  if (files.length > ENRICH_MAX_FILES) return NextResponse.json({ error: `Maximum ${ENRICH_MAX_FILES} files per import.` }, { status: 400 })

  try {
    const uploads: UploadFile[] = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })))
    const result = await createEnrichmentRun(createServiceSupabase(), {
      orgId: gate.auth.orgId, profileId, actorRepId: gate.auth.repId, files: uploads,
    })
    return NextResponse.json(result)
  } catch (err) {
    return enrichmentErrorResponse(err, 'profile-enrich:create')
  }
}
