import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { createServerSupabase } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) {
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
  if (admin && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
  }

  const profile = await loadProfileForRequest(store, admin, id)
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  if (!profile.cvPath) {
    return NextResponse.json({ signedUrl: null })
  }

  const client = await createServerSupabase()
  const { data: signed } = await client.storage
    .from('proof-cvs')
    .createSignedUrl(profile.cvPath, 60 * 60)
  return NextResponse.json({ signedUrl: signed?.signedUrl ?? null })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const user = await getCurrentUser()
  if (!user) {
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
  if (admin && user.rep.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
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

  const client = await createServerSupabase()
  const path = `${profile.repId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await client.storage
    .from('proof-cvs')
    .upload(path, file, { cacheControl: '3600', upsert: false })
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

  const { data: signed } = await client.storage
    .from('proof-cvs')
    .createSignedUrl(path, 60 * 60)
  const signedUrl = signed?.signedUrl ?? null

  return NextResponse.json({ profile: updated, signedUrl })
}