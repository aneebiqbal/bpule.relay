import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { extractIdentityFromSource, type ExtractedIdentity } from '@/lib/content/onboarding-extract'
import { extractIdentityWithAI } from '@/lib/content/onboarding-ai-extract'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/onboarding/extract
 * Body: { sourceText, sourceType }
 * Returns extracted identity for user confirmation
 * Uses AI for rich extraction when text is available, deterministic for short text
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const sourceText = body?.sourceText as string | undefined
  const sourceType = (body?.sourceType as string) || 'bio'

  if (!sourceText || sourceText.trim().length < 20) {
    return NextResponse.json({ error: 'sourceText required (min 20 chars)' }, { status: 400 })
  }

  // Use AI extraction for rich text (LinkedIn bio, CV, etc.)
   if (sourceText.length > 100) {
     try {
       const identity = await extractIdentityWithAI(sourceText)
       // Merge deterministic fallback for any empty arrays AI missed
       const deterministic = extractIdentityFromSource(sourceText)
       const merged = {
         ...identity,
         territories: identity.territories?.length ? identity.territories : deterministic.territories,
         audiences: identity.audiences?.length ? identity.audiences : deterministic.audiences,
         industries: identity.industries?.length ? identity.industries : deterministic.industries,
         technologies: identity.technologies?.length ? identity.technologies : deterministic.technologies,
         contentGoals: identity.contentGoals?.length ? identity.contentGoals : deterministic.contentGoals,
         rawText: deterministic.rawText,
       }
       return NextResponse.json({
         identity: merged,
         sourceType,
         extractedWithAI: true,
       })
     } catch (err) {
       console.error('[onboarding/extract] AI extraction failed, falling back to deterministic:', err)
       // Fall through to deterministic extraction
     }
   }

  // Deterministic fallback for short text or AI failure
  try {
    const identity = extractIdentityFromSource(sourceText)
    return NextResponse.json({
      identity,
      sourceType,
      extractedWithAI: false,
    })
  } catch (err) {
    console.error('[onboarding/extract] deterministic extraction failed:', err)
    return NextResponse.json({ error: 'Failed to extract identity from source. Please try shorter or simpler text.' }, { status: 422 })
  }
}
