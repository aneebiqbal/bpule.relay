import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServiceSupabase } from '@/lib/supabase/service'
import { profileAccess } from '@/lib/profile-intelligence/access'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!profileAccess(authCtx).canManage) return NextResponse.json({ error: 'Only admins and managers can manage profiles.' }, { status: 403 })

  const client = createServiceSupabase()

  const { data: batch, error: batchError } = await client
    .from('profile_import_batches')
    .select('*')
    .eq('id', id)
    .eq('organization_id', authCtx.orgId)
    .single()

  if (batchError || !batch) {
    return NextResponse.json({ error: 'Batch not found.' }, { status: 404 })
  }

  const { data: sources } = await client
    .from('profile_sources')
    .select('*')
    .eq('import_batch_id', id)
    .order('uploaded_at', { ascending: true })

  return NextResponse.json({
    batch,
    sources: sources ?? [],
  })
}
