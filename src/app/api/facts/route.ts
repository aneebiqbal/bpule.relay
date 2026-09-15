import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

export async function GET() {
  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }
  const facts = await store.listFacts()
  return NextResponse.json({ facts })
}

export async function POST(request: Request) {
  let body: { label?: string; value?: string; factType?: string; id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const label = body.label?.trim() ?? ''
  const value = body.value?.trim() ?? ''
  if (!label || !value) {
    return NextResponse.json(
      { error: 'Both label and value are required.' },
      { status: 400 },
    )
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

  try {
    const fact = await store.upsertFact({
      id: body.id,
      label,
      value,
      factType: body.factType?.trim() || null,
    })
    return NextResponse.json({ fact }, { status: body.id ? 200 : 201 })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to save fact.' },
      { status: 403 },
    )
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  let store
  try {
    store = await createScoutStore()
  } catch (err) {
    return NextResponse.json(
      { error: 'Not signed in.' },
      { status: 401 },
    )
  }

  try {
    await store.deleteFact(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to delete fact.' },
      { status: 403 },
    )
  }
}