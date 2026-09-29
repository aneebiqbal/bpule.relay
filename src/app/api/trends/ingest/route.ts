import { NextResponse } from 'next/server'
import { createServiceSupabase, requireCronSecret } from '@/lib/supabase/service'
import type { TrendStore } from '@/lib/trends/types'
import { ingestAllSources } from '@/lib/trends/engine'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = requireCronSecret(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: auth.status })
  }

  const serviceClient = createServiceSupabase()

  const storeAdapter: TrendStore = {
    async getSource(sourceKey: string) {
      const { data } = await serviceClient
        .from('trend_sources')
        .select('id')
        .eq('source_key', sourceKey)
        .maybeSingle()
      return data ? { id: data.id as string } : null
    },
    async itemExists(fingerprint: string) {
      const { data } = await serviceClient
        .from('trend_items')
        .select('id')
        .eq('content_fingerprint', fingerprint)
        .maybeSingle()
      return !!data
    },
    async saveItem(item) {
      await serviceClient.from('trend_items').insert({
        source_id: item.sourceId,
        source_item_id: item.sourceItemId,
        url: item.url ?? null,
        title: item.title,
        excerpt: item.excerpt ?? null,
        author: item.author ?? null,
        published_at: item.publishedAt ?? null,
        metrics: item.metrics,
        topics: item.topics,
        content_fingerprint: item.contentFingerprint,
        evidence_quality: item.evidenceQuality,
        expires_at: item.expiresAt,
      })
    },
    async updateHealth(sourceKey, success, error) {
      const now = new Date().toISOString()
      if (success) {
        await serviceClient
          .from('trend_sources')
          .update({ last_fetched_at: now, last_success_at: now, consecutive_failures: 0, last_error: null, updated_at: now })
          .eq('source_key', sourceKey)
      } else {
        const { data: current } = await serviceClient
          .from('trend_sources')
          .select('consecutive_failures')
          .eq('source_key', sourceKey)
          .maybeSingle()
        await serviceClient
          .from('trend_sources')
          .update({
            last_fetched_at: now,
            consecutive_failures: ((current?.consecutive_failures as number) ?? 0) + 1,
            last_error: error ?? null,
            updated_at: now,
          })
          .eq('source_key', sourceKey)
      }
    },
  }

  const body = await request.json().catch(() => ({}))
  const sourceKeys = body.sourceKeys as string[] | undefined
  const results = await ingestAllSources(storeAdapter, sourceKeys)

  return NextResponse.json({ ok: true, results })
}
