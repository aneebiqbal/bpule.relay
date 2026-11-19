import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { getJobDetail, transitionApplication, upsertApplication } from '@/lib/job-discovery/service'

export const dynamic = 'force-dynamic'

const STATUSES = ['draft', 'saved', 'reviewed', 'prepared', 'applied', 'replied', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']
const METHODS = ['manual', 'external', 'upwork', 'linkedin', 'email']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const profileId = typeof body.profileId === 'string' ? body.profileId : ''
  const status = typeof body.status === 'string' && STATUSES.includes(body.status) ? body.status : 'draft'
  const method = typeof body.method === 'string' && METHODS.includes(body.method) ? body.method : 'manual'
  if (!profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })

  const detail = await getJobDetail(store.getSupabaseClient(), id)
  if (!detail) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })

  const applicationId = await upsertApplication(store.getSupabaseClient(), auth.orgId, {
    jobId: id,
    profileId,
    repId: auth.repId,
    accountId: typeof body.accountId === 'string' ? body.accountId : null,
    status,
    method,
    destinationUrl: typeof body.destinationUrl === 'string' ? body.destinationUrl : ((detail.apply_url as string | null) ?? null),
    notes: typeof body.notes === 'string' ? body.notes : '',
    reminderAt: typeof body.reminderAt === 'string' ? body.reminderAt : null,
  })
  return NextResponse.json({ ok: true, applicationId, status })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  await params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : ''
  const status = typeof body.status === 'string' ? body.status : ''
  if (!applicationId || !STATUSES.includes(status)) {
    return NextResponse.json({ error: 'applicationId and a valid status are required.' }, { status: 400 })
  }
  await transitionApplication(store.getSupabaseClient(), auth.orgId, applicationId, status, auth.repId, typeof body.note === 'string' ? body.note : '')
  return NextResponse.json({ ok: true, status })
}
