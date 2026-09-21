import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { classifyProofTags } from '@/lib/ai/proof-tags'
import { embedText } from '@/lib/ai/embed'
import { getAuthContext, can } from '@/lib/auth/organization'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const profileId = url.searchParams.get('profileId')
  const admin = url.searchParams.get('admin') === '1'
  if (!profileId) {
    return NextResponse.json(
      { error: 'profileId is required.' },
      { status: 400 },
    )
  }

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

  if (admin) {
    // Reading another rep's proof items unredacted is an admin-only action.
    // Enforced here server-side, independent of the RLS policy.
    if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }
    const items = await store.listProofItemsAdmin(profileId)
    return NextResponse.json({ items })
  }

  const items = await store.listProofItems(profileId)
  return NextResponse.json({ items })
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const profileId = typeof body.profileId === 'string' ? body.profileId : ''
  const projectSummary =
    typeof body.projectSummary === 'string' ? body.projectSummary.trim() : ''
  if (!profileId || !projectSummary) {
    return NextResponse.json(
      { error: 'profileId and projectSummary are required.' },
      { status: 400 },
    )
  }

  const permissionOnFile = Boolean(body.permissionOnFile)
  let clientName =
    typeof body.clientName === 'string' && body.clientName.trim()
      ? body.clientName.trim()
      : null
  // Enforced above the store as well as inside it: no permission, no name.
  if (!permissionOnFile) clientName = null

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

  const admin = Boolean(body.admin)
  if (admin && !can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  const owned = admin
    ? (await store.listAllProfiles()).find((p) => p.id === profileId) ?? null
    : await store.getProfile(profileId)
  if (!owned) {
    return NextResponse.json(
      { error: 'Profile not found or not yours.' },
      { status: 404 },
    )
  }

  let tags = Array.isArray(body.tags)
    ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : []
  if (tags.length === 0) {
    // One cheap classification call, cached forever on the row.
    tags = await classifyProofTags(
      `${projectSummary}\n${typeof body.reviewQuote === 'string' ? body.reviewQuote : ''}`,
    )
  }

  // One-time embedding cost per proof item. Not per-draft.
  const embeddingText = `${projectSummary} ${Array.isArray(tags) ? tags.join(' ') : ''}`
  let embedding: number[] | null = null
  try {
    embedding = await embedText(embeddingText)
  } catch {
    // Embedding is optional; tag matching still works as fallback.
  }

  const item = admin
    ? await store.upsertProofItemAdmin({
        id: typeof body.id === 'string' ? body.id : undefined,
        profileId,
        clientNamed: Boolean(body.clientNamed),
        clientName,
        permissionOnFile,
        projectSummary,
        reviewQuote: typeof body.reviewQuote === 'string' ? body.reviewQuote : null,
        tags,
        embedding,
      })
    : await store.upsertProofItem({
        id: typeof body.id === 'string' ? body.id : undefined,
        profileId,
        clientNamed: Boolean(body.clientNamed),
        clientName,
        permissionOnFile,
        projectSummary,
        reviewQuote: typeof body.reviewQuote === 'string' ? body.reviewQuote : null,
        tags,
        embedding,
      })
  return NextResponse.json({ item })
}