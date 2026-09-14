import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { extractIdentityFromSource } from '@/lib/content/onboarding-extract'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/onboarding/extract
 * Body: { sourceText, sourceType }
 * Returns extracted identity for user confirmation
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

  const identity = extractIdentityFromSource(sourceText)

  return NextResponse.json({
    identity,
    sourceType,
  })
}
