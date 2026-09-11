import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

export async function GET() {
  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }
  const profiles = await store.listProfiles()
  return NextResponse.json({ profiles })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const platform = body.platform
  if (platform !== 'linkedin' && platform !== 'upwork') {
    return NextResponse.json(
      { error: 'platform must be linkedin or upwork.' },
      { status: 400 },
    )
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

  const profile = await store.upsertProfile({
    id: typeof body.id === 'string' ? body.id : undefined,
    platform,
    label: typeof body.label === 'string' ? body.label : null,
    profileUrl: typeof body.profileUrl === 'string' ? body.profileUrl : null,
    headline: typeof body.headline === 'string' ? body.headline : null,
    cvPath: typeof body.cvPath === 'string' ? body.cvPath : null,
  })
  return NextResponse.json({ profile })
}