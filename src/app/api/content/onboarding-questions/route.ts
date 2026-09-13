import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { generateOnboardingQuestions } from '@/lib/ai/onboarding-questions'

export const dynamic = 'force-dynamic'

/**
 * POST /api/content/onboarding-questions — given a pasted profile/bio,
 * generate a short set of tap-to-select questions relevant to this
 * person's field. Empty list means the caller should fall back to
 * free-text-only onboarding (no host configured, or nothing to go on).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const profileInput = typeof body?.profileInput === 'string' ? body.profileInput : ''
  if (!profileInput.trim()) return NextResponse.json({ error: 'profileInput is required' }, { status: 400 })

  try {
    const questions = await generateOnboardingQuestions(profileInput)
    return NextResponse.json({ questions })
  } catch {
    return NextResponse.json({ questions: [] })
  }
}
