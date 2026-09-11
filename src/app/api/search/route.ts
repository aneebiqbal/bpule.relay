import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = url.searchParams.get('q') ?? ''
  if (!query.trim()) {
    return NextResponse.json({ results: [] })
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

  const entityFilter = url.searchParams.get('entity') as 'lead' | 'proof' | 'upwork' | 'all' | null
  const statusFilter = url.searchParams.getAll('status')
  const signalFilter = url.searchParams.getAll('signal').map(Number).filter((n) => !Number.isNaN(n))
  const playFilter = url.searchParams.getAll('play')
  const repFilter = url.searchParams.getAll('rep')
  const dateFrom = url.searchParams.get('from')
  const dateTo = url.searchParams.get('to')
  const limit = Number(url.searchParams.get('limit') ?? '20')

  try {
    const results = await store.archiveSearch({
      query,
      entityFilter: entityFilter ?? 'all',
      statusFilter: statusFilter.length > 0 ? statusFilter : undefined,
      signalFilter: signalFilter.length > 0 ? signalFilter : undefined,
      playFilter: playFilter.length > 0 ? playFilter : undefined,
      repFilter: repFilter.length > 0 ? repFilter : undefined,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
    })
    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed.' },
      { status: 500 },
    )
  }
}
