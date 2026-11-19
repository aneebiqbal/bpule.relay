import { NextResponse } from 'next/server'
import { requireCronSecret, createServiceSupabase } from '@/lib/supabase/service'
import { reindexJobInventory } from '@/lib/job-discovery/inventory'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Recompute the non-destructive feed index. Never deletes job rows. */
export async function GET(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized.' }, { status: auth.status })
  const url = new URL(request.url)
  const sourceParam = url.searchParams.get('sources')
  const result = await reindexJobInventory(createServiceSupabase(), {
    sourceIds: sourceParam ? sourceParam.split(',').map((value) => value.trim()).filter(Boolean) : undefined,
    dryRun: url.searchParams.get('dryRun') === '1',
  })
  return NextResponse.json({ ok: true, ...result })
}
