import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { classifyProofTags } from '@/lib/ai/proof-tags'
import { embedText } from '@/lib/ai/embed'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const profileId = url.searchParams.get('profileId')
  if (!profileId) {
    return NextResponse.json(
      { error: 'profileId is required.' },
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

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }

  const owned = await store.getProfile(profileId)
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
  const embeddingText = `${projectSummary} ${tags.join(' ')}`
  let embedding: number[] | null = null
  try {
    embedding = await embedText(embeddingText)
  } catch {
    // Embedding is optional; tag matching still works as fallback.
  }

  const item = await store.upsertProofItem({
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