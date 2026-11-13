import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext, can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServiceSupabase } from '@/lib/supabase/service'
import { createPostgresStorage } from '@/lib/storage/postgres-storage'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

async function loadProfileForRequest(
  store: Awaited<ReturnType<typeof createScoutStore>>,
  isAdmin: boolean,
  id: string,
) {
  if (isAdmin) {
    const profiles = await store.listAllProfiles()
    return profiles.find((p) => p.id === id) ?? null
  }
  return store.getProfile(id)
}

/**
 * Objects live in Aiven Postgres. The "signed URL" is a same-origin link back to
 * this access-checked route, so authorization is enforced on every download
 * rather than delegated to a time-limited storage signature.
 */
function objectUrl(id: string, admin: boolean): string {
  return `/api/profiles/${id}/cv?raw=1${admin ? '&admin=1' : ''}`
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const authCtx = await getAuthContext()
  if (!authCtx) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const admin = url.searchParams.get('admin') === '1'
  if (admin && !can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const profile = await loadProfileForRequest(store, admin, id)
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  if (!profile.cvPath) {
    return NextResponse.json({ signedUrl: null })
  }

  // Raw download: the profile access check above already authorized the caller.
  if (url.searchParams.get('raw') === '1') {
    const storage = createPostgresStorage(createServiceSupabase())
    const { data, error } = await storage.from('proof-cvs').download(profile.cvPath)
    if (!data) {
      return NextResponse.json(
        { error: error?.message ?? 'CV not found.' },
        { status: 404 },
      )
    }
    const filename = profile.cvPath.split('/').pop() ?? 'cv'
    return new NextResponse(data, {
      status: 200,
      headers: {
        'content-type': data.type || 'application/octet-stream',
        'content-disposition': `inline; filename="${filename}"`,
      },
    })
  }

  return NextResponse.json({ signedUrl: objectUrl(id, admin) })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const authCtx = await getAuthContext()
  if (!authCtx) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  const url = new URL(request.url)
  const admin = url.searchParams.get('admin') === '1'
  // Uploading/replacing a CV on another rep's behalf is an admin-only
  // action. Enforced here server-side, independent of the RLS/storage
  // policy checks (see supabase/storage-proof-cvs-policies.sql).
  if (admin && !can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const profile = await loadProfileForRequest(store, admin, id)
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  let file: File | null = null
  try {
    const form = await request.formData()
    file = form.get('file') instanceof File ? (form.get('file') as File) : null
  } catch {
    file = null
  }
  if (!file) {
    return NextResponse.json(
      { error: 'Attach a CV file (pdf, jpg, or png, up to 5 MB).' },
      { status: 400 },
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'CV is larger than 5 MB. Send a smaller file.' },
      { status: 400 },
    )
  }
  const ext = ALLOWED[file.type]
  if (!ext) {
    return NextResponse.json(
      { error: 'CV must be a PDF, JPG, or PNG.' },
      { status: 400 },
    )
  }

  const path = `${profile.repId}/${crypto.randomUUID()}.${ext}`
  const storage = createPostgresStorage(createServiceSupabase())
  const { error: uploadError } = await storage
    .from('proof-cvs')
    .upload(path, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })
  if (uploadError) {
    return safeErrorResponse(uploadError, 500, 'Upload failed. Please try again.', 'profiles/[id]/cv')
  }

  const updated = admin
    ? await store.upsertProfileAdmin({
        id: profile.id,
        repId: profile.repId,
        platform: profile.platform,
        label: profile.label,
        profileUrl: profile.profileUrl,
        headline: profile.headline,
        cvPath: path,
      })
    : await store.upsertProfile({
        id: profile.id,
        platform: profile.platform,
        label: profile.label,
        profileUrl: profile.profileUrl,
        headline: profile.headline,
        cvPath: path,
      })

  return NextResponse.json({ profile: updated, signedUrl: objectUrl(id, admin) })
}
