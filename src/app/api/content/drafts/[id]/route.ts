import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { status } = body as { status: string }
  if (!['draft', 'ready', 'posted', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const store = await createScoutStore()

  try {
    const draft = await store.updateContentDraftStatus(id, status as 'draft' | 'ready' | 'posted' | 'rejected')
    return NextResponse.json({ draft })
  } catch {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }
}
