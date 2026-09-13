import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { extractProfileTopics, extractFromPastPosts } from '@/lib/ai/content-profile'

export const dynamic = 'force-dynamic'

/**
 * GET /api/content/personas — list current rep's personas
 * POST /api/content/personas — create a new persona
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const store = await createScoutStore()
  const personas = await store.listContentPersonas(user.rep.id)
  return NextResponse.json({ personas })
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const { displayName, platforms, humorStyle, valuesAndOpinions, admiredExamples, profileInput, pastPostsInput } = body as {
      displayName: string
      platforms: string[]
      humorStyle?: string
      valuesAndOpinions?: string[]
      admiredExamples?: string[]
      profileInput?: string
      pastPostsInput?: string
    }
    if (!displayName?.trim()) return NextResponse.json({ error: 'displayName is required' }, { status: 400 })
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return NextResponse.json({ error: 'platforms must be a non-empty array' }, { status: 400 })
    }

    const validPlatforms = ['linkedin', 'x']
    const filtered = platforms.filter((p) => validPlatforms.includes(p))
    if (filtered.length === 0) return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })

    const store = await createScoutStore()
    const profileText = typeof profileInput === 'string' ? profileInput.trim() : ''
    const pastPostsText = typeof pastPostsInput === 'string' ? pastPostsInput.trim() : ''

    // Real past posts are the stronger signal — they seed voice and topics
    // directly from ground truth, more accurately than a bio or Q&A answers.
    // When given, they take priority; a pasted bio still supplements topics.
    const [pastPostsExtracted, profileExtracted] = await Promise.all([
      pastPostsText.length > 0 ? extractFromPastPosts(pastPostsText) : null,
      profileText.length > 0 ? extractProfileTopics(profileText) : null,
    ])

    const mergedTopics = [
      ...(pastPostsExtracted?.likelyTopics ?? []),
      ...(profileExtracted?.likelyTopics ?? []),
    ]
    const seenTopicNames = new Set<string>()
    const uniqueTopics = mergedTopics.filter((t) => {
      const key = t.name.toLowerCase()
      if (seenTopicNames.has(key)) return false
      seenTopicNames.add(key)
      return true
    })

    const mergedValues = [
      ...(Array.isArray(valuesAndOpinions)
        ? valuesAndOpinions.map((v) => String(v).trim()).filter(Boolean)
        : []),
      ...(pastPostsExtracted?.valuesAndOpinions ?? []),
      ...(profileExtracted?.valuesAndOpinions ?? []),
    ]
    const uniqueValues = [...new Set(mergedValues)]

    const resolvedHumorStyle = humorStyle?.trim() || pastPostsExtracted?.humorStyle || ''
    const profileSummary = pastPostsExtracted?.profileSummary || profileExtracted?.profileSummary || ''

    const persona = await store.createContentPersona({
      repId: user.rep.id,
      displayName: displayName.trim(),
      platforms: filtered as ('linkedin' | 'x')[],
      humorStyle: resolvedHumorStyle,
      valuesAndOpinions: uniqueValues,
      admiredExamples: Array.isArray(admiredExamples)
        ? admiredExamples.map((v) => String(v).trim()).filter(Boolean)
        : [],
    })

    for (const topic of uniqueTopics.slice(0, 6)) {
      await store.createTopicCluster({
        personaId: persona.id,
        clusterName: topic.name,
        description: topic.description,
        sourceType: 'profile',
      })
    }

    return NextResponse.json({ persona, inferredTopics: uniqueTopics, profileSummary, seededFromPastPosts: Boolean(pastPostsExtracted) })
  } catch (err: unknown) {
    // Supabase errors are objects with { message, code, details, hint }
    const e = err as { message?: string; code?: string; details?: unknown; hint?: unknown }
    const message = e?.message ?? (err instanceof Error ? err.message : JSON.stringify(err))
    console.error('[content/api] POST /personas failed:', { message, code: e?.code, details: e?.details, raw: err })
    if (message?.includes('does not exist') || message?.includes('relation')) {
      return NextResponse.json(
        { error: 'Content tables not yet created.', detail: message, migration: '0018_personal_content_engine.sql' },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: 'Failed to create persona', detail: message, code: e?.code, details: e?.details },
      { status: 500 },
    )
  }
}
