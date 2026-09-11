import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Not signed in.' },
      { status: 401 },
    )
  }
  await store.deleteProofItem(id)
  return NextResponse.json({ ok: true })
}